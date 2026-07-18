import type { DiarySettings } from '../../types';

export const DEFAULT_DIARY: DiarySettings = {
  enabled: true,
  writeHour: 23,
  personaIds: [],
};

/** First scheduler tick after app mount. */
export const FIRST_CHECK_MS = 2 * 60 * 1000;
/** Regular tick interval while the app is open. */
export const TICK_MS = 10 * 60 * 1000;
/** Stuck pending rows older than this are retried. */
export const PENDING_STALE_MS = 15 * 60 * 1000;
/** Soft cap on transcript characters fed into the diary prompt. */
export const MAX_TRANSCRIPT_CHARS = 12_000;

export function mergeDiaryCfg(
  partial?: Partial<DiarySettings> | null,
): DiarySettings {
  return {
    ...DEFAULT_DIARY,
    ...(partial ?? {}),
    personaIds: partial?.personaIds ? [...partial.personaIds] : [],
  };
}
