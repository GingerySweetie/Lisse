import type { WeeklyDiarySettings } from '../../types';

export const DEFAULT_WEEKLY_DIARY: WeeklyDiarySettings = {
  enabled: true,
  /** Friday — start reading last week's 周记 and begin a new week. */
  readWeekday: 5,
  /** Local hour on/after readWeekday when the just-ended week is written. */
  writeHour: 9,
  personaIds: [],
};

/** First scheduler tick after app mount (share diary cadence). */
export const FIRST_CHECK_MS = 2 * 60 * 1000;
export const TICK_MS = 10 * 60 * 1000;
export const PENDING_STALE_MS = 15 * 60 * 1000;
/** Soft cap on material fed into the weekly diary prompt. */
export const MAX_WEEK_MATERIAL_CHARS = 16_000;
/** Catch up this many past completed weeks if the app was closed. */
export const LOOKBACK_WEEKS = 4;

export const WEEKDAY_LABELS = [
  '周日',
  '周一',
  '周二',
  '周三',
  '周四',
  '周五',
  '周六',
] as const;

export function mergeWeeklyDiaryCfg(
  partial?: Partial<WeeklyDiarySettings> | null,
): WeeklyDiarySettings {
  return {
    ...DEFAULT_WEEKLY_DIARY,
    ...(partial ?? {}),
    personaIds: partial?.personaIds ? [...partial.personaIds] : [],
    readWeekday: clampWeekday(
      partial?.readWeekday ?? DEFAULT_WEEKLY_DIARY.readWeekday,
    ),
    writeHour: clampHour(partial?.writeHour ?? DEFAULT_WEEKLY_DIARY.writeHour),
  };
}

export function clampWeekday(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_WEEKLY_DIARY.readWeekday;
  return Math.min(6, Math.max(0, Math.floor(n)));
}

export function clampHour(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_WEEKLY_DIARY.writeHour;
  return Math.min(23, Math.max(0, Math.floor(n)));
}
