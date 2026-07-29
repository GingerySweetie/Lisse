/**
 * Pure ChatGPT export parsers (no IndexedDB).
 *
 * Aligned with Fedor22515/chat_viewer_manager
 * (https://fedor22515.github.io/chat_viewer_manager/):
 * - Walk every node in `mapping` (not only the current_node leaf path)
 * - normalizeMessage + flattenParts for content_type / multimodal parts
 * - Keep non-empty dialogue (user/assistant); drop empty ghosts / noise
 * - Linearize in mapping key order (seqIndex), matching the viewer
 */

export interface ChatGPTNode {
  id?: string;
  message: ChatGPTMessage | null;
  parent?: string | null;
  children?: string[];
}

export interface ChatGPTMessage {
  id?: string;
  author?: { role?: string; name?: string | null };
  role?: string;
  create_time?: number | null;
  update_time?: number | null;
  createdAt?: number | null;
  recipient?: string;
  model?: string;
  content?:
    | string
    | {
        content_type?: string;
        parts?: unknown[];
        text?: string;
        user_instructions?: string;
      }
    | null;
  contents?: Array<{ text?: string }>;
  metadata?: Record<string, unknown>;
  extra_metadata?: Record<string, unknown>;
}

export interface ChatGPTConversation {
  title?: string | null;
  create_time?: number | null;
  update_time?: number | null;
  mapping?: Record<string, ChatGPTNode>;
  current_node?: string | null;
  conversation_id?: string;
  id?: string;
  messages?: ChatGPTMessage[];
}

export type ChatGPTMessageCategory = 'dialogue' | 'custom' | 'memory' | 'noise';

export interface ParsedChatGPTMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  category: ChatGPTMessageCategory;
  model?: string;
  sourceId?: string;
  seqIndex: number;
}

export function extractChatGPTConversations(
  raw: unknown,
): ChatGPTConversation[] {
  if (Array.isArray(raw)) return raw as ChatGPTConversation[];
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.conversations)) {
      return obj.conversations as ChatGPTConversation[];
    }
    if ('mapping' in obj && typeof obj.mapping === 'object') {
      return [raw as ChatGPTConversation];
    }
    if (Array.isArray(obj.messages)) {
      return [raw as ChatGPTConversation];
    }
  }
  throw new Error('文件结构不像 ChatGPT 导出（找不到 conversations / mapping）');
}

function safeJSON(o: unknown): string {
  try {
    return JSON.stringify(o, null, 2);
  } catch {
    return '';
  }
}

/** Viewer flattenParts — concatenate multimodal / typed parts. */
export function flattenChatGPTParts(parts: unknown[]): string {
  const out: string[] = [];
  for (const p of parts) {
    if (p == null) continue;
    if (typeof p === 'string') {
      out.push(p);
      continue;
    }
    if (typeof p === 'object') {
      const obj = p as Record<string, unknown>;
      if (typeof obj.text === 'string' && obj.text.trim()) {
        out.push(obj.text);
        continue;
      }
      if (typeof obj.content === 'string' && obj.content.trim()) {
        out.push(obj.content);
        continue;
      }
      if (
        obj.content_type &&
        typeof obj.title === 'string' &&
        typeof obj.description === 'string'
      ) {
        out.push(`${obj.title}\n${obj.description}`);
        continue;
      }
      if (obj.type === 'memory_update' && obj.data) {
        out.push(`[记忆更新]\n${safeJSON(obj.data)}`);
        continue;
      }
      // image_asset_pointer / multimodal: leave a short marker
      if (typeof obj.content_type === 'string') {
        out.push(`[${obj.content_type}]`);
        continue;
      }
      const jsonish = safeJSON(p);
      if (jsonish && jsonish.length < 2000) out.push(jsonish);
    }
  }
  return out.join('\n\n');
}

function extractCodeOrPlain(s: string): string {
  const str = String(s || '');
  const m = str.match(/```([\s\S]*?)```/m);
  if (m?.[1]) return m[1].trim();
  return str.trim();
}

function looksLikeMemoryCmd(text: string): boolean {
  const t = String(text || '');
  return (
    /"cmd"\s*:\s*\[[^\]]*"add"[^\]]*\]/.test(t) &&
    /"contents"\s*:\s*"/.test(t)
  );
}

function extractMemoryContents(text: string): string {
  const t = String(text || '');
  const match = t.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]) as {
        cmd?: unknown;
        contents?: unknown;
      };
      if (
        obj &&
        Array.isArray(obj.cmd) &&
        obj.cmd.includes('add') &&
        typeof obj.contents === 'string'
      ) {
        return obj.contents;
      }
    } catch {
      // fall through
    }
  }
  const m = t.match(/"contents"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (m?.[1]) {
    try {
      return JSON.parse(`"${m[1]}"`) as string;
    } catch {
      return m[1];
    }
  }
  return '';
}

function pickMemoryText(meta: Record<string, unknown>): string {
  const keys = Object.keys(meta);
  const hits = keys.filter((k) => /memory|remember/i.test(k));
  if (hits.length) {
    const obj: Record<string, unknown> = {};
    for (const k of hits) obj[k] = meta[k];
    return `[记忆] ${safeJSON(obj)}`;
  }
  if (meta.type === 'memory_update' && meta.data) {
    return `[记忆更新]\n${safeJSON(meta.data)}`;
  }
  return '';
}

function tsOf(m: ChatGPTMessage): number | null {
  return timestampMs(m.createdAt ?? m.create_time ?? m.update_time);
}

export function timestampMs(
  t: number | string | null | undefined,
): number | null {
  if (t === null || t === undefined) return null;
  if (typeof t === 'number') {
    return t < 1e12 ? Math.floor(t * 1000) : Math.floor(t);
  }
  const parsed = Date.parse(t);
  return Number.isNaN(parsed) ? null : parsed;
}

interface NormalizedRaw {
  role: string;
  authorName: string;
  recipient: string;
  contentType: string;
  content: string;
  createdAt: number | null;
  hintCategory: '' | 'custom' | 'memory';
  memoryKind: string;
  model: string;
  seqIndex: number;
  sourceId?: string;
}

/**
 * Viewer normalizeMessage — extract visible text from one ChatGPT node.message.
 */
export function normalizeChatGPTMessage(
  m: ChatGPTMessage,
  seqIndex: number,
): NormalizedRaw {
  const role = (m.author && m.author.role) || m.role || 'other';
  const authorName = (m.author && m.author.name) || '';
  const recipient = m.recipient || '';
  const contentObj = m.content ?? null;
  const contentType =
    contentObj && typeof contentObj === 'object'
      ? contentObj.content_type || ''
      : '';
  let content = '';
  const meta = (m.metadata || m.extra_metadata || {}) as Record<string, unknown>;
  const model =
    (typeof meta.model_slug === 'string' && meta.model_slug) ||
    (typeof meta.default_model_slug === 'string' && meta.default_model_slug) ||
    (typeof meta.model === 'string' && meta.model) ||
    m.model ||
    '';

  if (typeof contentObj === 'string') {
    content = contentObj;
  } else if (contentObj && Array.isArray(contentObj.parts)) {
    content = flattenChatGPTParts(contentObj.parts);
  } else if (contentObj && typeof contentObj.text === 'string') {
    content = contentObj.text;
  } else if (Array.isArray(m.contents)) {
    content = m.contents.map((c) => c.text || '').join('\n\n');
  }

  let hintCategory: '' | 'custom' | 'memory' = '';
  let memoryKind = '';

  // user_editable_context / custom instructions
  if (contentType === 'user_editable_context' && contentObj && typeof contentObj === 'object') {
    const fromField = contentObj.user_instructions || '';
    const ctx = meta.user_context_message_data as
      | Record<string, unknown>
      | undefined;
    const fromMeta =
      (typeof ctx?.about_model_message === 'string' && ctx.about_model_message) ||
      (typeof ctx?.about_user_message === 'string' && ctx.about_user_message) ||
      '';
    content = extractCodeOrPlain(content || fromField || fromMeta || '');
    hintCategory = content ? 'custom' : '';
  }
  if (!hintCategory) {
    const ctx = meta.user_context_message_data as
      | Record<string, unknown>
      | undefined;
    const about =
      (typeof ctx?.about_model_message === 'string' && ctx.about_model_message) ||
      (typeof ctx?.about_user_message === 'string' && ctx.about_user_message) ||
      '';
    const isUserSystem = meta.is_user_system_message === true;
    const instr =
      contentObj && typeof contentObj === 'object'
        ? contentObj.user_instructions
        : undefined;
    const txt = extractCodeOrPlain(String(instr || about || ''));
    if ((instr || about || isUserSystem) && txt) {
      content = txt;
      hintCategory = 'custom';
    }
  }
  if (
    !hintCategory &&
    typeof content === 'string' &&
    /The user provided the additional info/i.test(content)
  ) {
    const fenced = extractCodeOrPlain(content);
    if (fenced && fenced !== content) {
      content = fenced;
      hintCategory = 'custom';
    }
  }

  // memory / bio
  if (recipient === 'bio') {
    const extracted = extractMemoryContents(content);
    content = extracted || content;
    hintCategory = 'memory';
    memoryKind = '写入';
  } else if (role === 'tool' && authorName === 'bio') {
    hintCategory = 'memory';
    memoryKind = '结果';
  } else if (looksLikeMemoryCmd(content)) {
    content = extractMemoryContents(content) || content;
    hintCategory = 'memory';
    memoryKind = '写入';
  }

  if (!hintCategory) {
    const mem = pickMemoryText(meta);
    if (mem) {
      content = mem;
      hintCategory = 'memory';
    }
  }

  return {
    role,
    authorName,
    recipient,
    contentType,
    content: String(content || '').trim(),
    createdAt: tsOf(m),
    hintCategory,
    memoryKind,
    model: String(model || ''),
    seqIndex,
    sourceId: m.id,
  };
}

function categorize(
  m: NormalizedRaw,
): ChatGPTMessageCategory {
  if (m.hintCategory === 'memory') return 'memory';
  if (m.hintCategory === 'custom') return 'custom';
  if (m.role === 'user' || m.role === 'assistant') return 'dialogue';
  return 'noise';
}

function toParsedRole(
  m: NormalizedRaw,
  category: ChatGPTMessageCategory,
): ParsedChatGPTMessage['role'] | null {
  if (category === 'custom' || category === 'memory') return 'system';
  if (m.role === 'user') return 'user';
  if (m.role === 'assistant') return 'assistant';
  // Viewer dialogue mode ignores tools; we keep tool text as assistant
  // only when it still has visible content and was categorized dialogue
  // (won't happen — tools are noise). Skip noise.
  return null;
}

/**
 * Parse one ChatGPT conversation like chat_viewer_manager:
 * iterate every mapping node, normalize content, keep non-empty messages.
 * Default `mode: 'dialogue'` matches the viewer's dialogue filter
 * (user/assistant only) so long threads aren't truncated to a short leaf path.
 */
export function parseChatGPTConversationMessages(
  conv: ChatGPTConversation,
  opts: { mode?: 'dialogue' | 'all' } = {},
): ParsedChatGPTMessage[] {
  const mode = opts.mode ?? 'dialogue';
  const rawList: NormalizedRaw[] = [];
  let seq = 0;

  if (conv.mapping && typeof conv.mapping === 'object') {
    for (const key of Object.keys(conv.mapping)) {
      const node = conv.mapping[key];
      if (!node || !node.message) continue;
      const nm = normalizeChatGPTMessage(node.message, seq++);
      if (node.id && !nm.sourceId) nm.sourceId = node.id;
      rawList.push(nm);
    }
  } else if (Array.isArray(conv.messages)) {
    for (const m of conv.messages) {
      rawList.push(normalizeChatGPTMessage(m, seq++));
    }
  }

  const out: ParsedChatGPTMessage[] = [];
  for (const m of rawList) {
    if (!String(m.content || '').trim()) continue;
    // Viewer V1.3.2: drop useless bio result toast
    if (
      m.hintCategory === 'memory' &&
      m.memoryKind === '结果' &&
      (m.content === 'Model set context updated.' ||
        m.content === 'Model set context updated')
    ) {
      continue;
    }
    const category = categorize(m);
    if (mode === 'dialogue' && category !== 'dialogue') continue;
    if (mode === 'all' && category === 'noise') continue;

    const role = toParsedRole(m, category);
    if (!role) continue;

    out.push({
      role,
      content: m.content,
      createdAt: m.createdAt ?? Date.now(),
      category,
      ...(m.model ? { model: m.model } : {}),
      ...(m.sourceId ? { sourceId: m.sourceId } : {}),
      seqIndex: m.seqIndex,
    });
  }

  // Viewer sorts by seqIndex for display.
  out.sort((a, b) => a.seqIndex - b.seqIndex);
  return out;
}

export function titleForChatGPTConversation(
  conv: ChatGPTConversation,
  messages: ParsedChatGPTMessage[],
): string {
  const named = conv.title?.trim();
  if (named && !/^new chat$/i.test(named)) return named.slice(0, 80);

  const firstUser = messages.find((m) => m.role === 'user' && m.content.trim());
  if (firstUser) {
    const snippet = firstUser.content.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (snippet) return snippet;
  }
  return named?.slice(0, 80) || '从 ChatGPT 导入';
}
