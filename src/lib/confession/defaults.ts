import type { ConfessionSettings } from '../../types';

export const RIRICHAN_ID = 'persona_ririchan';

export const DEFAULT_CONFESSION: ConfessionSettings = {
  enabled: true,
  writeHour: 22,
  personaIds: [RIRICHAN_ID],
};

/** First scheduler tick after app mount. */
export const FIRST_CHECK_MS = 2 * 60 * 1000;
/** Regular tick interval while the app is open. */
export const TICK_MS = 10 * 60 * 1000;
/** Stuck pending rows older than this are retried. */
export const PENDING_STALE_MS = 15 * 60 * 1000;
/** Soft cap on transcript characters fed into the confession prompt. */
export const MAX_TRANSCRIPT_CHARS = 12_000;

/** Base probability of catching him when approaching. */
export const CATCH_CHANCE = 0.22;
/** Soft pity per failed approach (capped). */
export const PITY_PER_MISS = 0.03;
export const PITY_CAP = 0.18;
/** Cooldown after a successful catch. */
export const CATCH_COOLDOWN_MS = 20 * 60 * 1000;

export function mergeConfessionCfg(
  partial?: Partial<ConfessionSettings> | null,
): ConfessionSettings {
  return {
    ...DEFAULT_CONFESSION,
    ...(partial ?? {}),
    personaIds: partial?.personaIds?.length
      ? [...partial.personaIds]
      : [...DEFAULT_CONFESSION.personaIds],
  };
}
