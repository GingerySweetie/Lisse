import { db, getSettings } from '../../db';
import type {
  Conversation,
  Endpoint,
  MemoryFact,
  Message,
  Persona,
} from '../../types';
import { newId } from '../id';
import { embed } from '../../api/embedding';
import { runExtractorBatch, type RawFact } from './extract';

/** Per-message char cap inside each batch block (keeps the prompt bounded
 *  even when the user's been writing literary passages). */
const PER_MSG_CHAR_CAP = 2000;

export interface BackfillProgress {
  /** Conversation currently being processed. */
  conversationId: string;
  /** Index of the conversation in the overall queue (0-based). */
  conversationIndex: number;
  /** Total conversations queued. */
  conversationTotal: number;
  /** Batches completed for this conversation. */
  batchDone: number;
  /** Total batches for this conversation. */
  batchTotal: number;
  /** Facts added so far across the whole run. */
  factsAddedTotal: number;
  /** Phase label for the UI. */
  phase: 'extracting' | 'embedding' | 'done' | 'skipped' | 'error';
  errorMessage?: string;
}

export interface BackfillResult {
  conversationId: string;
  factsAdded: number;
  batches: number;
  skipped?: boolean;
  errorMessage?: string;
}

/**
 * Run the extractor over a list of conversations in sequence, scoped to one
 * persona. Sets `conversation.personaId` if missing so the conversation lines
 * up with future live extraction.
 *
 * Each conversation is sliced into batches of `msgsPerBatch` chronological
 * non-system messages, formatted as [USER]/[<persona>] blocks, and sent to
 * the extractor once per batch. Resulting facts are embedded in one call per
 * batch and stored against the chosen persona's memory pool.
 */
export async function backfillConversations(args: {
  conversations: Conversation[];
  persona: Persona;
  msgsPerBatch?: number;
  signal?: AbortSignal;
  onProgress?: (p: BackfillProgress) => void;
}): Promise<BackfillResult[]> {
  const {
    conversations,
    persona,
    msgsPerBatch = 16,
    signal,
    onProgress,
  } = args;

  const settings = await getSettings();
  const extractorEp = settings.extractorEndpointId
    ? await db.endpoints.get(settings.extractorEndpointId)
    : undefined;
  const extractorModel = settings.extractorModel;
  const embeddingEp = settings.embeddingEndpointId
    ? await db.endpoints.get(settings.embeddingEndpointId)
    : undefined;
  const embeddingModel = settings.embeddingModel;
  if (!extractorEp || !extractorModel) {
    throw new Error('未配置事实抽取 endpoint / 模型，先去设置里选。');
  }
  if (!embeddingEp || !embeddingModel) {
    throw new Error('未配置嵌入 endpoint / 模型，先去设置里选。');
  }

  const results: BackfillResult[] = [];
  let factsAddedTotal = 0;

  for (let ci = 0; ci < conversations.length; ci++) {
    if (signal?.aborted) break;
    const conv = conversations[ci];
    try {
      const messages = await db.messages
        .where({ conversationId: conv.id })
        .sortBy('createdAt');
      const batches = chunkMessages(messages, msgsPerBatch);

      // No usable content → mark as backfilled (so it doesn't sit in the
      // UI forever) and move on.
      if (batches.length === 0) {
        await markBackfilled(conv, persona.id);
        onProgress?.({
          conversationId: conv.id,
          conversationIndex: ci,
          conversationTotal: conversations.length,
          batchDone: 0,
          batchTotal: 0,
          factsAddedTotal,
          phase: 'skipped',
        });
        results.push({ conversationId: conv.id, factsAdded: 0, batches: 0, skipped: true });
        continue;
      }

      let convFacts = 0;
      for (let bi = 0; bi < batches.length; bi++) {
        if (signal?.aborted) break;
        const block = formatBlock(batches[bi], persona.name);
        onProgress?.({
          conversationId: conv.id,
          conversationIndex: ci,
          conversationTotal: conversations.length,
          batchDone: bi,
          batchTotal: batches.length,
          factsAddedTotal,
          phase: 'extracting',
        });
        const raw = await runExtractorBatch(extractorEp, extractorModel, {
          personaName: persona.name,
          block,
          signal,
        });
        if (raw.length === 0) continue;

        onProgress?.({
          conversationId: conv.id,
          conversationIndex: ci,
          conversationTotal: conversations.length,
          batchDone: bi,
          batchTotal: batches.length,
          factsAddedTotal,
          phase: 'embedding',
        });
        const added = await embedAndStore({
          facts: raw,
          persona,
          conversation: conv,
          batchMessages: batches[bi],
          embeddingEp,
          embeddingModel,
        });
        convFacts += added;
        factsAddedTotal += added;
      }

      await markBackfilled(conv, persona.id);
      onProgress?.({
        conversationId: conv.id,
        conversationIndex: ci,
        conversationTotal: conversations.length,
        batchDone: batches.length,
        batchTotal: batches.length,
        factsAddedTotal,
        phase: 'done',
      });
      results.push({ conversationId: conv.id, factsAdded: convFacts, batches: batches.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onProgress?.({
        conversationId: conv.id,
        conversationIndex: ci,
        conversationTotal: conversations.length,
        batchDone: 0,
        batchTotal: 0,
        factsAddedTotal,
        phase: 'error',
        errorMessage: msg,
      });
      results.push({
        conversationId: conv.id,
        factsAdded: 0,
        batches: 0,
        errorMessage: msg,
      });
    }
  }

  return results;
}

async function markBackfilled(conv: Conversation, personaId: string) {
  await db.conversations.update(conv.id, {
    personaId: conv.personaId ?? personaId,
    memoryBackfilledAt: Date.now(),
    updatedAt: Date.now(),
  });
}

/** Drop system messages, then chunk chronologically into N-message blocks. */
function chunkMessages(messages: Message[], size: number): Message[][] {
  const filtered = messages.filter((m) => m.role !== 'system' && m.content.trim());
  const out: Message[][] = [];
  for (let i = 0; i < filtered.length; i += size) {
    out.push(filtered.slice(i, i + size));
  }
  return out;
}

function formatBlock(messages: Message[], personaName: string): string {
  return messages
    .map((m) => {
      const label = m.role === 'user' ? 'USER' : personaName;
      const body = m.content.length > PER_MSG_CHAR_CAP
        ? `${m.content.slice(0, PER_MSG_CHAR_CAP)}…`
        : m.content;
      return `[${label}]\n${body}`;
    })
    .join('\n\n');
}

async function embedAndStore(args: {
  facts: RawFact[];
  persona: Persona;
  conversation: Conversation;
  batchMessages: Message[];
  embeddingEp: Endpoint;
  embeddingModel: string;
}): Promise<number> {
  const { facts, persona, conversation, batchMessages, embeddingEp, embeddingModel } = args;
  const { vectors } = await embed({
    endpoint: embeddingEp,
    model: embeddingModel,
    inputs: facts.map((f) => f.text),
  });
  // Anchor each fact to the last assistant message in the batch, or fall
  // back to the last message overall. Purely for traceability in the UI.
  const anchor =
    [...batchMessages].reverse().find((m) => m.role === 'assistant') ??
    batchMessages[batchMessages.length - 1];

  const now = Date.now();
  const rows: MemoryFact[] = facts.map((f, i) => ({
    id: newId(),
    personaId: persona.id,
    conversationId: conversation.id,
    messageId: anchor.id,
    text: f.text,
    category: f.category,
    embedding: vectors[i],
    embeddingModel,
    createdAt: now + i,
    updatedAt: now + i,
  }));
  await db.memoryFacts.bulkAdd(rows);
  return rows.length;
}
