import type { TravelDaemonSettings } from '../../types';

export const DEFAULT_TRAVEL_DAEMON: TravelDaemonSettings = {
  enabled: false,
  personaId: 'persona_ririchan',
  endpointId: null,
  model: null,
  minDaysBetween: 2,
  maxDaysBetween: 5,
  antiRepeatCount: 8,
  maxTurns: 4,
  closenessSuppressAt: 0.75,
  selfConcernSuppressAt: 0.6,
  quietHours: {
    weekdayStart: 23,
    weekdayEnd: 8,
    weekendStart: 0,
    weekendEnd: 9,
  },
  pushGapHours: 3,
  dedupHours: 48,
};

/** Tick interval — upper layer runs once an hour (doc: hourly cron). */
export const TICK_MS = 60 * 60 * 1000;

/** First check shortly after boot so a long-closed tab still catches up. */
export const FIRST_TICK_MS = 45 * 1000;

export const TRAVEL_STATE_KV = 'travel_daemon_state';
export const TRAVEL_DEDUP_KV = 'travel_push_dedup';
export const TRAVEL_LAST_PUSH_KV = 'travel_last_push_at';
