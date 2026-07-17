import { db } from '../../db';
import type {
  TravelEvent,
  TravelHeldPush,
  TravelTrip,
} from '../../types';
import { newId } from '../id';
import {
  TRAVEL_DEDUP_KV,
  TRAVEL_LAST_PUSH_KV,
  TRAVEL_STATE_KV,
} from './defaults';

export interface TravelDaemonRuntimeState {
  /** Reserved departure for a calendar day. */
  reservedDeparture?: { dateKey: string; hour: number } | null;
  /** Last tick timestamp. */
  lastTickAt?: number;
  /** Trip id currently running (crash guard). */
  runningTripId?: string | null;
}

export async function getTravelState(): Promise<TravelDaemonRuntimeState> {
  const row = await db.kv.get(TRAVEL_STATE_KV);
  if (!row) return {};
  return (row.value as TravelDaemonRuntimeState) ?? {};
}

export async function saveTravelState(
  patch: Partial<TravelDaemonRuntimeState>,
): Promise<TravelDaemonRuntimeState> {
  const cur = await getTravelState();
  const next = { ...cur, ...patch };
  await db.kv.put({ key: TRAVEL_STATE_KV, value: next });
  return next;
}

export async function markEvent(
  kind: TravelEvent['kind'],
  reason: string,
  detail?: Record<string, unknown>,
  tripId?: string,
): Promise<TravelEvent> {
  const ev: TravelEvent = {
    id: newId(),
    kind,
    reason,
    detail,
    tripId,
    createdAt: Date.now(),
  };
  await db.travelEvents.add(ev);
  return ev;
}

export async function getLastCompletedTripAt(
  personaId: string,
): Promise<number | null> {
  const trips = await db.travelTrips
    .where('personaId')
    .equals(personaId)
    .sortBy('createdAt');
  for (let i = trips.length - 1; i >= 0; i--) {
    const trip = trips[i];
    if (trip?.status === 'completed') {
      return trip.completedAt ?? trip.createdAt;
    }
  }
  return null;
}

export async function listRecentLocations(
  personaId: string,
  limit: number,
): Promise<string[]> {
  const trips = await db.travelTrips
    .where('personaId')
    .equals(personaId)
    .sortBy('createdAt');
  const out: string[] = [];
  for (let i = trips.length - 1; i >= 0 && out.length < limit; i--) {
    const t = trips[i];
    if (t?.status === 'completed' && t.location) {
      out.push(`${t.location}（${t.era}）`);
    }
  }
  return out;
}

export async function createRunningTrip(
  partial: Pick<TravelTrip, 'personaId' | 'model'>,
): Promise<TravelTrip> {
  const trip: TravelTrip = {
    id: newId(),
    personaId: partial.personaId,
    model: partial.model,
    status: 'running',
    monologue: '',
    location: '',
    era: '',
    feeling: '',
    imageUrl: '',
    imageSource: '',
    gift: '',
    invite: false,
    message: '',
    emotionalScore: 0,
    memoryLabel: 'alone',
    createdAt: Date.now(),
  };
  await db.travelTrips.add(trip);
  return trip;
}

export async function completeTrip(
  tripId: string,
  data: Omit<
    TravelTrip,
    | 'id'
    | 'personaId'
    | 'model'
    | 'status'
    | 'createdAt'
    | 'completedAt'
    | 'errorMessage'
  >,
): Promise<TravelTrip> {
  const patch = {
    ...data,
    status: 'completed' as const,
    completedAt: Date.now(),
  };
  await db.travelTrips.update(tripId, patch);
  const trip = await db.travelTrips.get(tripId);
  if (!trip) throw new Error('trip missing after complete');
  return trip;
}

export async function failTrip(
  tripId: string,
  errorMessage: string,
): Promise<void> {
  await db.travelTrips.update(tripId, {
    status: 'error',
    errorMessage,
    completedAt: Date.now(),
  });
}

export async function getDedupMap(): Promise<Record<string, number>> {
  const row = await db.kv.get(TRAVEL_DEDUP_KV);
  if (!row) return {};
  return (row.value as Record<string, number>) ?? {};
}

export async function rememberDedup(dedupKey: string, at: number): Promise<void> {
  const map = await getDedupMap();
  map[dedupKey] = at;
  // Prune entries older than 14 days.
  const cutoff = at - 14 * 24 * 60 * 60 * 1000;
  for (const [k, v] of Object.entries(map)) {
    if (v < cutoff) delete map[k];
  }
  await db.kv.put({ key: TRAVEL_DEDUP_KV, value: map });
}

export async function getLastPushAt(): Promise<number | null> {
  const row = await db.kv.get(TRAVEL_LAST_PUSH_KV);
  return row ? (row.value as number) : null;
}

export async function setLastPushAt(at: number): Promise<void> {
  await db.kv.put({ key: TRAVEL_LAST_PUSH_KV, value: at });
}

export async function holdPush(opts: {
  text: string;
  dedupKey: string;
  kind: 'normal' | 'high_priority';
  reason: string;
  tripId?: string;
}): Promise<TravelHeldPush> {
  const row: TravelHeldPush = {
    id: newId(),
    text: opts.text,
    dedupKey: opts.dedupKey,
    kind: opts.kind,
    reason: opts.reason,
    tripId: opts.tripId,
    createdAt: Date.now(),
    seen: false,
  };
  await db.travelHeldPushes.add(row);
  return row;
}

export async function markHeldSeen(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id) => db.travelHeldPushes.update(id, { seen: true })),
  );
}
