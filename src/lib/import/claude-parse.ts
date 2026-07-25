/**
 * Pure Claude export parsers (no IndexedDB).
 *
 * Aligned with SsssssSynqa/claude-conversation-viewer
 * (https://sssssssynqa.github.io/claude-conversation-viewer/):
 * - Official export: `chat_messages` + `content[]` (snake_case)
 * - 6 content types: text, thinking, tool_use, tool_result, token_budget, flag
 * - thinking body is in `item.thinking`, NOT `item.text`
 * - tool_result on the next human turn pairs with prior assistant tool_use
 * - Linear `chat_messages` order (viewer does not walk parent_message_uuid)
 */

import type { ToolCallRecord } from '../../types';

export interface ClaudeContentBlock {
  type?: string;
  text?: string;
  /** Claude extended-thinking — official field is `thinking`, not `text`. */
  thinking?: string;
  content?: unknown;
  name?: string;
  input?: unknown;
  message?: string;
  /** tool_use id when present. */
  id?: string;
  output?: string;
  flag?: string;
  helpline?: unknown;
  summaries?: Array<{ summary?: string }>;
  start_timestamp?: string;
  stop_timestamp?: string;
  cut_off?: boolean;
  truncated?: boolean;
}

export interface ClaudeAttachment {
  file_name?: string;
  fileName?: string;
  file_type?: string;
  fileType?: string;
  extracted_content?: string;
  extractedContent?: string;
}

export interface ClaudeFileRef {
  file_name?: string;
  fileName?: string;
}

export interface ClaudeMessage {
  uuid?: string;
  text?: string;
  /** Official Claude.ai export field. */
  content?: ClaudeContentBlock[] | string;
  /** Newer camelCase variant (kept as fallback). */
  contentBlocks?: ClaudeContentBlock[];
  sender?: string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  files?: ClaudeFileRef[];
  files_v2?: ClaudeFileRef[];
  filesV2?: ClaudeFileRef[];
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
  /** Official Claude.ai export field. */
  chat_messages?: ClaudeMessage[];
  /** Newer camelCase variant (kept as fallback). */
  messages?: ClaudeMessage[];
  summary?: string;
  current_leaf_message_uuid?: string;
  currentLeafMessageUuid?: string;
}

export interface ParsedClaudeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  toolCalls?: ToolCallRecord[];
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

/**
 * Official export uses `content`; some newer dumps use `contentBlocks`.
 * Prefer `content` (viewer / official).
 */
function resolveContentItems(m: ClaudeMessage): ClaudeContentBlock[] {
  if (Array.isArray(m.content)) return m.content;
  if (Array.isArray(m.contentBlocks)) return m.contentBlocks;
  return [];
}

function extractToolResult(item: ClaudeContentBlock): string {
  // Mirrors viewer extractToolResult().
  if (typeof item.content === 'string') return item.content;
  if (Array.isArray(item.content)) {
    return item.content
      .map((c) => {
        if (typeof c === 'string') return c;
        if (c && typeof c === 'object') {
          const obj = c as Record<string, unknown>;
          if (typeof obj.text === 'string') return obj.text;
          return JSON.stringify(c);
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof item.text === 'string') return item.text;
  if (typeof item.output === 'string') return item.output;
  return '';
}

function collectFileNotes(m: ClaudeMessage): string {
  const parts: string[] = [];
  const fileLists: unknown[] = [];
  if (Array.isArray(m.files)) fileLists.push(...m.files);
  if (Array.isArray(m.files_v2)) fileLists.push(...m.files_v2);
  if (Array.isArray(m.filesV2)) fileLists.push(...m.filesV2);

  for (const f of fileLists) {
    if (!f || typeof f !== 'object') continue;
    const name = ((f as ClaudeFileRef).fileName ??
      (f as ClaudeFileRef).file_name ??
      '')
      .toString()
      .trim();
    if (name) parts.push(`[附件: ${name}]`);
  }

  if (Array.isArray(m.attachments)) {
    for (const a of m.attachments) {
      if (!a || typeof a !== 'object') continue;
      const name = (a.fileName ?? a.file_name ?? '附件').toString();
      const body = (
        a.extractedContent ??
        a.extracted_content ??
        ''
      )
        .toString()
        .trim();
      if (body) {
        parts.push(`[附件: ${name}]\n${body}`);
      } else if (name && name !== '附件') {
        parts.push(`[附件: ${name}]`);
      }
    }
  }

  return parts.join('\n\n').trim();
}

/**
 * Extract visible text from a Claude message (viewer-compatible).
 * Prefers typed `text` blocks in `content[]`; falls back to top-level `text`
 * only when there are no usable blocks; then file / attachment notes.
 */
export function extractClaudeTextContent(m: ClaudeMessage): string {
  const items = resolveContentItems(m);
  if (items.length > 0) {
    const fromTextBlocks = items
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => (b.text as string).trim())
      .filter(Boolean)
      .join('\n')
      .trim();
    if (fromTextBlocks) return fromTextBlocks;
    // content[] present but no text blocks — do not fall back to raw.text
    // (viewer only uses raw.text when zero content blocks were produced).
    return collectFileNotes(m);
  }
  if (typeof m.content === 'string' && m.content.trim()) {
    return m.content.trim();
  }

  if (typeof m.text === 'string' && m.text.trim()) return m.text.trim();

  return collectFileNotes(m);
}

/**
 * Extract thinking — CRITICAL: use `item.thinking`, not `item.text`
 * (same bug the conversation-viewer rewrite fixed).
 */
export function extractClaudeThinking(m: ClaudeMessage): string | undefined {
  const items = resolveContentItems(m);
  if (!items.length) return undefined;
  const thinking = items
    .filter((b) => b.type === 'thinking' && typeof b.thinking === 'string')
    .map((b) => (b.thinking as string).trim())
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

/**
 * Optional helper: walk parent pointers from the current leaf back to root.
 * The official viewer uses linear `chat_messages` order instead; kept for
 * callers that want a single active branch.
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
  if (!hasAnyParent) return messages.slice();

  const byUuid = new Map<string, ClaudeMessage>();
  for (const m of messages) {
    if (m.uuid) byUuid.set(m.uuid, m);
  }

  let leaf: ClaudeMessage | undefined;
  if (preferredLeafUuid) leaf = byUuid.get(preferredLeafUuid);
  if (!leaf) {
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

/**
 * Parse one conversation's messages the same way the Claude conversation
 * viewer does: linear `chat_messages`, 6 content types, tool_use/result pairing.
 */
export function parseClaudeConversationMessages(
  conv: ClaudeConversation,
): ParsedClaudeMessage[] {
  // Prefer official `chat_messages` (viewer); fall back to camelCase `messages`.
  const chatMessages = conv.chat_messages ?? conv.messages ?? [];
  if (!Array.isArray(chatMessages) || chatMessages.length === 0) return [];

  const out: ParsedClaudeMessage[] = [];
  /** Pending assistant tool_use records awaiting a tool_result on a later turn. */
  const pendingToolUses: ToolCallRecord[] = [];
  let toolSeq = 0;

  for (const raw of chatMessages) {
    const role = normalizeClaudeSender(raw.sender);
    if (!role) continue;

    const items = resolveContentItems(raw);
    const textParts: string[] = [];
    const thinkingParts: string[] = [];
    const toolCalls: ToolCallRecord[] = [];
    let keptBlocks = 0;

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;

      switch (item.type) {
        case 'text': {
          const text = (typeof item.text === 'string' ? item.text : '').trim();
          if (text) {
            textParts.push(text);
            keptBlocks++;
          }
          break;
        }

        case 'thinking': {
          // CRITICAL: field is item.thinking, NOT item.text
          const thinking = (
            typeof item.thinking === 'string' ? item.thinking : ''
          ).trim();
          if (thinking) {
            thinkingParts.push(thinking);
            keptBlocks++;
          }
          break;
        }

        case 'tool_use': {
          const tc: ToolCallRecord = {
            id:
              typeof item.id === 'string' && item.id
                ? item.id
                : `claude-tool-${++toolSeq}`,
            name: (typeof item.name === 'string' && item.name) || 'unknown',
            input: item.input ?? {},
          };
          toolCalls.push(tc);
          pendingToolUses.push(tc);
          keptBlocks++;
          break;
        }

        case 'tool_result': {
          const resultText = extractToolResult(item);
          const paired = pendingToolUses.shift();
          if (paired) {
            // Pair onto the earlier assistant tool_use (viewer behavior).
            paired.result = resultText;
            // Do not keep an empty human turn that only carried tool_result.
          } else if (resultText) {
            textParts.push(resultText);
            keptBlocks++;
          }
          break;
        }

        case 'token_budget':
        case 'flag':
          // Viewer hides these by default; skip on import.
          break;

        default:
          // Unknown type — ignore silently (viewer).
          break;
      }
    }

    // Viewer: fall back to raw.text only when no content blocks were kept.
    if (keptBlocks === 0 && typeof raw.text === 'string' && raw.text.trim()) {
      textParts.push(raw.text.trim());
      keptBlocks++;
    }

    const fileNotes = collectFileNotes(raw);
    if (fileNotes) {
      textParts.push(fileNotes);
      keptBlocks++;
    }

    if (keptBlocks === 0 && toolCalls.length === 0) continue;

    const content = textParts.join('\n').trim();
    const thinking = thinkingParts.join('\n').trim() || undefined;

    // Skip truly empty ghosts (e.g. human turn whose only blocks were
    // paired-away tool_results and no files).
    if (!content && !thinking && toolCalls.length === 0) continue;

    out.push({
      role,
      content,
      ...(thinking ? { thinking } : {}),
      ...(toolCalls.length ? { toolCalls } : {}),
      createdAt:
        parseClaudeTime(raw.createdAt ?? raw.created_at) ?? Date.now(),
      sourceUuid: raw.uuid,
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
    const snippet = firstUser.content.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (snippet) return snippet;
  }

  const firstAny = messages.find((m) => m.content.trim());
  if (firstAny) {
    const snippet = firstAny.content.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (snippet) return snippet;
  }

  return named?.slice(0, 80) || '从 Claude 导入';
}
