/**
 * Travel Daemon — client-side bootstrap.
 *
 * Upper layer (scheduler) runs hourly with pure code.
 * Lower layer (execute) only fires when the scheduler says go.
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { db, getSettings } from '../../db';
import type { TravelDaemonSettings, TravelTrip } from '../../types';
import {
  getActiveQuickState,
  inferStatus,
} from '../behavior';
import { ensureNotificationPermission } from '../native/notifications';
import { DEFAULT_TRAVEL_DAEMON, FIRST_TICK_MS, TICK_MS } from './defaults';
import {
  mergeTravelCfg,
  resolveTravelEndpoint,
  runTravelTrip,
} from './execute';
import {
  decidePush,
  inQuietWindow,
  isUserAwakeFixed,
  type PushKind,
} from './push';
import {
  decideTravel,
  scoreCloseness,
  scoreSelfConcern,
} from './scheduler';
import {
  getDedupMap,
  getLastCompletedTripAt,
  getLastPushAt,
  getTravelState,
  holdPush,
  markEvent,
  rememberDedup,
  saveTravelState,
  setLastPushAt,
} from './store';

let loopTimer: ReturnType<typeof setTimeout> | null = null;
let tickInFlight = false;

/** Call once on app mount. Idempotent. */
export function bootstrapTravelDaemon(): void {
  if (loopTimer !== null) return;
  loopTimer = setTimeout(() => void loop(), FIRST_TICK_MS);
}

async function loop(): Promise<void> {
  loopTimer = null;
  try {
    await travelTick();
  } catch (e) {
    console.error('[travel] tick error', e);
  }
  loopTimer = setTimeout(() => void loop(), TICK_MS);
}

/** One scheduler tick. Exported for manual "现在出门" from the balcony UI. */
export async function travelTick(opts?: {
  force?: boolean;
}): Promise<TravelTrip | null> {
  if (tickInFlight) {
    console.log('[travel] SKIP — tick already in flight');
    return null;
  }
  tickInFlight = true;
  try {
    const settings = await getSettings();
    const cfg = mergeTravelCfg(settings.travelDaemon);
    if (!cfg.enabled && !opts?.force) {
      return null;
    }

    const state = await getTravelState();
    if (state.runningTripId) {
      // Crash guard: clear stale running flag older than 30 min via trip status.
      const running = await db.travelTrips.get(state.runningTripId);
      if (running?.status === 'running') {
        const age = Date.now() - running.createdAt;
        if (age < 30 * 60 * 1000) {
          await markEvent('skip', '已有进行中的出行', {
            tripId: running.id,
          });
          return null;
        }
        await db.travelTrips.update(running.id, {
          status: 'error',
          errorMessage: 'stale running trip cleared',
          completedAt: Date.now(),
        });
      }
      await saveTravelState({ runningTripId: null });
    }

    const now = new Date();
    const closeness = await computeCloseness(cfg.personaId);
    const selfConcern = computeSelfConcern(now);
    const lastTripAt = await getLastCompletedTripAt(cfg.personaId);

    let decision = decideTravel({
      now,
      lastTripAt,
      closeness,
      selfConcern,
      cfg,
      reservedDeparture: state.reservedDeparture,
    });

    if (opts?.force) {
      decision = {
        action: 'go',
        forced: true,
        reason: '用户在阳台手动触发出行',
      };
    }

    await markEvent('tick', decision.reason, {
      action: decision.action,
      closeness,
      selfConcern,
      lastTripAt,
    });

    if (decision.action === 'skip') {
      if (decision.reservedDeparture) {
        await saveTravelState({
          reservedDeparture: decision.reservedDeparture,
          lastTickAt: Date.now(),
        });
      } else {
        await saveTravelState({ lastTickAt: Date.now() });
      }
      await markEvent('skip', decision.reason, { code: decision.code });
      return null;
    }

    const resolved = await resolveTravelEndpoint(cfg);
    if (!resolved) {
      await markEvent('skip', '未配置 endpoint / model，无法出行');
      return null;
    }
    const persona = await db.personas.get(cfg.personaId);
    if (!persona) {
      await markEvent('skip', `人格 ${cfg.personaId} 不存在`);
      return null;
    }

    // Clear today's reservation once we go.
    await saveTravelState({
      reservedDeparture: null,
      lastTickAt: Date.now(),
    });

    let tripRow: TravelTrip | null = null;
    try {
      tripRow = await runTravelTrip({
        persona,
        cfg,
        endpoint: resolved.endpoint,
        model: resolved.model,
        onCreated: async (tripId) => {
          await saveTravelState({ runningTripId: tripId });
        },
      });
    } finally {
      await saveTravelState({ runningTripId: null });
    }

    if (!tripRow) return null;
    await deliverTripPush(tripRow, cfg);
    return tripRow;
  } finally {
    tickInFlight = false;
  }
}

async function computeCloseness(personaId: string): Promise<number> {
  const since = Date.now() - 6 * 60 * 60 * 1000;
  // Count recent user messages in conversations tagged with this persona.
  const convs = await db.conversations
    .where('personaId')
    .equals(personaId)
    .toArray();
  const roomConvs = await db.conversations
    .filter((c) => c.room != null && c.personaId === personaId)
    .toArray();
  const ids = new Set(
    [...convs, ...roomConvs].map((c) => c.id),
  );
  if (ids.size === 0) {
    // Fallback: any recent user message across the app.
    const recent = await db.messages
      .orderBy('createdAt')
      .reverse()
      .limit(40)
      .toArray();
    const n = recent.filter(
      (m) => m.role === 'user' && m.createdAt >= since,
    ).length;
    return scoreCloseness(n, 20);
  }
  let count = 0;
  for (const id of ids) {
    const msgs = await db.messages
      .where('conversationId')
      .equals(id)
      .sortBy('createdAt');
    count += msgs
      .filter((m) => m.role === 'user' && m.createdAt >= since)
      .slice(-30).length;
    if (count >= 20) break;
  }
  return scoreCloseness(count, 20);
}

function computeSelfConcern(now: Date): number {
  const quick = getActiveQuickState();
  const status = inferStatus();
  const sadOrTired = status.lines.some((l) =>
    /低气压|累|经期|睡不着|刚睡醒/.test(l),
  );
  return scoreSelfConcern({
    quickState: quick?.key ?? null,
    hour: now.getHours(),
    recentSadOrTired: sadOrTired,
  });
}

function recentActivityAwake(): boolean {
  try {
    const lastVisible = Number(localStorage.getItem('lisse:lastVisible') ?? '');
    if (!Number.isFinite(lastVisible)) return false;
    // Active in the last 90 minutes counts as awake signal.
    return Date.now() - lastVisible < 90 * 60 * 1000;
  } catch {
    return false;
  }
}

/** Rough "buried in work" — typing very fast recently + long session. */
function buriedInWorkSignal(): boolean {
  try {
    const typing = Number(localStorage.getItem('lisse:typingMs') ?? '');
    // behavior.ts stores chars/sec under lisse:typingMs (legacy key name).
    if (Number.isFinite(typing) && typing > 4.5) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export async function pushToUser(
  text: string,
  dedupKey: string,
  kind: PushKind,
  opts?: { tripId?: string; cfg?: TravelDaemonSettings },
): Promise<'sent' | 'held' | 'skipped'> {
  const settings = await getSettings();
  const cfg = opts?.cfg ?? mergeTravelCfg(settings.travelDaemon);
  const now = new Date();
  const lastPushAt = await getLastPushAt();
  const hoursSinceLastPush =
    lastPushAt == null
      ? null
      : (now.getTime() - lastPushAt) / (60 * 60 * 1000);

  const userAwake =
    isUserAwakeFixed(now, cfg.quietHours) || recentActivityAwake();
  if (userAwake) {
    await markEvent('user_awake', '清醒闸门通过');
  } else if (inQuietWindow(now, cfg.quietHours)) {
    await markEvent('user_asleep', '静音窗内');
  }

  const decision = decidePush({
    now,
    kind,
    dedupKey,
    quietHours: cfg.quietHours,
    hoursSinceLastPush,
    pushGapHours: cfg.pushGapHours,
    dedupMap: await getDedupMap(),
    dedupHours: cfg.dedupHours,
    userAwake,
    buriedInWork: buriedInWorkSignal(),
  });

  if (decision.action === 'skip') {
    await markEvent('push_skipped', decision.reason, {
      gate: decision.gate,
      dedupKey,
    }, opts?.tripId);
    return 'skipped';
  }

  if (decision.action === 'hold') {
    await holdPush({
      text,
      dedupKey,
      kind,
      reason: decision.reason,
      tripId: opts?.tripId,
    });
    await markEvent('push_held', decision.reason, {
      gate: decision.gate,
      dedupKey,
    }, opts?.tripId);
    return 'held';
  }

  await deliverNotification(text, kind);
  await rememberDedup(dedupKey, now.getTime());
  await setLastPushAt(now.getTime());
  await markEvent('push_sent', decision.reason, { dedupKey, kind }, opts?.tripId);
  return 'sent';
}

async function deliverTripPush(
  trip: TravelTrip,
  cfg: TravelDaemonSettings,
): Promise<void> {
  const text = formatTripPush(trip);
  const dedupKey = `travel:${trip.id}`;
  const kind: PushKind =
    trip.invite || trip.emotionalScore >= 0.85 ? 'high_priority' : 'normal';
  await pushToUser(text, dedupKey, kind, { tripId: trip.id, cfg });
}

export function formatTripPush(trip: TravelTrip): string {
  if (trip.invite) {
    return (
      trip.message.trim() ||
      `我在${trip.location}。你过来。`
    );
  }
  if (trip.message.trim()) return trip.message.trim();
  return `回来了。从${trip.location}带了：${trip.gift}`;
}

async function deliverNotification(
  text: string,
  kind: PushKind,
): Promise<void> {
  // Always leave a console trail (web + native).
  console.log(`[travel] push (${kind}):`, text);

  if (!Capacitor.isNativePlatform()) {
    // Web: try Notification API if permitted; otherwise balcony-only is fine.
    try {
      if (typeof Notification !== 'undefined') {
        if (Notification.permission === 'default') {
          await Notification.requestPermission();
        }
        if (Notification.permission === 'granted') {
          new Notification('出行', { body: text, tag: 'travel-daemon' });
        }
      }
    } catch {
      /* ignore */
    }
    return;
  }

  const ok = await ensureNotificationPermission();
  if (!ok) return;
  const id = 7000 + (Date.now() % 1000);
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: kind === 'high_priority' ? '过来' : '回来了',
          body: text,
          schedule: { at: new Date(Date.now() + 500) },
          smallIcon: 'ic_launcher_foreground',
        },
      ],
    });
  } catch (e) {
    console.warn('[travel] native notify failed', e);
  }
}

export { mergeTravelCfg, DEFAULT_TRAVEL_DAEMON };
