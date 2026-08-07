/**
 * Weekly Diary (周记) — client-side scheduler.
 *
 * On `readWeekday` (default Friday) at `writeHour`, each persona writes a
 * concise weekly diary from that week's daily diaries / chats. Chat then
 * injects last week's 周记 as a stable system block until the next
 * readWeekday. Personal facts (健康 / 体检 / 具体事件) are extracted into
 * memory when memory+extractor are configured.
 */

import { getSettings } from '../../db';
import type { WeeklyDiaryEntry } from '../../types';
import {
  FIRST_CHECK_MS,
  TICK_MS,
  mergeWeeklyDiaryCfg,
} from './defaults';
import { weeksNeedingWeeklyDiary } from './schedule';
import {
  formatLastWeekBlock,
  getLastWeekDiary,
} from './store';
import { listWeeklyDiaryPersonas, writePersonaWeeklyDiary } from './write';

export {
  DEFAULT_WEEKLY_DIARY,
  WEEKDAY_LABELS,
  mergeWeeklyDiaryCfg,
} from './defaults';
export {
  currentWeekStart,
  formatLocalDate,
  formatWeeklyDiaryBlock,
  lastCompletedWeek,
  weekBoundsFromStart,
  weeklyDiaryEntryId,
} from './format';
export { weeksNeedingWeeklyDiary } from './schedule';
export {
  formatLastWeekBlock,
  getLastWeekDiary,
  getWeeklyDiaryEntry,
} from './store';
export { listWeeklyDiaryPersonas, writePersonaWeeklyDiary } from './write';

let loopTimer: ReturnType<typeof setTimeout> | null = null;
let tickInFlight = false;

/** Call once on app mount. Idempotent. */
export function bootstrapWeeklyDiary(): void {
  if (loopTimer !== null) return;
  loopTimer = setTimeout(() => void loop(), FIRST_CHECK_MS);
}

async function loop(): Promise<void> {
  loopTimer = null;
  try {
    await weeklyDiaryTick();
  } catch (e) {
    console.error('[weekly-diary] tick error', e);
  }
  loopTimer = setTimeout(() => void loop(), TICK_MS);
}

/**
 * One scheduler tick. Also exported for Settings「立即写上周周记」.
 * `forceLast` rewrites the most recently completed week even if done.
 */
export async function weeklyDiaryTick(opts?: {
  forceLast?: boolean;
}): Promise<WeeklyDiaryEntry[]> {
  if (tickInFlight && !opts?.forceLast) {
    console.log('[weekly-diary] SKIP — tick already in flight');
    return [];
  }
  tickInFlight = true;
  const written: WeeklyDiaryEntry[] = [];
  try {
    const settings = await getSettings();
    const cfg = mergeWeeklyDiaryCfg(settings.weeklyDiary);
    if (!cfg.enabled && !opts?.forceLast) {
      return [];
    }

    const now = new Date();
    const weeks = weeksNeedingWeeklyDiary(
      now,
      cfg.readWeekday,
      cfg.writeHour,
      !!opts?.forceLast,
    );
    if (weeks.length === 0) return [];

    const personas = await listWeeklyDiaryPersonas(cfg);
    if (personas.length === 0) {
      console.log('[weekly-diary] SKIP — no personas');
      return [];
    }

    const newest = weeks[0];
    for (const weekStart of weeks) {
      for (const persona of personas) {
        const entry = await writePersonaWeeklyDiary({
          persona,
          weekStart,
          force: !!opts?.forceLast && weekStart === newest,
        });
        if (entry && entry.status === 'done') written.push(entry);
      }
    }
  } finally {
    tickInFlight = false;
  }
  return written;
}

/** Load + format last week's 周记 for prompt injection. Empty if none. */
export async function formatLastWeekDiaryBlock(
  personaId: string | undefined | null,
): Promise<string> {
  if (!personaId || personaId === 'persona_default') return '';
  try {
    const settings = await getSettings();
    const cfg = mergeWeeklyDiaryCfg(settings.weeklyDiary);
    if (cfg.personaIds.length > 0 && !cfg.personaIds.includes(personaId)) {
      return '';
    }
    const entry = await getLastWeekDiary(personaId, cfg.readWeekday);
    if (!entry) return '';
    return formatLastWeekBlock(entry);
  } catch {
    return '';
  }
}
