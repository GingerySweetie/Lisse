import { db } from '../../db';
import type { Conversation, Message, Role } from '../../types';
import { newId } from '../id';
import type { ImportOptions, ImportResult } from './chatgpt';

interface ClaudeContentBlock {
  type?: string;
  text?: string;
}

interface ClaudeMessage {
  uuid?: string;
  text?: string;
  content?: ClaudeContentBlock[] | string;
  sender?: string;
  created_at?: string;
}

interface ClaudeConversation {
  uuid?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
  chat_messages?: ClaudeMessage[];
}

/**
 * Parse and import a Claude `conversations.json` export.
 * Claude exports do not expose branch tree; messages are linearized.
 */
export async function importClaude(
  fileText: string,
  opts: ImportOptions = {},
): Promise<ImportResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(fileText);
  } catch (err) {
    throw new Error(
      `不是合法的 JSON：${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const list = extractConversations(raw);
  const result: ImportResult = {
    importedCount: 0,
    skippedCount: 0,
    conversationIds: [],
    errors: [],
  };

  for (const conv of list) {
    try {
      const id = await importOneClaude(conv, opts);
      if (id) {
        result.importedCount++;
        result.conversationIds.push(id);
      } else {
        result.skippedCount++;
      }
    } catch (err) {
      result.errors.push(
        `${conv.name ?? conv.uuid ?? '(无标题)'}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  return result;
}

function extractConversations(raw: unknown): ClaudeConversation[] {
  if (Array.isArray(raw)) return raw as ClaudeConversation[];
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.conversations)) {
      return obj.conversations as ClaudeConversation[];
    }
    if ('chat_messages' in obj) return [raw as ClaudeConversation];
  }
  throw new Error('文件结构不像 Claude 导出（找不到 conversations 或 chat_messages）');
}

async function importOneClaude(
  conv: ClaudeConversation,
  opts: ImportOptions,
): Promise<string | null> {
  const sourceId = conv.uuid;
  if (sourceId) {
    const existing = await db.conversations
      .where({ source: 'claude' })
      .filter((c) => c.sourceId === sourceId)
      .first();
    if (existing) return null;
  }

  const chats = conv.chat_messages ?? [];
  if (chats.length === 0) return null;

  const conversationId = newId();
  const messages: Message[] = [];
  let parentId: string | null = null;

  for (const m of chats) {
    const role = normalizeSender(m.sender);
    if (!role) continue;
    const text = extractText(m);
    const id = newId();
    messages.push({
      id,
      conversationId,
      parentId,
      role,
      content: text,
      status: 'done',
      createdAt: parseTime(m.created_at) ?? Date.now(),
    });
    if (parentId) {
      const parent = messages.find((mm) => mm.id === parentId);
      if (parent) parent.activeChildId = id;
    }
    parentId = id;
  }

  if (messages.length === 0) return null;

  const now = Date.now();
  const conversation: Conversation = {
    id: conversationId,
    title: (conv.name?.trim() || '从 Claude 导入').slice(0, 80),
    currentLeafId: messages[messages.length - 1].id,
    personaId: opts.personaId,
    defaultEndpointId: opts.defaultEndpointId,
    defaultModel: opts.defaultModel,
    sourceId,
    source: 'claude',
    createdAt: parseTime(conv.created_at) ?? now,
    updatedAt: parseTime(conv.updated_at) ?? now,
  };

  await db.transaction('rw', db.conversations, db.messages, async () => {
    await db.conversations.add(conversation);
    await db.messages.bulkAdd(messages);
  });

  return conversationId;
}

function normalizeSender(sender: string | undefined): Role | null {
  if (!sender) return null;
  if (sender === 'human' || sender === 'user') return 'user';
  if (sender === 'assistant' || sender === 'claude') return 'assistant';
  if (sender === 'system') return 'system';
  return null;
}

function extractText(m: ClaudeMessage): string {
  if (typeof m.text === 'string') return m.text;
  const c = m.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .map((b) => (typeof b.text === 'string' ? b.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

function parseTime(s: string | undefined): number | null {
  if (!s) return null;
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : parsed;
}
