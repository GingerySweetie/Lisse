/**
 * Pure-logic tests for weekly diary schedule / week bounds.
 * Run: node --experimental-strip-types --test scripts/test-weekly-diary.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currentWeekStart,
  formatLocalDate,
  formatWeeklyDiaryBlock,
  lastCompletedWeek,
  weekBoundsFromStart,
  weeklyDiaryEntryId,
} from '../src/lib/weekly-diary/format.ts';
import { weeksNeedingWeeklyDiary } from '../src/lib/weekly-diary/schedule.ts';
import { mergeWeeklyDiaryCfg } from '../src/lib/weekly-diary/defaults.ts';

test('weeklyDiaryEntryId is weekStart|personaId', () => {
  assert.equal(
    weeklyDiaryEntryId('2026-07-31', 'persona_ririchan'),
    '2026-07-31|persona_ririchan',
  );
});

test('Friday readWeekday: current week starts on Friday', () => {
  // Fri Aug 7 2026
  const fri = new Date(2026, 7, 7, 10, 0, 0);
  assert.equal(formatLocalDate(currentWeekStart(fri, 5)), '2026-08-07');

  // Sat Aug 8 → still week starting Aug 7
  const sat = new Date(2026, 7, 8, 10, 0, 0);
  assert.equal(formatLocalDate(currentWeekStart(sat, 5)), '2026-08-07');

  // Thu Aug 6 → previous Friday Jul 31
  const thu = new Date(2026, 7, 6, 10, 0, 0);
  assert.equal(formatLocalDate(currentWeekStart(thu, 5)), '2026-07-31');
});

test('lastCompletedWeek on Friday is previous Fri–Thu', () => {
  const fri = new Date(2026, 7, 7, 10, 0, 0);
  const week = lastCompletedWeek(fri, 5);
  assert.equal(week.weekStart, '2026-07-31');
  assert.equal(week.weekEnd, '2026-08-06');
  assert.equal(week.dates.length, 7);
  assert.equal(week.dates[0], '2026-07-31');
  assert.equal(week.dates[6], '2026-08-06');
});

test('weekBoundsFromStart spans 7 inclusive days', () => {
  const b = weekBoundsFromStart('2026-07-31');
  assert.equal(b.weekEnd, '2026-08-06');
  assert.ok(b.endMs > b.startMs);
});

test('weeksNeedingWeeklyDiary skips newest before writeHour on read day', () => {
  // Fri Aug 7 08:00, writeHour 9 → skip newest completed week
  const early = new Date(2026, 7, 7, 8, 0, 0);
  const before = weeksNeedingWeeklyDiary(early, 5, 9, false);
  assert.ok(!before.includes('2026-07-31'));
  assert.ok(before.includes('2026-07-24'));

  // Fri Aug 7 10:00 → include
  const late = new Date(2026, 7, 7, 10, 0, 0);
  const after = weeksNeedingWeeklyDiary(late, 5, 9, false);
  assert.equal(after[0], '2026-07-31');

  // forceLast ignores hour gate
  const forced = weeksNeedingWeeklyDiary(early, 5, 9, true);
  assert.equal(forced[0], '2026-07-31');
});

test('weeksNeedingWeeklyDiary on Saturday includes last week', () => {
  const sat = new Date(2026, 7, 8, 10, 0, 0);
  const weeks = weeksNeedingWeeklyDiary(sat, 5, 9, false);
  assert.equal(weeks[0], '2026-07-31');
});

test('formatWeeklyDiaryBlock empty when no content', () => {
  assert.equal(
    formatWeeklyDiaryBlock({
      weekStart: '2026-07-31',
      weekEnd: '2026-08-06',
      content: '  ',
    }),
    '',
  );
});

test('formatWeeklyDiaryBlock wraps body', () => {
  const block = formatWeeklyDiaryBlock({
    weekStart: '2026-07-31',
    weekEnd: '2026-08-06',
    content: '这周她体检了。',
  });
  assert.match(block, /上周写下的周记/);
  assert.match(block, /2026-07-31 ~ 2026-08-06/);
  assert.match(block, /体检/);
});

test('mergeWeeklyDiaryCfg defaults to Friday / hour 9', () => {
  const cfg = mergeWeeklyDiaryCfg(null);
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.readWeekday, 5);
  assert.equal(cfg.writeHour, 9);
  assert.deepEqual(cfg.personaIds, []);
});
