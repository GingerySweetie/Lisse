import { db } from '../db';
import type { Conversation, Endpoint, Message } from '../types';
import { newId } from './id';
import { getActiveBranch } from './branch';
import { streamChat, type ChatTurn } from '../api';

export interface SendOptions {
  conversation: Conversation;
  endpoint: Endpoint;
  model: string;
  userText: string;
  /** Optional system prompt (per-conversation/persona override). */
  system?: string;
  /** Called on every token chunk; useful for UI streaming. */
  onDelta?: (delta: string, assistantMessageId: string) => void;
  signal?: AbortSignal;
}

export interface SendResult {
  userMessage: Message;
  assistantMessage: Message;
}

export async function sendMessage(opts: SendOptions): Promise<SendResult> {
  const { conversation, endpoint, model, userText, system, onDelta, signal } = opts;
  const now = Date.now();

  const branch = await getActiveBranch(conversation);
  const parentId = branch.at(-1)?.id ?? null;

  const userMessage: Message = {
    id: newId(),
    conversationId: conversation.id,
    parentId,
    role: 'user',
    content: userText,
    status: 'done',
    endpointId: endpoint.id,
    model,
    createdAt: now,
  };
  const assistantMessage: Message = {
    id: newId(),
    conversationId: conversation.id,
    parentId: userMessage.id,
    role: 'assistant',
    content: '',
    status: 'streaming',
    endpointId: endpoint.id,
    model,
    createdAt: now + 1,
  };

  // Persist user message + assistant placeholder, link tree pointers.
  await db.transaction(
    'rw',
    db.messages,
    db.conversations,
    async () => {
      await db.messages.bulkAdd([userMessage, assistantMessage]);
      if (parentId) {
        await db.messages.update(parentId, { activeChildId: userMessage.id });
      }
      await db.messages.update(userMessage.id, {
        activeChildId: assistantMessage.id,
      });
      await db.conversations.update(conversation.id, {
        currentLeafId: assistantMessage.id,
        updatedAt: now,
        ...(branch.length === 0 && { title: deriveTitle(userText) }),
        defaultEndpointId: endpoint.id,
        defaultModel: model,
      });
    },
  );

  // Build messages payload for the API: existing branch + new user message.
  const turns: ChatTurn[] = [];
  if (system) turns.push({ role: 'system', content: system });
  for (const m of branch) {
    if (m.role === 'system' || m.role === 'user' || m.role === 'assistant') {
      if (m.content) turns.push({ role: m.role, content: m.content });
    }
  }
  turns.push({ role: 'user', content: userText });

  let acc = '';
  let errored = false;
  let errorMessage: string | undefined;
  let usage: Message['usage'];

  try {
    for await (const evt of streamChat({
      endpoint,
      model,
      messages: turns,
      signal,
    })) {
      if (evt.type === 'delta' && evt.delta) {
        acc += evt.delta;
        onDelta?.(evt.delta, assistantMessage.id);
      } else if (evt.type === 'error') {
        errored = true;
        errorMessage = evt.errorMessage;
        break;
      } else if (evt.type === 'done') {
        usage = evt.usage;
      }
    }
  } catch (err) {
    errored = true;
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  const finalContent = acc;
  const finalStatus: Message['status'] = errored ? 'error' : 'done';

  await db.messages.update(assistantMessage.id, {
    content: finalContent,
    status: finalStatus,
    errorMessage,
    usage,
  });
  await db.conversations.update(conversation.id, {
    updatedAt: Date.now(),
  });

  return {
    userMessage,
    assistantMessage: {
      ...assistantMessage,
      content: finalContent,
      status: finalStatus,
      errorMessage,
      usage,
    },
  };
}

export async function createConversation(opts?: {
  title?: string;
  endpointId?: string;
  model?: string;
}): Promise<Conversation> {
  const now = Date.now();
  const conv: Conversation = {
    id: newId(),
    title: opts?.title ?? '新对话',
    currentLeafId: null,
    defaultEndpointId: opts?.endpointId,
    defaultModel: opts?.model,
    source: 'native',
    createdAt: now,
    updatedAt: now,
  };
  await db.conversations.add(conv);
  return conv;
}

export async function deleteConversation(id: string): Promise<void> {
  await db.transaction('rw', db.conversations, db.messages, async () => {
    await db.messages.where({ conversationId: id }).delete();
    await db.conversations.delete(id);
  });
}

function deriveTitle(text: string): string {
  const firstLine = text.split('\n').find((l) => l.trim()) ?? text;
  const trimmed = firstLine.trim().replace(/\s+/g, ' ');
  return trimmed.length > 24 ? trimmed.slice(0, 24) + '…' : trimmed || '新对话';
}
