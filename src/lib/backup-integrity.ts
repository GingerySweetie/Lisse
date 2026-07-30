/**
 * Pure backup / conversation-tree integrity helpers (no IndexedDB).
 */

import type { Conversation, Message } from '../types';

/**
 * Tables whose rows must not land in IndexedDB until `messages` has finished
 * streaming in. Otherwise a crash mid-import leaves conversations pointing at
 * unwritten leaves.
 */
export const DEFER_UNTIL_MESSAGES = new Set(['conversations']);

/**
 * Prefer exporting / writing messages before conversation metadata so a
 * stream import crash cannot leave conversations pointing at unwritten leaves.
 * Stable: everything before the original `conversations` slot stays put;
 * `messages` then `conversations` are inserted there; the rest follows.
 */
export function orderBackupTablesForIntegrity<T extends string>(
  tables: readonly T[],
): T[] {
  const without = tables.filter((t) => t !== 'messages' && t !== 'conversations');
  const hasMessages = tables.includes('messages' as T);
  const hasConversations = tables.includes('conversations' as T);
  if (!hasMessages && !hasConversations) return [...tables];

  const convIdx = tables.indexOf('conversations' as T);
  const msgIdx = tables.indexOf('messages' as T);
  let insertAt = without.length;
  if (convIdx >= 0) {
    insertAt = convIdx;
    if (msgIdx >= 0 && msgIdx < convIdx) insertAt -= 1;
  } else if (msgIdx >= 0) {
    insertAt = msgIdx;
  }
  insertAt = Math.max(0, Math.min(insertAt, without.length));

  const block: T[] = [];
  if (hasMessages) block.push('messages' as T);
  if (hasConversations) block.push('conversations' as T);
  const out = [...without];
  out.splice(insertAt, 0, ...block);
  return out;
}

/**
 * When exporting only the active branch, rewrite tree pointers so they only
 * reference ids present in the export (avoids orphan leaves on re-import).
 */
export function sanitizeExportedConversation(
  conversation: Conversation,
  messages: Message[],
): Conversation {
  const ids = new Set(messages.map((m) => m.id));
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    if (m.activeChildId && !ids.has(m.activeChildId)) {
      messages[i] = { ...m, activeChildId: null };
    }
  }

  let leaf = conversation.currentLeafId;
  if (!leaf || !ids.has(leaf)) {
    leaf =
      messages.length > 0
        ? messages.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b)).id
        : null;
  }
  return { ...conversation, currentLeafId: leaf };
}

/**
 * Guard for replace-import: wiping messages while conversations stay is how
 * users get a full sidebar of empty chats.
 */
export function assertReplaceKeepSafe(
  table: string,
  keepSize: number,
  conversationKeepSize: number,
): void {
  if (table === 'messages' && keepSize === 0 && conversationKeepSize > 0) {
    throw new Error(
      '备份里有对话记录，但 messages 为空或未能解析。已中止替换导入，避免把现有聊天内容清空。',
    );
  }
}
