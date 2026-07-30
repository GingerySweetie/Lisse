/**
 * Post-import repair for orphan conversation leaves (needs IndexedDB).
 */

import { db } from '../db';
import type { Message } from '../types';

/**
 * Fix conversations whose currentLeafId is missing / wrong, and clear
 * dangling activeChildId pointers. Returns how many conversations were fixed.
 */
export async function repairConversationLeaves(): Promise<number> {
  const conversations = await db.conversations.toArray();
  let fixed = 0;

  for (const conv of conversations) {
    const msgs = await db.messages.where({ conversationId: conv.id }).toArray();
    const byId = new Map(msgs.map((m) => [m.id, m]));

    let touchedMsgs = false;
    for (const m of msgs) {
      if (m.activeChildId && !byId.has(m.activeChildId)) {
        await db.messages.update(m.id, { activeChildId: null });
        touchedMsgs = true;
      }
    }

    const leafOk =
      !!conv.currentLeafId &&
      byId.has(conv.currentLeafId) &&
      byId.get(conv.currentLeafId)!.conversationId === conv.id;

    if (leafOk && !touchedMsgs) continue;

    let nextLeaf: string | null = null;
    if (msgs.length > 0) {
      const roots = msgs.filter((m) => !m.parentId || !byId.has(m.parentId));
      const start =
        roots.sort((a, b) => a.createdAt - b.createdAt).at(-1) ??
        msgs.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b));
      let cursor: Message | undefined = start;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        nextLeaf = cursor.id;
        const childId = cursor.activeChildId;
        cursor = childId ? byId.get(childId) : undefined;
        if (!cursor) {
          const kids = msgs
            .filter((m) => m.parentId === nextLeaf)
            .sort((a, b) => a.createdAt - b.createdAt);
          cursor = kids.at(-1);
        }
      }
      if (!nextLeaf) {
        nextLeaf = msgs.reduce((a, b) =>
          a.createdAt >= b.createdAt ? a : b,
        ).id;
      }
    }

    if (conv.currentLeafId !== nextLeaf || touchedMsgs) {
      await db.conversations.update(conv.id, { currentLeafId: nextLeaf });
      fixed++;
    }
  }

  return fixed;
}
