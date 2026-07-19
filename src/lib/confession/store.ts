import { db } from '../../db';
import type { ConfessionEntry } from '../../types';
import { confessionEntryId, formatLocalDate, yesterdayDate } from './format';

export {
  confessionEntryId,
  formatLocalDate,
  localDayBounds,
  yesterdayDate,
} from './format';

export async function getConfessionEntry(
  date: string,
  personaId: string,
): Promise<ConfessionEntry | undefined> {
  return db.confessionEntries.get(confessionEntryId(date, personaId));
}

export async function getYesterdayConfession(
  personaId: string,
  now: Date = new Date(),
): Promise<ConfessionEntry | undefined> {
  const entry = await getConfessionEntry(yesterdayDate(now), personaId);
  if (!entry || entry.status !== 'done' || !entry.confession.trim()) {
    return undefined;
  }
  return entry;
}

/** Past done archives the user may peek — excludes today. Newest first. */
export async function listConfessionArchives(
  personaId: string,
  opts?: { beforeDate?: string; limit?: number },
): Promise<ConfessionEntry[]> {
  const before = opts?.beforeDate ?? formatLocalDate(new Date());
  const limit = opts?.limit ?? 30;
  const rows = await db.confessionEntries
    .where('personaId')
    .equals(personaId)
    .toArray();
  return rows
    .filter(
      (e) => e.status === 'done' && !!e.confession.trim() && e.date < before,
    )
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit);
}

export async function putPendingConfession(opts: {
  date: string;
  personaId: string;
  model: string;
  endpointId: string;
  conversationIds: string[];
}): Promise<ConfessionEntry> {
  const now = Date.now();
  const existing = await getConfessionEntry(opts.date, opts.personaId);
  const entry: ConfessionEntry = {
    id: confessionEntryId(opts.date, opts.personaId),
    date: opts.date,
    personaId: opts.personaId,
    title: '',
    confession: '',
    enact: [],
    after: '',
    model: opts.model,
    endpointId: opts.endpointId,
    conversationIds: opts.conversationIds,
    status: 'pending',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.confessionEntries.put(entry);
  return entry;
}

export async function completeConfession(
  id: string,
  payload: {
    title: string;
    confession: string;
    enact: string[];
    after: string;
    spark?: string;
    closeness?: number;
  },
): Promise<void> {
  await db.confessionEntries.update(id, {
    title: payload.title.trim(),
    confession: payload.confession.trim(),
    enact: payload.enact,
    after: payload.after.trim(),
    spark: payload.spark?.trim() || undefined,
    closeness:
      typeof payload.closeness === 'number' ? payload.closeness : undefined,
    status: 'done',
    errorMessage: undefined,
    updatedAt: Date.now(),
  });
}

export async function failConfession(
  id: string,
  errorMessage: string,
): Promise<void> {
  await db.confessionEntries.update(id, {
    status: 'error',
    errorMessage,
    updatedAt: Date.now(),
  });
}

export async function skipConfession(opts: {
  date: string;
  personaId: string;
  reason: string;
}): Promise<void> {
  const now = Date.now();
  const existing = await getConfessionEntry(opts.date, opts.personaId);
  if (existing?.status === 'done') return;
  await db.confessionEntries.put({
    id: confessionEntryId(opts.date, opts.personaId),
    date: opts.date,
    personaId: opts.personaId,
    title: '',
    confession: '',
    enact: [],
    after: '',
    model: '',
    endpointId: '',
    conversationIds: [],
    status: 'skipped',
    errorMessage: opts.reason,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}
