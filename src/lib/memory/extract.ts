import { db, getSettings } from '../../db';
import type {
  Endpoint,
  FactCategory,
  MemoryFact,
  Message,
  Persona,
} from '../../types';
import { newId } from '../id';
import { streamChat } from '../../api';
import { embed } from '../../api/embedding';

/**
 * Extract facts from the just-completed turn (user message + assistant response)
 * and store them with embeddings, scoped to the persona.
 *
 * Designed to fail soft: any error is swallowed so it never blocks the chat UI.
 */
export async function extractAndStoreFacts(args: {
  persona: Persona;
  conversationId: string;
  userMessage: Message;
  assistantMessage: Message;
}): Promise<{ added: number; error?: string }> {
  const { persona, conversationId, userMessage, assistantMessage } = args;
  try {
    const settings = await getSettings();
    if (!settings.memoryEnabled) return { added: 0 };

    const extractorEp = settings.extractorEndpointId
      ? await db.endpoints.get(settings.extractorEndpointId)
      : undefined;
    const extractorModel = settings.extractorModel;
    if (!extractorEp || !extractorModel) {
      return { added: 0, error: 'extractor not configured' };
    }

    const facts = await runExtractor(extractorEp, extractorModel, {
      personaName: persona.name,
      userText: userMessage.content,
      assistantText: assistantMessage.content,
    });
    if (facts.length === 0) return { added: 0 };

    // Embed all facts in one call.
    const embeddingEp = settings.embeddingEndpointId
      ? await db.endpoints.get(settings.embeddingEndpointId)
      : undefined;
    const embeddingModel = settings.embeddingModel;
    if (!embeddingEp || !embeddingModel) {
      return { added: 0, error: 'embedding not configured' };
    }
    const { vectors } = await embed({
      endpoint: embeddingEp,
      model: embeddingModel,
      inputs: facts.map((f) => f.text),
    });

    const now = Date.now();
    const rows: MemoryFact[] = facts.map((f, i) => ({
      id: newId(),
      personaId: persona.id,
      conversationId,
      messageId: assistantMessage.id,
      text: f.text,
      category: f.category,
      embedding: vectors[i],
      embeddingModel,
      createdAt: now + i,
      updatedAt: now + i,
    }));
    await db.memoryFacts.bulkAdd(rows);
    return { added: rows.length };
  } catch (err) {
    return {
      added: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface RawFact {
  text: string;
  category: FactCategory;
}

const EXTRACTOR_SYSTEM = `You are a memory extractor. Read the recent exchange and emit ONLY the lasting facts worth remembering across future conversations. Skip everything ephemeral (current weather, this morning's mood, today's traffic).

Output strictly a JSON object of this shape, with no surrounding text or markdown:
{
  "facts": [
    {"text": "...", "category": "user_fact" | "preference" | "relationship" | "event" | "context" | "other"}
  ]
}

Rules:
- Each fact must be self-contained (readable without context).
- Write each fact in the same language the user uses (中文优先).
- Be specific: "她在苏州一家会员店做零售/餐饮岗" not "她有工作".
- One fact per atom. Don't bundle.
- If nothing memorable happened, return {"facts": []}.
- Categories:
  · user_fact: a stable fact about the user (job, location, preferences that persist)
  · preference: things she likes/dislikes
  · relationship: facts about people in her life
  · event: a specific event worth remembering by date
  · context: ongoing situations
  · other: anything else worth keeping`;

async function runExtractor(
  endpoint: Endpoint,
  model: string,
  args: { personaName: string; userText: string; assistantText: string },
): Promise<RawFact[]> {
  const userPrompt = `Persona: ${args.personaName}

[USER]
${truncate(args.userText, 4000)}

[${args.personaName}]
${truncate(args.assistantText, 4000)}

Emit JSON now.`;

  let acc = '';
  for await (const evt of streamChat({
    endpoint,
    model,
    messages: [
      { role: 'system', content: EXTRACTOR_SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    maxTokens: 1024,
    temperature: 0.2,
  })) {
    if (evt.type === 'delta' && evt.delta) acc += evt.delta;
    else if (evt.type === 'error') {
      throw new Error(evt.errorMessage ?? 'extractor stream error');
    }
  }

  return parseFactsFromJSON(acc);
}

/**
 * Run the extractor over a pre-formatted block of multiple turns. Used by
 * the batch backfill flow over imported history.
 */
export async function runExtractorBatch(
  endpoint: Endpoint,
  model: string,
  args: { personaName: string; block: string; signal?: AbortSignal },
): Promise<RawFact[]> {
  const userPrompt = `Persona: ${args.personaName}

The block below contains multiple consecutive turns between [USER] and [${args.personaName}]. Emit every lasting fact across the whole block.

${args.block}

Emit JSON now.`;

  let acc = '';
  for await (const evt of streamChat({
    endpoint,
    model,
    messages: [
      { role: 'system', content: EXTRACTOR_SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    maxTokens: 2048,
    temperature: 0.2,
    signal: args.signal,
  })) {
    if (evt.type === 'delta' && evt.delta) acc += evt.delta;
    else if (evt.type === 'error') {
      throw new Error(evt.errorMessage ?? 'extractor stream error');
    }
  }

  return parseFactsFromJSON(acc);
}

function parseFactsFromJSON(text: string): RawFact[] {
  // Strip code fences if the model added them.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  // Find the outer JSON object.
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];
  const obj = parsed as Record<string, unknown>;
  const facts = Array.isArray(obj.facts) ? obj.facts : [];
  const out: RawFact[] = [];
  for (const f of facts) {
    if (!f || typeof f !== 'object') continue;
    const o = f as Record<string, unknown>;
    if (typeof o.text !== 'string' || !o.text.trim()) continue;
    const cat = typeof o.category === 'string' ? (o.category as string) : 'other';
    const category: FactCategory = isValidCategory(cat) ? cat : 'other';
    out.push({ text: o.text.trim(), category });
  }
  return out;
}

const VALID_CATEGORIES: FactCategory[] = [
  'user_fact',
  'preference',
  'relationship',
  'event',
  'context',
  'other',
];

function isValidCategory(c: string): c is FactCategory {
  return (VALID_CATEGORIES as string[]).includes(c);
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
