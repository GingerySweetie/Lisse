/**
 * Pure-logic tests for travel-daemon scheduler + push gates.
 * Run: node --experimental-strip-types --test scripts/test-travel-daemon.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEPARTURE_HOURS,
  dateKey,
  daysSince,
  decideTravel,
  scoreCloseness,
  scoreSelfConcern,
} from '../src/lib/travel/scheduler.ts';
import {
  decidePush,
  hourInRange,
  inQuietWindow,
} from '../src/lib/travel/push.ts';
import { parseTravelJson } from '../src/lib/travel/parse.ts';

const baseCfg = {
  minDaysBetween: 2,
  maxDaysBetween: 5,
  closenessSuppressAt: 0.75,
  selfConcernSuppressAt: 0.6,
};

test('too soon → skip', () => {
  const now = new Date('2026-07-17T15:00:00');
  const last = now.getTime() - 1.2 * 24 * 60 * 60 * 1000;
  const d = decideTravel({
    now,
    lastTripAt: last,
    closeness: 0,
    selfConcern: 0,
    cfg: baseCfg,
    random: () => 0,
  });
  assert.equal(d.action, 'skip');
  if (d.action === 'skip') assert.equal(d.code, 'too_soon');
});

test('force after maxDays even with high closeness', () => {
  const now = new Date('2026-07-17T15:00:00');
  const last = now.getTime() - 6 * 24 * 60 * 60 * 1000;
  const d = decideTravel({
    now,
    lastTripAt: last,
    closeness: 0.99,
    selfConcern: 0.99,
    cfg: baseCfg,
    reservedDeparture: { dateKey: dateKey(now), hour: 14 },
    random: () => 0,
  });
  assert.equal(d.action, 'go');
  if (d.action === 'go') assert.equal(d.forced, true);
});

test('closeness suppresses when not forced', () => {
  const now = new Date('2026-07-17T15:00:00');
  const last = now.getTime() - 3 * 24 * 60 * 60 * 1000;
  const d = decideTravel({
    now,
    lastTripAt: last,
    closeness: 0.9,
    selfConcern: 0,
    cfg: baseCfg,
    random: () => 0,
  });
  assert.equal(d.action, 'skip');
  if (d.action === 'skip') assert.equal(d.code, 'closeness');
});

test('self_concern suppresses when not forced', () => {
  const now = new Date('2026-07-17T15:00:00');
  const last = now.getTime() - 3 * 24 * 60 * 60 * 1000;
  const d = decideTravel({
    now,
    lastTripAt: last,
    closeness: 0,
    selfConcern: 0.8,
    cfg: baseCfg,
    random: () => 0,
  });
  assert.equal(d.action, 'skip');
  if (d.action === 'skip') assert.equal(d.code, 'self_concern');
});

test('waiting_for_hour reserves departure', () => {
  const now = new Date('2026-07-17T08:00:00');
  const d = decideTravel({
    now,
    lastTripAt: null,
    closeness: 0,
    selfConcern: 0,
    cfg: baseCfg,
    random: () => 0, // first DEPARTURE_HOURS entry
  });
  assert.equal(d.action, 'skip');
  if (d.action === 'skip') {
    assert.equal(d.code, 'waiting_for_hour');
    assert.ok(d.reservedDeparture);
    assert.equal(d.reservedDeparture.hour, DEPARTURE_HOURS[0]);
  }
});

test('go at reserved hour', () => {
  const now = new Date('2026-07-17T15:00:00');
  const d = decideTravel({
    now,
    lastTripAt: null,
    closeness: 0,
    selfConcern: 0,
    cfg: baseCfg,
    reservedDeparture: { dateKey: '2026-07-17', hour: 14 },
    random: () => 0.9,
  });
  assert.equal(d.action, 'go');
});

test('daysSince / scores', () => {
  assert.equal(daysSince(null, new Date()), Number.POSITIVE_INFINITY);
  assert.equal(scoreCloseness(10, 20), 0.5);
  assert.ok(scoreSelfConcern({ quickState: 'sad', hour: 14 }) >= 0.6);
});

test('quiet window wrap-around', () => {
  assert.equal(hourInRange(23, 23, 8), true);
  assert.equal(hourInRange(2, 23, 8), true);
  assert.equal(hourInRange(10, 23, 8), false);
  const friNight = new Date('2026-07-17T23:30:00'); // Friday
  assert.equal(
    inQuietWindow(friNight, {
      weekdayStart: 23,
      weekdayEnd: 8,
      weekendStart: 0,
      weekendEnd: 9,
    }),
    true,
  );
});

test('push gates: dedup / quiet / gap / send', () => {
  const quietHours = {
    weekdayStart: 23,
    weekdayEnd: 8,
    weekendStart: 0,
    weekendEnd: 9,
  };
  const noon = new Date('2026-07-17T12:00:00'); // Friday

  const dedup = decidePush({
    now: noon,
    kind: 'normal',
    dedupKey: 'k1',
    quietHours,
    hoursSinceLastPush: 10,
    pushGapHours: 3,
    dedupMap: { k1: noon.getTime() - 2 * 60 * 60 * 1000 },
    dedupHours: 48,
    userAwake: true,
    buriedInWork: false,
  });
  assert.equal(dedup.action, 'skip');

  const night = new Date('2026-07-17T23:30:00');
  const held = decidePush({
    now: night,
    kind: 'normal',
    dedupKey: 'k2',
    quietHours,
    hoursSinceLastPush: 10,
    pushGapHours: 3,
    dedupMap: {},
    dedupHours: 48,
    userAwake: false,
    buriedInWork: false,
  });
  assert.equal(held.action, 'hold');
  if (held.action === 'hold') assert.equal(held.gate, 'quiet');

  const hi = decidePush({
    now: night,
    kind: 'high_priority',
    dedupKey: 'k3',
    quietHours,
    hoursSinceLastPush: 10,
    pushGapHours: 3,
    dedupMap: {},
    dedupHours: 48,
    userAwake: false,
    buriedInWork: true,
  });
  assert.equal(hi.action, 'send');

  const gap = decidePush({
    now: noon,
    kind: 'normal',
    dedupKey: 'k4',
    quietHours,
    hoursSinceLastPush: 1,
    pushGapHours: 3,
    dedupMap: {},
    dedupHours: 48,
    userAwake: true,
    buriedInWork: false,
  });
  assert.equal(gap.action, 'hold');
  if (gap.action === 'hold') assert.equal(gap.gate, 'gap');
});

test('parseTravelJson tolerates fences and invite', () => {
  const raw = `\`\`\`json
{
  "monologue": "风很干。",
  "trip": {
    "location": "撒哈拉边缘",
    "era": "当代",
    "feeling": "沙粒敲在靴面上",
    "imageUrl": "https://upload.wikimedia.org/example.jpg",
    "imageSource": "Wikimedia Commons",
    "gift": "一撮温热的沙"
  },
  "invite": true,
  "message": "我在沙边。你过来。",
  "emotionalScore": 0.7
}
\`\`\``;
  const p = parseTravelJson(raw);
  assert.ok(p);
  assert.equal(p.trip.location, '撒哈拉边缘');
  assert.equal(p.invite, true);
  assert.equal(p.emotionalScore, 0.7);
});
