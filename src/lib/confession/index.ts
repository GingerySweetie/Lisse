/**
 * Confession booth — client-side writer + archive.
 *
 * Around writeHour, if the day's chats hit desire/attachment triggers,
 * 理理酱 generates a private confession (JSON) via his usual chat model.
 * Entries are auto-archived in Dexie for the user to read next day.
 *
 * IMPORTANT: never inject confession text into persona chat prompts.
 * He must not know the user can open the archive.
 */

import { getSettings } from '../../db';
import type { ConfessionEntry } from '../../types';
import {
  FIRST_CHECK_MS,
  TICK_MS,
  mergeConfessionCfg,
} from './defaults';
import { datesNeedingConfession } from './schedule';
import { formatLocalDate } from './store';
import { listConfessionPersonas, writePersonaConfession } from './write';

export { DEFAULT_CONFESSION, mergeConfessionCfg, RIRICHAN_ID } from './defaults';
export { datesNeedingConfession } from './schedule';
export {
  confessionEntryId,
  formatLocalDate,
  getConfessionEntry,
  getYesterdayConfession,
  listConfessionArchives,
  yesterdayDate,
} from './store';
export { listConfessionPersonas, writePersonaConfession } from './write';
export { approachConfession, type ApproachResult } from './approach';
export { scoreConfessionTrigger } from './trigger';
export { buildConfessionSystemPrompt, buildConfessionUserPrompt } from './prompt';
export { parseConfessionOutput } from './parse';
export { computeRecentCloseness } from './closeness';
export {
  buildWorldviewBlock,
  closenessBand,
  closenessLabel,
  composeConfessionCloseness,
} from './worldview';

let loopTimer: ReturnType<typeof setTimeout> | null = null;
let tickInFlight = false;

/** Call once on app mount. Idempotent. */
export function bootstrapConfession(): void {
  if (loopTimer !== null) return;
  loopTimer = setTimeout(() => void loop(), FIRST_CHECK_MS);
}

async function loop(): Promise<void> {
  loopTimer = null;
  try {
    await confessionTick();
  } catch (e) {
    console.error('[confession] tick error', e);
  }
  loopTimer = setTimeout(() => void loop(), TICK_MS);
}

/**
 * One scheduler tick. Also usable for manual "立刻写今天的告解".
 * `forceToday` rewrites today's entries even if already done.
 */
export async function confessionTick(opts?: {
  forceToday?: boolean;
}): Promise<ConfessionEntry[]> {
  if (tickInFlight && !opts?.forceToday) {
    console.log('[confession] SKIP — tick already in flight');
    return [];
  }
  tickInFlight = true;
  const written: ConfessionEntry[] = [];
  try {
    const settings = await getSettings();
    const cfg = mergeConfessionCfg(settings.confession);
    if (!cfg.enabled && !opts?.forceToday) {
      return [];
    }

    const now = new Date();
    const dates = datesNeedingConfession(now, cfg.writeHour, !!opts?.forceToday);
    if (dates.length === 0) return [];

    const personas = await listConfessionPersonas(cfg);
    if (personas.length === 0) {
      console.log('[confession] SKIP — no personas');
      return [];
    }

    const today = formatLocalDate(now);
    for (const date of dates) {
      for (const persona of personas) {
        const entry = await writePersonaConfession({
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
