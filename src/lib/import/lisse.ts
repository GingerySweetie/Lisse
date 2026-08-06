import { db } from '../../db';
import type { Conversation, Message } from '../../types';
import { repairConversationLeaves } from '../backup-repair';
import type { ImportResult } from './chatgpt';

interface LisseConversationBundle {
  __lisse: 'conversation';
  version: number;
  conversation: Conversation;
  messages: Message[];
}

interface LisseConversationsBundle {
  __lisse: 'conversations';
  version: number;
  items: Array<{ conversation: Conversation; messages: Message[] }>;
}

/**
 * Import a Lisse/Wisteria conversation JSON export.
 * Accepts:
 * - single: `__lisse: "conversation"` (from chat export menu)
 * - multi:  `__lisse: "conversations"` (from selective / recent-month export)
 *
 * Upserts by conversation.id: replaces the conversation row and that
 * conversation's messages so a fuller re-export can heal a thin/broken import.
 */
export async function importLisseConversation(
  fileText: string,
): Promise<ImportResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(fileText);
  } catch (err) {
    throw new Error(
      `不是合法的 JSON：${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  if (!raw || typeof raw !== 'object') {
    throw new Error('不是合法的 JSON 对象');
  }

  const kind = (raw as Record<string, unknown>).__lisse;
  if (kind === 'conversation') {
    return importOne(raw as LisseConversationBundle);
  }
  if (kind === 'conversations') {
    return importMany(raw as LisseConversationsBundle);
  }

  throw new Error(
    '不是 Lisse/Wisteria 的对话导出文件（需要 __lisse: "conversation" 或 "conversations"）',
  );
}

async function importOne(
  bundle: LisseConversationBundle,
): Promise<ImportResult> {
  const { conversation, messages } = bundle;
  if (!conversation || !Array.isArray(messages)) {
    throw new Error('文件格式不完整：缺少 conversation 或 messages 字段');
  }
  return importItems([{ conversation, messages }]);
}

async function importMany(
  bundle: LisseConversationsBundle,
): Promise<ImportResult> {
  if (!Array.isArray(bundle.items)) {
    throw new Error('文件格式不完整：缺少 items 数组');
  }
  for (const item of bundle.items) {
    if (!item?.conversation || !Array.isArray(item.messages)) {
      throw new Error('文件格式不完整：items 内缺少 conversation 或 messages');
    }
  }
  return importItems(bundle.items);
}

async function importItems(
  items: Array<{ conversation: Conversation; messages: Message[] }>,
): Promise<ImportResult> {
  const result: ImportResult = {
    importedCount: 0,
    skippedCount: 0,
    conversationIds: [],
    errors: [],
  };

  for (const { conversation, messages } of items) {
    try {
      await db.transaction('rw', db.conversations, db.messages, async () => {
        const existing = await db.conversations.get(conversation.id);
        // Replace this conversation's messages entirely so a complete tree
        // export can overwrite a previously truncated branch import.
        if (existing) {
          const oldKeys = await db.messages
            .where({ conversationId: conversation.id })
            .primaryKeys();
          if (oldKeys.length) await db.messages.bulkDelete(oldKeys);
        }
        await db.conversations.put(conversation);
        if (messages.length) await db.messages.bulkPut(messages);
      });
      result.importedCount += 1;
      result.conversationIds.push(conversation.id);
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (result.importedCount > 0) {
    try {
      await repairConversationLeaves();
    } catch {
      // non-fatal
    }
  }

  return result;
}
