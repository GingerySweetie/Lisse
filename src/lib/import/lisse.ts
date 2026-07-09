import { db } from '../../db';
import type { Conversation, Message } from '../../types';
import type { ImportResult } from './chatgpt';

interface LisseConversationBundle {
  __lisse: 'conversation';
  version: number;
  conversation: Conversation;
  messages: Message[];
}

/**
 * Import a single Lisse/Wisteria conversation JSON export
 * (produced by exportConversation with format='json').
 * Skips the conversation if one with the same id already exists.
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
    );
  }

  if (
    !raw ||
    typeof raw !== 'object' ||
    (raw as Record<string, unknown>).__lisse !== 'conversation'
  ) {
    throw new Error(
      '不是 Lisse/Wisteria 的对话导出文件（找不到 __lisse: "conversation" 字段）',
    );
  }

  const bundle = raw as LisseConversationBundle;
  const { conversation, messages } = bundle;

  if (!conversation || !Array.isArray(messages)) {
    throw new Error('文件格式不完整：缺少 conversation 或 messages 字段');
  }

  const result: ImportResult = {
    importedCount: 0,
    skippedCount: 0,
    conversationIds: [],
    errors: [],
  };

  const existing = await db.conversations.get(conversation.id);
  if (existing) {
    result.skippedCount = 1;
    return result;
  }

  try {
    await db.transaction('rw', db.conversations, db.messages, async () => {
      await db.conversations.add(conversation);
      await db.messages.bulkAdd(messages);
    });
    result.importedCount = 1;
    result.conversationIds.push(conversation.id);
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  return result;
}
