/**
 * Push logic — quiet by default.
 *
 * pushToUser(text, dedupKey, kind) runs a series of gates. Failures
 * become "held" balcony items (audited, not retried as notifications).
 */

import type { TravelDaemonSettings } from '../../types';

export type PushKind = 'normal' | 'high_priority';

export interface QuietHours {
  weekdayStart: number;
  weekdayEnd: number;
  weekendStart: number;
  weekendEnd: number;
}

export interface PushGateInput {
  now: Date;
  kind: PushKind;
  dedupKey: string;
  quietHours: QuietHours;
  /** Hours since last delivered push. */
  hoursSinceLastPush: number | null;
  pushGapHours: number;
  /** Dedup map: key → last-sent timestamp ms. */
  dedupMap: Record<string, number>;
  dedupHours: number;
  /** User is considered awake (fixed hours OR recent activity). */
  userAwake: boolean;
  /** Continuous work / commit-like signal — Gate 3. */
  buriedInWork: boolean;
}

export type PushDecision =
  | { action: 'send'; reason: string }
  | {
      action: 'hold' | 'skip';
      reason: string;
      gate: 'dedup' | 'quiet' | 'awake' | 'gap' | 'work';
    };

/** True when local hour falls inside the configured sleep window. */
export function inQuietWindow(now: Date, q: QuietHours): boolean {
  const hour = now.getHours();
  const day = now.getDay(); // 0=Sun … 6=Sat
  const weekend = day === 0 || day === 6;
  const start = weekend ? q.weekendStart : q.weekdayStart;
  const end = weekend ? q.weekendEnd : q.weekdayEnd;
  return hourInRange(hour, start, end);
}

/** Inclusive start, exclusive end; supports wrap-around (23→8). */
export function hourInRange(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

/**
 * Fixed awake window complementary to quiet hours, OR recent activity
 * already folded into `userAwake` by the caller.
 */
export function isUserAwakeFixed(now: Date, q: QuietHours): boolean {
  return !inQuietWindow(now, q);
}

export function decidePush(input: PushGateInput): PushDecision {
  const {
    now,
    kind,
    dedupKey,
    quietHours,
    hoursSinceLastPush,
    pushGapHours,
    dedupMap,
    dedupHours,
    userAwake,
    buriedInWork,
  } = input;

  const lastDedup = dedupMap[dedupKey];
  if (lastDedup != null) {
    const ageH = (now.getTime() - lastDedup) / (60 * 60 * 1000);
    if (ageH < dedupHours) {
      return {
        action: 'skip',
        gate: 'dedup',
        reason: `dedupKey「${dedupKey}」${ageH.toFixed(1)}h 内已推过（窗 ${dedupHours}h）`,
      };
    }
  }

  const quiet = inQuietWindow(now, quietHours);
  if (quiet && kind !== 'high_priority') {
    return {
      action: 'hold',
      gate: 'quiet',
      reason: '静音窗内，普通消息被吞掉，落到阳台',
    };
  }

  // Gate 1 — awake
  if (!userAwake && kind !== 'high_priority') {
    return {
      action: 'hold',
      gate: 'awake',
      reason: '用户不在清醒窗且无近期活跃信号',
    };
  }

  // Gate 2 — no double interruption
  if (
    kind !== 'high_priority' &&
    hoursSinceLastPush != null &&
    hoursSinceLastPush < pushGapHours
  ) {
    return {
      action: 'hold',
      gate: 'gap',
      reason: `距上次推送仅 ${hoursSinceLastPush.toFixed(1)}h，低于间隔 ${pushGapHours}h`,
    };
  }

  // Gate 3 — not buried in work
  if (buriedInWork && kind !== 'high_priority') {
    return {
      action: 'hold',
      gate: 'work',
      reason: '检测到埋头工作信号，不打扰',
    };
  }

  // Gate 4 already covered by quiet check for normal; high_priority penetrates.
  return {
    action: 'send',
    reason:
      kind === 'high_priority' && quiet
        ? '高优先级穿透静音窗'
        : '通过全部推送闸门',
  };
}

/** Merge defaults for quiet-hours from settings. */
export function quietFromCfg(
  cfg: TravelDaemonSettings['quietHours'],
): QuietHours {
  return { ...cfg };
}
