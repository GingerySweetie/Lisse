import { db } from '../../db';
import type { DiaryEntry } from '../../types';
import { diaryEntryId, formatLocalDate } from './format';

export {
  diaryEntryId,
  formatDiaryBlock,
  formatLocalDate,
  localDayBounds,
} from './format';

export async function getDiaryEntry(
  date: string,
  personaId: string,
): Promise<DiaryEntry | undefined> {
  return db.diaryEntries.get(diaryEntryId(date, personaId));
}

export async function getYesterdayDiary(
  personaId: string,
  now: Date = new Date(),
): Promise<DiaryEntry | undefined> {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const date = formatLocalDate(y);
  const entry = await getDiaryEntry(date, personaId);
  if (!entry || entry.status !== 'done' || !entry.content.trim()) return undefined;
  return entry;
}

export async function putPendingDiary(opts: {
  date: string;
  personaId: string;
  model: string;
  endpointId: string;
  conversationIds: string[];
}): Promise<DiaryEntry> {
  const now = Date.now();
  const entry: DiaryEntry = {
    id: diaryEntryId(opts.date, opts.personaId),
    date: opts.date,
    personaId: opts.personaId,
    content: '',
    model: opts.model,
    endpointId: opts.endpointId,
    conversationIds: opts.conversationIds,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  await db.diaryEntries.put(entry);
  return entry;
}

export async function completeDiary(
  id: string,
  content: string,
): Promise<void> {
  await db.diaryEntries.update(id, {
    content: content.trim(),
    status: 'done',
    errorMessage: undefined,
    updatedAt: Date.now(),
  });
}

export async function failDiary(id: string, errorMessage: string): Promise<void> {
  await db.diaryEntries.update(id, {
    status: 'error',
    errorMessage,
    updatedAt: Date.now(),
  });
}

export async function skipDiary(opts: {
  date: string;
  personaId: string;
  reason: string;
}): Promise<void> {
  const now = Date.now();
  const existing = await getDiaryEntry(opts.date, opts.personaId);
  if (existing?.status === 'done') return;
  await db.diaryEntries.put({
    id: diaryEntryId(opts.date, opts.personaId),
    date: opts.date,
    personaId: opts.personaId,
    content: '',
    model: '',
    endpointId: '',
    conversationIds: [],
    status: 'skipped',
    errorMessage: opts.reason,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}
