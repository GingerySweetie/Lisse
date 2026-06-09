import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Local-notification helpers. Wraps @capacitor/local-notifications so the
 * rest of the app can call period / nudge reminders without checking
 * platform every time. On web the calls resolve to no-ops.
 */

const PERIOD_REMINDER_ID_BASE = 100; // 100/101/102 → upcoming, due, overdue

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Ask for permission (Android 13+ requires runtime grant). Idempotent. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === 'granted') return true;
    const req = await LocalNotifications.requestPermissions();
    return req.display === 'granted';
  } catch {
    return false;
  }
}

interface PeriodSchedule {
  /** Predicted next period start, ISO date (YYYY-MM-DD). */
  predictedNext: string;
  /** Average cycle in days (just for the overdue label). */
  avgCycle: number;
}

/** Schedule a 3-day-out reminder + a day-of reminder + an overdue ping.
 *  All in the user's local time. Re-scheduling first cancels any existing
 *  period notifications so we don't pile up duplicates after each entry. */
export async function schedulePeriodReminders(
  s: PeriodSchedule,
): Promise<void> {
  if (!isNative()) return;
  const ok = await ensureNotificationPermission();
  if (!ok) return;

  await cancelPeriodReminders();

  const next = new Date(s.predictedNext + 'T09:00:00');
  const items: { id: number; title: string; body: string; at: Date }[] = [];

  const upcoming = new Date(next);
  upcoming.setDate(upcoming.getDate() - 3);
  if (upcoming.getTime() > Date.now()) {
    items.push({
      id: PERIOD_REMINDER_ID_BASE,
      title: '差不多了',
      body: '按周期算，3 天后应该会来。备好。',
      at: upcoming,
    });
  }

  if (next.getTime() > Date.now()) {
    items.push({
      id: PERIOD_REMINDER_ID_BASE + 1,
      title: '今天应该来',
      body: `平均周期 ${s.avgCycle} 天。来了记得点一下。`,
      at: next,
    });
  }

  const overdue = new Date(next);
  overdue.setDate(overdue.getDate() + 3);
  if (overdue.getTime() > Date.now()) {
    items.push({
      id: PERIOD_REMINDER_ID_BASE + 2,
      title: '超过 3 天了',
      body: '如果只是晚一两天属正常。再晚就留意一下。',
      at: overdue,
    });
  }

  if (items.length === 0) return;

  await LocalNotifications.schedule({
    notifications: items.map((it) => ({
      id: it.id,
      title: it.title,
      body: it.body,
      schedule: { at: it.at, allowWhileIdle: true },
      smallIcon: 'ic_launcher_foreground',
    })),
  });
}

export async function cancelPeriodReminders(): Promise<void> {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancel({
      notifications: [
        { id: PERIOD_REMINDER_ID_BASE },
        { id: PERIOD_REMINDER_ID_BASE + 1 },
        { id: PERIOD_REMINDER_ID_BASE + 2 },
      ],
    });
  } catch {
    // ignore
  }
}
