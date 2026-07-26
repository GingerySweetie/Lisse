/**
 * Pure Claude export parsers (no IndexedDB).
 *
 * Official Claude.ai exports keep regenerated branches in `chat_messages`
 * linked by `parent_message_uuid`. Importing the flat array as-is mixes
 * abandoned branches into one thread (blank / fragment-looking chats).
 */

export interface ClaudeContentBlock {
  type?: string;
  text?: string;
  /** Claude extended-thinking block content (type === 'thinking'). */
  thinking?: string;
  /** Some exports put thinking body in `text` instead of `thinking`. */
  content?: unknown;
  toolName?: string;
  toolInput?: unknown;
  toolMessage?: string;
  result?: unknown;
  name?: string;
  input?: unknown;
}

export interface ClaudeAttachment {
  file_name?: string;
  fileName?: string;
  file_type?: string;
  fileType?: string;
  extracted_content?: string;
  extractedContent?: string;
}

export interface ClaudeMessage {
  uuid?: string;
  text?: string;
  content?: ClaudeContentBlock[] | string;
  contentBlocks?: ClaudeContentBlock[];
  sender?: string;
  created_at?: string;
  createdAt?: string;
  files?: unknown[];
  files_v2?: unknown[];
  filesV2?: unknown[];
  attachments?: ClaudeAttachment[];
  searchText?: string;
  parent_message_uuid?: string;
  parentMessageUuid?: string;
}

export interface ClaudeConversation {
  uuid?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
  createdAt?: string;
  updatedAt?: string;
  chat_messages?: ClaudeMessage[];
  messages?: ClaudeMessage[];
  summary?: string;
  current_leaf_message_uuid?: string;
  currentLeafMessageUuid?: string;
}

export interface ParsedClaudeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  createdAt: number;
  sourceUuid?: string;
}

/** Root sentinel Claude uses for the first message's parent pointer. */
export const CLAUDE_ROOT_PARENT =
  '00000000-0000-4000-8000-000000000000';

export function extractClaudeConversations(raw: unknown): ClaudeConversation[] {
  if (Array.isArray(raw)) return raw as ClaudeConversation[];
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.conversations)) {
      return obj.conversations as ClaudeConversation[];
    }
    if ('chat_messages' in obj || 'messages' in obj) {
      return [raw as ClaudeConversation];
    }
  }
  throw new Error(
    '文件结构不像 Claude 导出（找不到 conversations、chat_messages 或 messages）',
  );
}

export function normalizeClaudeSender(
  sender: string | undefined,
): ParsedClaudeMessage['role'] | null {
  if (!sender) return null;
  if (sender === 'human' || sender === 'user') return 'user';
  if (sender === 'assistant' || sender === 'claude') return 'assistant';
  if (sender === 'system') return 'system';
  return null;
}

function resolveBlocks(
  m: ClaudeMessage,
): ClaudeContentBlock[] | string | undefined {
  if (Array.isArray(m.contentBlocks) && m.contentBlocks.length > 0) {
    return m.contentBlocks;
  }
  return m.content;
}

function blockText(b: ClaudeContentBlock): string {
  if (typeof b.text === 'string' && b.text) return b.text;
  if (typeof b.content === 'string' && b.content) return b.content;
  return '';
}

/**
 * Extract visible text from a Claude message.
 * Prefers typed `text` blocks; falls back to top-level `text`, then
 * attachment `extracted_content` (file-only turns often have empty text).
 */
export function extractClaudeTextContent(m: ClaudeMessage): string {
  const c = resolveBlocks(m);
  if (Array.isArray(c)) {
    const fromTextBlocks = c
      .filter((b) => b.type === 'text')
      .map(blockText)
      .filter(Boolean)
      .join('\n')
      .trim();
    if (fromTextBlocks) return fromTextBlocks;

    // Untyped blocks that still carry `.text`.
    const untyped = c
      .filter((b) => !b.type)
      .map(blockText)
      .filter(Boolean)
      .join('\n')
      .trim();
    if (untyped) return untyped;
  }
  if (typeof c === 'string' && c.trim()) return c;

  if (typeof m.text === 'string' && m.text.trim()) return m.text;

  const fromAttachments = extractAttachmentText(m);
  if (fromAttachments) return fromAttachments;

  return '';
}

function extractAttachmentText(m: ClaudeMessage): string {
  const atts = m.attachments;
  if (!Array.isArray(atts) || atts.length === 0) return '';
  const parts: string[] = [];
  for (const a of atts) {
    if (!a || typeof a !== 'object') continue;
    const name = (a.fileName ?? a.file_name ?? '附件').toString();
    const body = (a.extractedContent ?? a.extracted_content ?? '').toString().trim();
    if (body) {
      parts.push(`[附件: ${name}]\n${body}`);
    } else if (name && name !== '附件') {
      parts.push(`[附件: ${name}]`);
    }
  }
  return parts.join('\n\n').trim();
}

export function extractClaudeThinking(m: ClaudeMessage): string | undefined {
  const c = resolveBlocks(m);
  if (!Array.isArray(c)) return undefined;
  const thinking = c
    .filter((b) => b.type === 'thinking')
    .map((b) => {
      if (typeof b.thinking === 'string' && b.thinking) return b.thinking;
      if (typeof b.text === 'string' && b.text) return b.text;
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
  return thinking || undefined;
}

export function parseClaudeTime(s: string | undefined): number | null {
  if (!s) return null;
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : parsed;
}

function parentUuidOf(m: ClaudeMessage): string | undefined {
  return m.parentMessageUuid ?? m.parent_message_uuid;
}

function leafUuidOf(conv: ClaudeConversation): string | undefined {
  return conv.currentLeafMessageUuid ?? conv.current_leaf_message_uuid;
}

/**
 * Walk parent pointers from the current leaf back to root, then reverse.
 * Falls back to chronological order when parent links are missing (old exports).
 */
export function flattenClaudeBranch(
  messages: ClaudeMessage[],
  preferredLeafUuid?: string,
): ClaudeMessage[] {
  if (messages.length === 0) return [];

  const hasAnyParent = messages.some((m) => {
    const p = parentUuidOf(m);
    return typeof p === 'string' && p.length > 0;
  });
  if (!hasAnyParent) {
    // Legacy linear export — keep array order.
    return messages.slice();
  }

  const byUuid = new Map<string, ClaudeMessage>();
  for (const m of messages) {
    if (m.uuid) byUuid.set(m.uuid, m);
  }

  let leaf: ClaudeMessage | undefined;
  if (preferredLeafUuid) leaf = byUuid.get(preferredLeafUuid);
  if (!leaf) {
    // Latest message by createdAt (then array order) is the active tip.
    leaf = messages.reduce((best, cur) => {
      const bt = parseClaudeTime(best.createdAt ?? best.created_at) ?? 0;
      const ct = parseClaudeTime(cur.createdAt ?? cur.created_at) ?? 0;
      return ct >= bt ? cur : best;
    });
  }

  const chain: ClaudeMessage[] = [];
  const seen = new Set<string>();
  let current: ClaudeMessage | undefined = leaf;
  for (let i = 0; i < 100_000 && current; i++) {
    const id = current.uuid ?? `anon-${i}`;
    if (seen.has(id)) break;
    seen.add(id);
    chain.push(current);
    const parentId = parentUuidOf(current);
    if (!parentId || parentId === CLAUDE_ROOT_PARENT) break;
    current = byUuid.get(parentId);
  }

  chain.reverse();
  return chain;
}

export function parseClaudeConversationMessages(
  conv: ClaudeConversation,
): ParsedClaudeMessage[] {
  const raw = conv.messages ?? conv.chat_messages ?? [];
  const branch = flattenClaudeBranch(raw, leafUuidOf(conv));
  const out: ParsedClaudeMessage[] = [];

  for (const m of branch) {
    const role = normalizeClaudeSender(m.sender);
    if (!role) continue;
    const text = extractClaudeTextContent(m);
    const thinking = extractClaudeThinking(m);
    // Keep thinking-only assistant turns; skip truly empty ghosts.
    if (!text.trim() && !thinking) continue;
    out.push({
      role,
      content: text,
      ...(thinking ? { thinking } : {}),
      createdAt: parseClaudeTime(m.createdAt ?? m.created_at) ?? Date.now(),
      sourceUuid: m.uuid,
    });
  }
  return out;
}

/** Prefer official title; else first user line; else a short generic label. */
export function titleForClaudeConversation(
  conv: ClaudeConversation,
  messages: ParsedClaudeMessage[],
): string {
  const named = conv.name?.trim();
  if (named && !/^untitled$/i.test(named)) return named.slice(0, 80);

  const firstUser = messages.find((m) => m.role === 'user' && m.content.trim());
  if (firstUser) {
    const snippet = firstUser.content
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 40);
    if (snippet) return snippet;
  }

  const firstAny = messages.find((m) => m.content.trim());
  if (firstAny) {
    const snippet = firstAny.content.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (snippet) return snippet;
  }

  return named?.slice(0, 80) || '从 Claude 导入';
}
