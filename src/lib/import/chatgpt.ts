import { db } from '../../db';
import type { Conversation, Message } from '../../types';
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
import {
  extractChatGPTConversations,
  parseChatGPTConversationMessages,
  timestampMs,
  titleForChatGPTConversation,
  type ChatGPTConversation,
} from './chatgpt-parse';

export type { ChatGPTConversation } from './chatgpt-parse';
export {
  extractChatGPTConversations,
  flattenChatGPTParts,
  normalizeChatGPTMessage,
  parseChatGPTConversationMessages,
  titleForChatGPTConversation,
} from './chatgpt-parse';

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

  const list = extractChatGPTConversations(raw);
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
          if (!single) single = {};
          (single as unknown as Record<string, unknown>)[ev.key] = ev.value;
        } else if (ev.type === 'array-items' && ev.key === 'messages') {
          // Simple { messages: [...] } shape (viewer also accepts this).
          if (!single) single = {};
          const prev = single.messages ?? [];
          single.messages = [
            ...prev,
            ...(ev.items as NonNullable<ChatGPTConversation['messages']>),
          ];
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

/**
 * Import one ChatGPT conversation using chat_viewer_manager rules:
 * every mapping node with dialogue content, linearized (not a short leaf path).
 */
async function importOneChatGPT(
  conv: ChatGPTConversation,
  opts: ImportOptions,
): Promise<string | null> {
  if (!conv.mapping && !Array.isArray(conv.messages)) return null;

  const sourceId = conv.conversation_id ?? conv.id;
  if (sourceId) {
    const existing = await db.conversations
      .where({ source: 'chatgpt' })
      .filter((c) => c.sourceId === sourceId)
      .first();
    if (existing) return null;
  }

  const parsed = parseChatGPTConversationMessages(conv, { mode: 'dialogue' });
  if (parsed.length === 0) return null;

  const conversationId = newId();
  const messages: Message[] = [];
  let parentId: string | null = null;

  for (const m of parsed) {
    const id = newId();
    messages.push({
      id,
      conversationId,
      parentId,
      role: m.role,
      content: m.content,
      status: 'done',
      createdAt: m.createdAt,
      ...(m.model ? { model: m.model } : {}),
    });
    if (parentId) {
      const parent = messages.find((mm) => mm.id === parentId);
      if (parent) parent.activeChildId = id;
    }
    parentId = id;
  }

  const now = Date.now();
  const conversation: Conversation = {
    id: conversationId,
    title: titleForChatGPTConversation(conv, parsed),
    currentLeafId: messages[messages.length - 1].id,
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
