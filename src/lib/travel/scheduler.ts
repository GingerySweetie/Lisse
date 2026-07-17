/**
 * Upper layer — pure code, no LLM.
 *
 * Decides *whether* / *when* the persona should leave. Randomness is
 * only used to pick a departure hour once a trip day is chosen.
 */

import type { TravelDaemonSettings } from '../../types';

/** Hours the scheduler may pick as departure time (local). */
export const DEPARTURE_HOURS = [9, 10, 11, 14, 15, 16, 19, 20] as const;

export interface SchedulerInput {
  now: Date;
  /** Timestamp of last completed trip, or null if never. */
  lastTripAt: number | null;
  /** 0–1; high = clingy / recently chatting a lot. */
  closeness: number;
  /** 0–1; high = user seems worried / low / period / tired. */
  selfConcern: number;
  cfg: Pick<
    TravelDaemonSettings,
    | 'minDaysBetween'
    | 'maxDaysBetween'
    | 'closenessSuppressAt'
    | 'selfConcernSuppressAt'
  >;
  /**
   * If a previous tick already reserved a departure hour for today
   * (YYYY-MM-DD → hour), reuse it so we don't re-roll every hour.
   */
  reservedDeparture?: { dateKey: string; hour: number } | null;
  /** Deterministic RNG override for tests. */
  random?: () => number;
}

export type SchedulerDecision =
  | { action: 'go'; reason: string; forced: boolean }
  | {
      action: 'skip';
      reason: string;
      code:
        | 'too_soon'
        | 'waiting_for_hour'
        | 'closeness'
        | 'self_concern'
        | 'not_today';
      reservedDeparture?: { dateKey: string; hour: number };
    };

export function daysSince(lastTripAt: number | null, now: Date): number {
  if (lastTripAt == null) return Number.POSITIVE_INFINITY;
  return (now.getTime() - lastTripAt) / (24 * 60 * 60 * 1000);
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Pure scheduler tick. */
export function decideTravel(input: SchedulerInput): SchedulerDecision {
  const {
    now,
    lastTripAt,
    closeness,
    selfConcern,
    cfg,
    reservedDeparture,
    random = Math.random,
  } = input;

  const elapsed = daysSince(lastTripAt, now);
  const forced = elapsed > cfg.maxDaysBetween;

  if (elapsed < cfg.minDaysBetween) {
    return {
      action: 'skip',
      reason: `距上次出行仅 ${elapsed.toFixed(1)} 天，低于下限 ${cfg.minDaysBetween} 天`,
      code: 'too_soon',
    };
  }

  // Emotional / relational suppression — skipped when forced by upper bound.
  if (!forced) {
    if (closeness >= cfg.closenessSuppressAt) {
      return {
        action: 'skip',
        reason: `亲密度 ${closeness.toFixed(2)} ≥ ${cfg.closenessSuppressAt}，留下陪着`,
        code: 'closeness',
      };
    }
    if (selfConcern >= cfg.selfConcernSuppressAt) {
      return {
        action: 'skip',
        reason: `自我关切 ${selfConcern.toFixed(2)} ≥ ${cfg.selfConcernSuppressAt}，留下来照顾`,
        code: 'self_concern',
      };
    }
  }

  // Pick (or reuse) today's departure hour. Randomness only selects the hour.
  const today = dateKey(now);
  let hour: number;
  let reserved: { dateKey: string; hour: number };
  if (reservedDeparture?.dateKey === today) {
    hour = reservedDeparture.hour;
    reserved = reservedDeparture;
  } else {
    const idx = Math.floor(random() * DEPARTURE_HOURS.length);
    hour = DEPARTURE_HOURS[idx] ?? DEPARTURE_HOURS[0];
    reserved = { dateKey: today, hour };
  }

  const currentHour = now.getHours();
  if (currentHour < hour) {
    return {
      action: 'skip',
      reason: `今天已定 ${hour}:00 出门，现在还早（${currentHour} 点）`,
      code: 'waiting_for_hour',
      reservedDeparture: reserved,
    };
  }

  // After the reserved hour on a valid day → go.
  // If we somehow already passed every hour without going (app closed),
  // still go — the reservation exists for this calendar day.
  return {
    action: 'go',
    forced,
    reason: forced
      ? `已超过上限 ${cfg.maxDaysBetween} 天（${elapsed.toFixed(1)}），强制出行`
      : `距上次 ${elapsed === Number.POSITIVE_INFINITY ? '从未' : elapsed.toFixed(1) + ' 天'}，到点出门（${hour}:00）`,
  };
}

/**
 * Closeness proxy from recent chat density.
 * messagesInWindow / windowCap, clamped to [0, 1].
 */
export function scoreCloseness(
  recentUserMessages: number,
  windowCap = 20,
): number {
  if (windowCap <= 0) return 0;
  return Math.max(0, Math.min(1, recentUserMessages / windowCap));
}

/**
 * Self-concern from quick-state tags + late-night awake signals.
 * Weights are intentionally coarse — the point is suppressibility, not therapy.
 */
export function scoreSelfConcern(opts: {
  quickState?: string | null;
  hour: number;
  recentSadOrTired?: boolean;
}): number {
  let score = 0;
  const q = opts.quickState;
  if (q === 'sad') score += 0.7;
  else if (q === 'tired' || q === 'period') score += 0.55;
  else if (q === 'hungry') score += 0.25;
  else if (q === 'wired') score += 0.35;
  if (opts.recentSadOrTired) score += 0.25;
  // Deep night with an open app ≈ can't sleep / needs company.
  if (opts.hour >= 0 && opts.hour < 5) score += 0.2;
  return Math.max(0, Math.min(1, score));
}
