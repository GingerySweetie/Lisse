/**
 * Trim conversation branch before sending to the model.
 *
 * Two independent levers (applied in order):
 *  1. historyTodayOnly — drop messages from before local midnight.
 *     Cross-day continuity comes from persona + memory + yesterday's diary
 *     (+ optional style), not from replaying yesterday's full transcript.
 *  2. maxHistoryTurns — keep only recent message pairs, dropping in chunks
 *     so Anthropic BP4 cache stickiness isn't busted every turn.
 */
import type { Message } from '../types';

export interface HistoryWindowOpts {
  /** Drop messages created before today's local 00:00. Default true. */
  historyTodayOnly?: boolean;
  /** Max user/assistant pairs to keep (null / 0 / undefined = unlimited). */
  maxHistoryTurns?: number | null;
  /** Override "now" for tests. */
  now?: Date;
}

/** Local-calendar midnight for `now` (ms). */
export function localTodayStartMs(now: Date = new Date()): number {
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
}

/**
 * Apply day-boundary + turn-count windows to an active branch.
 * Preserves message order. Does not mutate the input array.
 */
export function trimHistoryForContext(
  branch: Message[],
  opts: HistoryWindowOpts = {},
): Message[] {
  let trimmed = branch;

  if (opts.historyTodayOnly !== false) {
    const start = localTodayStartMs(opts.now ?? new Date());
    trimmed = trimmed.filter((m) => m.createdAt >= start);
  }

  const maxTurns = opts.maxHistoryTurns;
  if (maxTurns && maxTurns > 0) {
    const keep = maxTurns * 2;
    if (trimmed.length > keep) {
      // Drop oldest in chunks of half the window so the window start stays
      // byte-identical for keep/2 turns between rebuilds (BP4 cache hits).
      const chunk = Math.max(2, Math.floor(keep / 2));
      const drop = Math.ceil((trimmed.length - keep) / chunk) * chunk;
      trimmed = trimmed.slice(drop);
    }
  }

  return trimmed;
}
