import { db } from '../db';
import type { Conversation, Message } from '../types';

/**
 * Walk from root to the conversation's currentLeaf, returning ordered messages.
 * Uses parentId to chain. If currentLeafId is null, returns []. */
export async function getActiveBranch(
  conversation: Conversation,
): Promise<Message[]> {
  if (!conversation.currentLeafId) return [];
  const all = await db.messages
    .where({ conversationId: conversation.id })
    .toArray();
  const byId = new Map(all.map((m) => [m.id, m]));
  const path: Message[] = [];
  let cursor = byId.get(conversation.currentLeafId);
  while (cursor) {
    path.unshift(cursor);
    if (!cursor.parentId) break;
    cursor = byId.get(cursor.parentId);
  }
  return path;
}

/**
 * Get the sibling messages at the same parent. Used by the branch switcher UI.
 */
export async function getSiblings(message: Message): Promise<Message[]> {
  return db.messages
    .where({ conversationId: message.conversationId, parentId: message.parentId })
    .sortBy('createdAt');
}

/**
 * Get the active leaf descendant from a starting message: follow activeChildId
 * recursively until none.
 */
export async function getActiveLeafFrom(
  startId: string,
): Promise<string> {
  let id = startId;
  for (;;) {
    const m = await db.messages.get(id);
    if (!m || !m.activeChildId) return id;
    id = m.activeChildId;
  }
}
