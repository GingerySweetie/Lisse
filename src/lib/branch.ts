import { db } from '../db';
import type { Conversation, Message } from '../types';

/**
 * Walk from root to the conversation's currentLeaf using an already-loaded
 * message list (avoids a second IndexedDB full-table read on every live
 * query tick — critical when messages carry huge pasted bodies).
 */
export function getActiveBranchFromMessages(
  conversation: Conversation,
  messages: Message[],
): Message[] {
  if (!conversation.currentLeafId) return [];
  const byId = new Map(messages.map((m) => [m.id, m]));
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
 * Walk from root to the conversation's currentLeaf, returning ordered messages.
 * Uses parentId to chain one hop at a time (avoids materializing the whole
 * conversation into memory — large imported threads OOMed send/regenerate).
 * If currentLeafId is null, returns [].
 */
export async function getActiveBranch(
  conversation: Conversation,
): Promise<Message[]> {
  if (!conversation.currentLeafId) return [];
  const path: Message[] = [];
  let id: string | null = conversation.currentLeafId;
  // Guard against pathological cycles in corrupt imports.
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const m: Message | undefined = await db.messages.get(id);
    if (!m || m.conversationId !== conversation.id) break;
    path.unshift(m);
    id = m.parentId;
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

/** Sibling info: the active message's index among siblings + total sibling count. */
export interface SiblingInfo {
  index: number;
  total: number;
  siblings: Message[];
}

export async function getSiblingInfo(message: Message): Promise<SiblingInfo> {
  const siblings = await getSiblings(message);
  const index = siblings.findIndex((s) => s.id === message.id);
  return { index, total: siblings.length, siblings };
}
