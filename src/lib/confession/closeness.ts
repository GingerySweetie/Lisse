import { db } from '../../db';
import { scoreCloseness } from '../travel/scheduler';

export type {
  ConfessionCloseness,
} from './worldview';
export { composeConfessionCloseness } from './worldview';

/** Travel-style recent user-message density for a persona (last 6 hours). */
export async function computeRecentCloseness(
  personaId: string,
): Promise<number> {
  const since = Date.now() - 6 * 60 * 60 * 1000;
  const convs = await db.conversations
    .filter(
      (c) =>
        c.personaId === personaId ||
        !!c.personaIds?.includes(personaId) ||
        (c.room != null && c.personaId === personaId),
    )
    .toArray();
  const ids = [...new Set(convs.map((c) => c.id))];
  if (ids.length === 0) {
    const recent = await db.messages
      .orderBy('createdAt')
      .reverse()
      .limit(40)
      .toArray();
    const n = recent.filter(
      (m) => m.role === 'user' && m.createdAt >= since,
    ).length;
    return scoreCloseness(n, 20);
  }

  let count = 0;
  for (const id of ids) {
    const msgs = await db.messages
      .where('conversationId')
      .equals(id)
      .sortBy('createdAt');
    count += msgs.filter(
      (m) => m.role === 'user' && m.createdAt >= since,
    ).length;
    if (count >= 20) break;
  }
  return scoreCloseness(count, 20);
}
