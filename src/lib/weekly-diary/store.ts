import { db } from '../../db';
import type { WeeklyDiaryEntry } from '../../types';
import {
  formatWeeklyDiaryBlock,
  lastCompletedWeek,
  weeklyDiaryEntryId,
} from './format';

export {
  formatLocalDate,
  formatWeeklyDiaryBlock,
  lastCompletedWeek,
  weeklyDiaryEntryId,
  weekBoundsFromStart,
} from './format';

export async function getWeeklyDiaryEntry(
  weekStart: string,
  personaId: string,
): Promise<WeeklyDiaryEntry | undefined> {
  return db.weeklyDiaryEntries.get(weeklyDiaryEntryId(weekStart, personaId));
}

export async function getLastWeekDiary(
  personaId: string,
  readWeekday: number,
  now: Date = new Date(),
): Promise<WeeklyDiaryEntry | undefined> {
  const { weekStart } = lastCompletedWeek(now, readWeekday);
  const entry = await getWeeklyDiaryEntry(weekStart, personaId);
  if (!entry || entry.status !== 'done' || !entry.content.trim()) {
    return undefined;
  }
  return entry;
}

export async function putPendingWeeklyDiary(opts: {
  weekStart: string;
  weekEnd: string;
  personaId: string;
  model: string;
  endpointId: string;
  conversationIds: string[];
  diaryEntryIds: string[];
}): Promise<WeeklyDiaryEntry> {
  const now = Date.now();
  const entry: WeeklyDiaryEntry = {
    id: weeklyDiaryEntryId(opts.weekStart, opts.personaId),
    weekStart: opts.weekStart,
    weekEnd: opts.weekEnd,
    personaId: opts.personaId,
    content: '',
    model: opts.model,
    endpointId: opts.endpointId,
    conversationIds: opts.conversationIds,
    diaryEntryIds: opts.diaryEntryIds,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  await db.weeklyDiaryEntries.put(entry);
  return entry;
}

export async function completeWeeklyDiary(
  id: string,
  content: string,
): Promise<void> {
  await db.weeklyDiaryEntries.update(id, {
    content: content.trim(),
    status: 'done',
    errorMessage: undefined,
    updatedAt: Date.now(),
  });
}

export async function failWeeklyDiary(
  id: string,
  errorMessage: string,
): Promise<void> {
  await db.weeklyDiaryEntries.update(id, {
    status: 'error',
    errorMessage,
    updatedAt: Date.now(),
  });
}

export async function skipWeeklyDiary(opts: {
  weekStart: string;
  weekEnd: string;
  personaId: string;
  reason: string;
}): Promise<void> {
  const now = Date.now();
  const existing = await getWeeklyDiaryEntry(opts.weekStart, opts.personaId);
  if (existing?.status === 'done') return;
  await db.weeklyDiaryEntries.put({
    id: weeklyDiaryEntryId(opts.weekStart, opts.personaId),
    weekStart: opts.weekStart,
    weekEnd: opts.weekEnd,
    personaId: opts.personaId,
    content: '',
    model: '',
    endpointId: '',
    conversationIds: [],
    diaryEntryIds: [],
    status: 'skipped',
    errorMessage: opts.reason,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

export function formatLastWeekBlock(entry: WeeklyDiaryEntry): string {
  return formatWeeklyDiaryBlock(entry);
}
