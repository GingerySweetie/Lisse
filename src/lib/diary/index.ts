/**
 * Daily Diary — client-side scheduler.
 *
 * Around writeHour (default 23:00), each persona uses their usual chat model
 * to write a private diary about that day's conversations. If the app was
 * closed at 23:00, catch-up runs on the next open (for recent days).
 *
 * Next-day chats inject yesterday's diary via formatYesterdayDiaryBlock().
 */

import { getSettings } from '../../db';
import type { DiaryEntry } from '../../types';
import {
  FIRST_CHECK_MS,
  TICK_MS,
  mergeDiaryCfg,
} from './defaults';
import { datesNeedingDiary } from './schedule';
import {
  formatDiaryBlock,
  formatLocalDate,
  getYesterdayDiary,
} from './store';
import { listDiaryPersonas, writePersonaDiary } from './write';

export { DEFAULT_DIARY, mergeDiaryCfg } from './defaults';
export { datesNeedingDiary } from './schedule';
export {
  formatDiaryBlock,
  formatLocalDate,
  getDiaryEntry,
  getYesterdayDiary,
} from './store';
export { listDiaryPersonas, writePersonaDiary } from './write';

let loopTimer: ReturnType<typeof setTimeout> | null = null;
let tickInFlight = false;

/** Call once on app mount. Idempotent. */
export function bootstrapDiary(): void {
  if (loopTimer !== null) return;
  loopTimer = setTimeout(() => void loop(), FIRST_CHECK_MS);
}

async function loop(): Promise<void> {
  loopTimer = null;
  try {
    await diaryTick();
  } catch (e) {
    console.error('[diary] tick error', e);
  }
  loopTimer = setTimeout(() => void loop(), TICK_MS);
}

/**
 * One scheduler tick. Also exported for Settings "立即写今天的日记".
 * `forceToday` rewrites today's entries even if already done.
 */
export async function diaryTick(opts?: {
  forceToday?: boolean;
}): Promise<DiaryEntry[]> {
  if (tickInFlight && !opts?.forceToday) {
    console.log('[diary] SKIP — tick already in flight');
    return [];
  }
  tickInFlight = true;
  const written: DiaryEntry[] = [];
  try {
    const settings = await getSettings();
    const cfg = mergeDiaryCfg(settings.diary);
    if (!cfg.enabled && !opts?.forceToday) {
      return [];
    }

    const now = new Date();
    const dates = datesNeedingDiary(now, cfg.writeHour, !!opts?.forceToday);
    if (dates.length === 0) {
      return [];
    }

    const personas = await listDiaryPersonas(cfg);
    if (personas.length === 0) {
      console.log('[diary] SKIP — no personas');
      return [];
    }

    const today = formatLocalDate(now);
    for (const date of dates) {
      for (const persona of personas) {
        const entry = await writePersonaDiary({
          persona,
          date,
          force: !!opts?.forceToday && date === today,
        });
        if (entry && entry.status === 'done') written.push(entry);
      }
    }
  } finally {
    tickInFlight = false;
  }
  return written;
}

/** Load + format yesterday's diary for prompt injection. Empty if none. */
export async function formatYesterdayDiaryBlock(
  personaId: string | undefined | null,
): Promise<string> {
  if (!personaId || personaId === 'persona_default') return '';
  try {
    const settings = await getSettings();
    const cfg = mergeDiaryCfg(settings.diary);
    // Still inject even if writing is currently disabled — past diaries remain.
    if (cfg.personaIds.length > 0 && !cfg.personaIds.includes(personaId)) {
      return '';
    }
    const entry = await getYesterdayDiary(personaId);
    if (!entry) return '';
    return formatDiaryBlock(entry);
  } catch {
    return '';
  }
}
