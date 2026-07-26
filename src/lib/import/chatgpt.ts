import { db } from '../../db';
import type { Conversation, Message, Role } from '../../types';
import { newId } from '../id';
import { fileTextChunks } from '../file-text-chunks';
import {
  parseJsonArrayStream,
  parseJsonObjectStream,
  peekJsonRootKind,
  stringChunks,
} from '../stream-json-object';
import { beginActiveWork, endActiveWork } from '../stream-activity';
import { yieldToUi } from '../export-progress';
import { assertBackupImportFileSize } from '../storage-guards';

// Subset of the ChatGPT export format we use.
interface ChatGPTNode {
  id: string;
  message: ChatGPTMessage | null;
  parent: string | null;
  children: string[];
}

interface ChatGPTMessage {
  id?: string;
  author?: { role: string; name?: string | null };
  create_time?: number | null;
  content?:
    | {
        content_type?: string;
        parts?: unknown[];
        text?: string;
      }
    | undefined;
  metadata?: Record<string, unknown>;
}

interface ChatGPTConversation {
  title?: string | null;
  create_time?: number | null;
  update_time?: number | null;
  mapping: Record<string, ChatGPTNode>;
  current_node?: string | null;
  conversation_id?: string;
  id?: string;
}

export interface ImportResult {
  importedCount: number;
  skippedCount: number;
  conversationIds: string[];
  errors: string[];
}

export interface ImportOptions {
  /** Persona id to attach to all imported conversations. */
  personaId?: string;
  /** Default endpoint id to attach (so the user can immediately resume). */
  defaultEndpointId?: string;
  defaultModel?: string;
}

export type ChatGPTImportSource =
  | { kind: 'file'; file: File }
  | { kind: 'text'; text: string };

export interface ChatGPTStreamImportOptions extends ImportOptions {
  onProgress?: (label: string) => void;
}

/**
 * Parse and import a ChatGPT `conversations.json` file.
 * Accepts the array form and the wrapped { conversations: [...] } form.
 * Prefer {@link importChatGPTStream} for large files.
 */
export async function importChatGPT(
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
  return importChatGPTList(list, opts);
}

/**
 * Stream-import ChatGPT conversations without holding the whole export in
 * memory. Size cap matches full-backup streaming (1GB).
 */
export async function importChatGPTStream(
  source: ChatGPTImportSource,
  opts: ChatGPTStreamImportOptions = {},
): Promise<ImportResult> {
  beginActiveWork();
  const result: ImportResult = {
    importedCount: 0,
    skippedCount: 0,
    conversationIds: [],
    errors: [],
  };

  try {
    const size =
      source.kind === 'file' ? source.file.size : source.text.length * 2;
    assertBackupImportFileSize(size, 'ChatGPT 导出');

    const chunks =
      source.kind === 'file'
        ? fileTextChunks(source.file)
        : stringChunks(source.text, 256 * 1024);

    const { kind, rest } = await peekJsonRootKind(chunks);
    opts.onProgress?.('正在解析 ChatGPT 导出…');

    if (kind === 'array') {
      let seen = 0;
      for await (const ev of parseJsonArrayStream(rest, {
        arrayBatchSize: 1,
      })) {
        if (ev.type !== 'items') continue;
        for (const item of ev.items) {
          seen++;
          await ingestOne(item as ChatGPTConversation, opts, result);
          if (seen % 5 === 0) {
            opts.onProgress?.(`已处理 ${seen} 条对话…`);
            await yieldToUi();
          }
        }
      }
      return result;
    }

    if (kind === 'object') {
      let single: ChatGPTConversation | null = null;
      let sawConversationsArray = false;

      for await (const ev of parseJsonObjectStream(rest, {
        arrayBatchSize: 1,
      })) {
        if (ev.type === 'array-items' && ev.key === 'conversations') {
          sawConversationsArray = true;
          for (const item of ev.items) {
            await ingestOne(item as ChatGPTConversation, opts, result);
            if (result.importedCount % 5 === 0) {
              opts.onProgress?.(
                `已导入 ${result.importedCount} 条（跳过 ${result.skippedCount}）…`,
              );
              await yieldToUi();
            }
          }
        } else if (ev.type === 'value') {
          if (!single) single = { mapping: {} };
          (single as unknown as Record<string, unknown>)[ev.key] = ev.value;
        }
      }

      if (!sawConversationsArray && single) {
        await ingestOne(single, opts, result);
      }
      return result;
    }

    throw new Error('文件结构不像 ChatGPT 导出（顶层既不是数组也不是对象）');
  } finally {
    endActiveWork();
  }
}

async function ingestOne(
  conv: ChatGPTConversation,
  opts: ImportOptions,
  result: ImportResult,
): Promise<void> {
  try {
    const id = await importOneChatGPT(conv, opts);
    if (id) {
      result.importedCount++;
      result.conversationIds.push(id);
    } else {
      result.skippedCount++;
    }
  } catch (err) {
    result.errors.push(
      `${conv.title ?? conv.conversation_id ?? '(无标题)'}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

async function importChatGPTList(
  list: ChatGPTConversation[],
  opts: ImportOptions,
): Promise<ImportResult> {
  const result: ImportResult = {
    importedCount: 0,
    skippedCount: 0,
    conversationIds: [],
    errors: [],
  };
  for (const conv of list) {
    await ingestOne(conv, opts, result);
  }
  return result;
}

function extractConversations(raw: unknown): ChatGPTConversation[] {
  if (Array.isArray(raw)) return raw as ChatGPTConversation[];
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.conversations)) {
      return obj.conversations as ChatGPTConversation[];
    }
    // Single conversation object
    if ('mapping' in obj && typeof obj.mapping === 'object') {
      return [raw as ChatGPTConversation];
    }
  }
  throw new Error('文件结构不像 ChatGPT 导出（找不到 conversations 数组）');
}

async function importOneChatGPT(
  conv: ChatGPTConversation,
  opts: ImportOptions,
): Promise<string | null> {
  if (!conv.mapping) return null;

  const sourceId = conv.conversation_id ?? conv.id;
  // Skip if already imported.
  if (sourceId) {
    const existing = await db.conversations
      .where({ source: 'chatgpt' })
      .filter((c) => c.sourceId === sourceId)
      .first();
    if (existing) return null;
  }

  const messages: Message[] = [];
  const idMap = new Map<string, string>();
  const conversationId = newId();

  const nodes = Object.values(conv.mapping);

  // First pass: assign new ids to every node that has a message we want to keep.
  for (const n of nodes) {
    if (!n.message) continue;
    const role = normalizeRole(n.message.author?.role);
    if (!role) continue;
    const text = extractText(n.message);
    // Skip empty ghost nodes (no visible text) — parent walks skip them.
    if (!text.trim() && role !== 'system') continue;
    idMap.set(n.id, newId());
    messages.push({
      id: idMap.get(n.id)!,
      conversationId,
      parentId: null, // resolved in pass 2
      role,
      content: text,
      status: 'done',
      createdAt: timestampMs(n.message.create_time) ?? Date.now(),
    });
  }

  if (messages.length === 0) return null;

  // Second pass: resolve parent ids by walking up the source mapping until we
  // find a node we kept (skipping any ghost/system nodes we dropped).
  for (const n of nodes) {
    const newId_ = idMap.get(n.id);
    if (!newId_) continue;
    let parentSrc = n.parent;
    let resolvedParentNew: string | null = null;
    while (parentSrc) {
      const mapped = idMap.get(parentSrc);
      if (mapped) {
        resolvedParentNew = mapped;
        break;
      }
      const parentNode = conv.mapping[parentSrc];
      parentSrc = parentNode?.parent ?? null;
    }
    const msg = messages.find((m) => m.id === newId_);
    if (msg) msg.parentId = resolvedParentNew;
  }

  // Build child-by-parent index for activeChildId derivation.
  const childrenByParent = new Map<string | null, Message[]>();
  for (const m of messages) {
    const arr = childrenByParent.get(m.parentId) ?? [];
    arr.push(m);
    childrenByParent.set(m.parentId, arr);
  }
  // Sort siblings by createdAt for stable order.
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => a.createdAt - b.createdAt);
  }

  // Compute currentLeafId: prefer the new id of conv.current_node; else
  // fall back to deepest descendant by walking last-child down from root.
  let currentLeafNew: string | null = null;
  if (conv.current_node) {
    let cursor = conv.current_node;
    while (cursor && !idMap.has(cursor)) {
      const node = conv.mapping[cursor];
      if (!node) break;
      cursor = node.parent ?? '';
    }
    currentLeafNew = idMap.get(cursor) ?? null;
  }
  if (!currentLeafNew) {
    const roots = childrenByParent.get(null) ?? [];
    let cursor = roots[roots.length - 1];
    while (cursor) {
      const kids = childrenByParent.get(cursor.id) ?? [];
      if (kids.length === 0) break;
      cursor = kids[kids.length - 1];
    }
    currentLeafNew = cursor?.id ?? null;
  }

  // Set activeChildId by walking from currentLeafNew up; each parent points
  // to whichever of its children leads to the leaf.
  if (currentLeafNew) {
    let cursorId: string | null = currentLeafNew;
    while (cursorId) {
      const cur = messages.find((m) => m.id === cursorId);
      if (!cur || !cur.parentId) break;
      const parent = messages.find((m) => m.id === cur.parentId);
      if (parent) parent.activeChildId = cur.id;
      cursorId = cur.parentId;
    }
  }

  const now = Date.now();
  const titleRaw = conv.title?.trim();
  let title: string;
  if (titleRaw && !/^new chat$/i.test(titleRaw)) {
    title = titleRaw.slice(0, 80);
  } else {
    const firstUser = messages.find((m) => m.role === 'user' && m.content.trim());
    const snippet = (firstUser?.content ?? titleRaw ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 40);
    title = snippet || '从 ChatGPT 导入';
  }

  const conversation: Conversation = {
    id: conversationId,
    title,
    currentLeafId: currentLeafNew,
    personaId: opts.personaId,
    defaultEndpointId: opts.defaultEndpointId,
    defaultModel: opts.defaultModel,
    sourceId,
    source: 'chatgpt',
    createdAt: timestampMs(conv.create_time) ?? now,
    updatedAt: timestampMs(conv.update_time) ?? now,
  };

  await db.transaction('rw', db.conversations, db.messages, async () => {
    await db.conversations.add(conversation);
    await db.messages.bulkAdd(messages);
  });

  return conversationId;
}

function normalizeRole(role: string | undefined): Role | null {
  if (!role) return null;
  if (role === 'user' || role === 'assistant' || role === 'system') return role;
  if (role === 'tool' || role === 'function') return 'assistant';
  return null;
}

function extractText(msg: ChatGPTMessage): string {
  const c = msg.content;
  if (!c) return '';
  if (typeof c === 'string') return c;
  if (typeof c.text === 'string') return c.text;
  if (Array.isArray(c.parts)) {
    return c.parts
      .map((p) => {
        if (typeof p === 'string') return p;
        if (p && typeof p === 'object') {
          const obj = p as Record<string, unknown>;
          if (typeof obj.text === 'string') return obj.text;
          // image_asset_pointer / multimodal: leave a marker
          if (typeof obj.content_type === 'string') {
            return `\`[${obj.content_type}]\``;
          }
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

function timestampMs(t: number | string | null | undefined): number | null {
  if (t === null || t === undefined) return null;
  if (typeof t === 'number') {
    // Could be seconds (ChatGPT) or ms.
    return t < 1e12 ? Math.floor(t * 1000) : Math.floor(t);
  }
  const parsed = Date.parse(t);
  return Number.isNaN(parsed) ? null : parsed;
}
