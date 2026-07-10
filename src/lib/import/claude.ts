import { db } from '../../db';
import type { Conversation, Message, Role } from '../../types';
import { newId } from '../id';
import type { ImportOptions, ImportResult } from './chatgpt';

interface ClaudeContentBlock {
  type?: string;
  text?: string;
  /** Claude extended-thinking block content (type === 'thinking'). */
  thinking?: string;
  /** Newer Claude.ai export: tool use blocks. */
  toolName?: string;
  toolInput?: unknown;
  toolMessage?: string;
  result?: unknown;
}

interface ClaudeMessage {
  uuid?: string;
  text?: string;
  /** Old format: content blocks or plain string. */
  content?: ClaudeContentBlock[] | string;
  /** New Claude.ai export format (2026+): replaces `content`. */
  contentBlocks?: ClaudeContentBlock[];
  sender?: string;
  /** Old format: snake_case timestamps. */
  created_at?: string;
  /** New Claude.ai export format: camelCase timestamps. */
  createdAt?: string;
  /** New format: attached filenames. */
  files?: string[];
  /** New format: plain-text search index (not used for import). */
  searchText?: string;
}

interface ClaudeConversation {
  uuid?: string;
  name?: string;
  /** Old format: snake_case timestamps. */
  created_at?: string;
  updated_at?: string;
  /** New Claude.ai export format: camelCase timestamps. */
  createdAt?: string;
  updatedAt?: string;
  /** Old format. */
  chat_messages?: ClaudeMessage[];
  /** New Claude.ai export format (2026+): replaces `chat_messages`. */
  messages?: ClaudeMessage[];
  /** New format: summary text (ignored on import). */
  summary?: string;
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
    // Single conversation — both old format (chat_messages) and new format (messages).
    if ('chat_messages' in obj || 'messages' in obj) {
      return [raw as ClaudeConversation];
    }
  }
  throw new Error('文件结构不像 Claude 导出（找不到 conversations、chat_messages 或 messages）');
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

  // Support both old format (chat_messages / created_at) and new format (messages / createdAt).
  const chats = conv.messages ?? conv.chat_messages ?? [];
  if (chats.length === 0) return null;

  const conversationId = newId();
  const messages: Message[] = [];
  let parentId: string | null = null;

  for (const m of chats) {
    const role = normalizeSender(m.sender);
    if (!role) continue;
    const text = extractTextContent(m);
    const thinking = extractThinking(m);
    const id = newId();
    messages.push({
      id,
      conversationId,
      parentId,
      role,
      content: text,
      ...(thinking ? { thinking } : {}),
      status: 'done',
      createdAt: parseTime(m.createdAt ?? m.created_at) ?? Date.now(),
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
    createdAt: parseTime(conv.createdAt ?? conv.created_at) ?? now,
    updatedAt: parseTime(conv.updatedAt ?? conv.updated_at) ?? now,
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

/**
 * Resolve the content block array from a Claude message.
 * Supports both old format (`content`) and new Claude.ai export format
 * (`contentBlocks`).  Returns the string value of `content` when the
 * old format stored it as a plain string.
 */
function resolveBlocks(
  m: ClaudeMessage,
): ClaudeContentBlock[] | string | undefined {
  if (Array.isArray(m.contentBlocks) && m.contentBlocks.length > 0)
    return m.contentBlocks;
  return m.content;
}

/**
 * Extract the main text content from a Claude message.
 * When the message has a structured content array (modern format), only
 * `type === 'text'` blocks are included so that thinking blocks are NOT
 * merged into the visible text.  Falls back to the top-level `m.text`
 * string for older export formats that don't use typed blocks.
 */
function extractTextContent(m: ClaudeMessage): string {
  const c = resolveBlocks(m);
  if (Array.isArray(c)) {
    // Pick only explicit text blocks.
    const fromTextBlocks = c
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .filter(Boolean)
      .join('\n')
      .trim();
    if (fromTextBlocks) return fromTextBlocks;

    // Fallback: blocks without a type field — treat their .text as content.
    const untyped = c
      .filter((b) => !b.type && typeof b.text === 'string')
      .map((b) => b.text as string)
      .filter(Boolean)
      .join('\n')
      .trim();
    if (untyped) return untyped;
  }
  if (typeof c === 'string') return c;
  // Old-format messages only have a top-level text field.
  if (typeof m.text === 'string') return m.text;
  return '';
}

/**
 * Extract extended-thinking content from a Claude message.
 * Returns the concatenated text of all `type === 'thinking'` blocks,
 * or undefined when the message has no thinking blocks.
 * Supports both `content` (old format) and `contentBlocks` (new format).
 */
function extractThinking(m: ClaudeMessage): string | undefined {
  const c = resolveBlocks(m);
  if (!Array.isArray(c)) return undefined;
  const thinking = c
    .filter((b) => b.type === 'thinking' && typeof b.thinking === 'string')
    .map((b) => b.thinking as string)
    .filter(Boolean)
    .join('\n')
    .trim();
  return thinking || undefined;
}

function parseTime(s: string | undefined): number | null {
  if (!s) return null;
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : parsed;
}
