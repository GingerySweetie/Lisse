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
import type { ImportOptions, ImportResult } from './chatgpt';
import {
  extractClaudeConversations,
  parseClaudeConversationMessages,
  parseClaudeTime,
  titleForClaudeConversation,
  type ClaudeConversation,
} from './claude-parse';

export type { ClaudeConversation } from './claude-parse';
export {
  extractClaudeConversations,
  extractClaudeTextContent,
  extractClaudeThinking,
  flattenClaudeBranch,
  parseClaudeConversationMessages,
  titleForClaudeConversation,
} from './claude-parse';

export type ClaudeImportSource =
  | { kind: 'file'; file: File }
  | { kind: 'text'; text: string };

export interface ClaudeStreamImportOptions extends ImportOptions {
  onProgress?: (label: string) => void;
}

/**
 * Parse and import a Claude `conversations.json` export.
 * Prefer {@link importClaudeStream} for large files (avoids whole-file parse).
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
  const list = extractClaudeConversations(raw);
  return importClaudeList(list, opts);
}

/**
 * Stream-import Claude conversations without holding the whole export in
 * memory. Accepts top-level `[...]` or `{ conversations: [...] }` / single
 * conversation object. Size cap matches full-backup streaming (1GB).
 */
export async function importClaudeStream(
  source: ClaudeImportSource,
  opts: ClaudeStreamImportOptions = {},
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
    assertBackupImportFileSize(size, 'Claude 导出');

    const chunks =
      source.kind === 'file'
        ? fileTextChunks(source.file)
        : stringChunks(source.text, 256 * 1024);

    const { kind, rest } = await peekJsonRootKind(chunks);
    opts.onProgress?.('正在解析 Claude 导出…');

    if (kind === 'array') {
      let seen = 0;
      for await (const ev of parseJsonArrayStream(rest, {
        arrayBatchSize: 1,
      })) {
        if (ev.type !== 'items') continue;
        for (const item of ev.items) {
          seen++;
          await ingestOne(item as ClaudeConversation, opts, result);
          if (seen % 5 === 0) {
            opts.onProgress?.(`已处理 ${seen} 条对话…`);
            await yieldToUi();
          }
        }
      }
      return result;
    }

    if (kind === 'object') {
      // Wrapped { conversations: [...] } or a single conversation object.
      let single: ClaudeConversation | null = null;
      let sawConversationsArray = false;

      for await (const ev of parseJsonObjectStream(rest, {
        arrayBatchSize: 1,
      })) {
        if (ev.type === 'array-items' && ev.key === 'conversations') {
          sawConversationsArray = true;
          for (const item of ev.items) {
            await ingestOne(item as ClaudeConversation, opts, result);
            if (result.importedCount % 5 === 0) {
              opts.onProgress?.(
                `已导入 ${result.importedCount} 条（跳过 ${result.skippedCount}）…`,
              );
              await yieldToUi();
            }
          }
        } else if (ev.type === 'value') {
          if (!single) single = {} as ClaudeConversation;
          (single as unknown as Record<string, unknown>)[ev.key] = ev.value;
        } else if (
          ev.type === 'array-items' &&
          (ev.key === 'chat_messages' || ev.key === 'messages')
        ) {
          if (!single) single = {} as ClaudeConversation;
          const key = ev.key === 'messages' ? 'messages' : 'chat_messages';
          const prev = single[key] ?? [];
          single[key] = [
            ...prev,
            ...(ev.items as NonNullable<ClaudeConversation['messages']>),
          ];
        }
      }

      if (!sawConversationsArray && single) {
        await ingestOne(single, opts, result);
      }
      return result;
    }

    throw new Error(
      '文件结构不像 Claude 导出（顶层既不是数组也不是对象）',
    );
  } finally {
    endActiveWork();
  }
}

async function ingestOne(
  conv: ClaudeConversation,
  opts: ImportOptions,
  result: ImportResult,
): Promise<void> {
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

async function importClaudeList(
  list: ClaudeConversation[],
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

  const parsed = parseClaudeConversationMessages(conv);
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
      ...(m.thinking ? { thinking: m.thinking } : {}),
      ...(m.toolCalls?.length ? { toolCalls: m.toolCalls } : {}),
      status: 'done',
      createdAt: m.createdAt,
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
    title: titleForClaudeConversation(conv, parsed),
    currentLeafId: messages[messages.length - 1].id,
    personaId: opts.personaId,
    defaultEndpointId: opts.defaultEndpointId,
    defaultModel: opts.defaultModel,
    sourceId,
    source: 'claude',
    createdAt: parseClaudeTime(conv.createdAt ?? conv.created_at) ?? now,
    updatedAt: parseClaudeTime(conv.updatedAt ?? conv.updated_at) ?? now,
  };

  await db.transaction('rw', db.conversations, db.messages, async () => {
    await db.conversations.add(conversation);
    await db.messages.bulkAdd(messages);
  });

  return conversationId;
}
