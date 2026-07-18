/**
 * Pure-logic tests for daily diary scheduler helpers.
 * Run: node --experimental-strip-types --test scripts/test-diary.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  diaryEntryId,
  formatDiaryBlock,
  formatLocalDate,
  localDayBounds,
} from '../src/lib/diary/format.ts';
import { datesNeedingDiary } from '../src/lib/diary/schedule.ts';

test('formatLocalDate uses local Y-M-D', () => {
  assert.equal(formatLocalDate(new Date(2026, 6, 18, 23, 5)), '2026-07-18');
});

test('diaryEntryId is date|personaId', () => {
  assert.equal(diaryEntryId('2026-07-18', 'persona_ririchan'), '2026-07-18|persona_ririchan');
});

test('localDayBounds covers the full local day', () => {
  const { start, end } = localDayBounds('2026-07-18');
  assert.equal(new Date(start).getHours(), 0);
  assert.equal(new Date(end).getHours(), 23);
  assert.ok(end > start);
});

test('before writeHour → no today, still catch up yesterday+', () => {
  const now = new Date(2026, 6, 18, 15, 0, 0);
  const dates = datesNeedingDiary(now, 23, false);
  assert.ok(!dates.includes('2026-07-18'));
  assert.ok(dates.includes('2026-07-17'));
  assert.ok(dates.includes('2026-07-16'));
});

test('at/after writeHour → includes today', () => {
  const now = new Date(2026, 6, 18, 23, 10, 0);
  const dates = datesNeedingDiary(now, 23, false);
  assert.equal(dates[0], '2026-07-18');
  assert.ok(dates.includes('2026-07-17'));
});

test('forceToday includes today even before writeHour', () => {
  const now = new Date(2026, 6, 18, 10, 0, 0);
  const dates = datesNeedingDiary(now, 23, true);
  assert.equal(dates[0], '2026-07-18');
});

test('formatDiaryBlock empty when no content', () => {
  assert.equal(
    formatDiaryBlock({
      id: 'x',
      date: '2026-07-17',
      personaId: 'p',
      content: '   ',
      model: 'm',
      endpointId: 'e',
      conversationIds: [],
      status: 'done',
      createdAt: 0,
      updatedAt: 0,
    }),
    '',
  );
});

test('formatDiaryBlock wraps body with self-diary framing', () => {
  const block = formatDiaryBlock({
    id: 'x',
    date: '2026-07-17',
    personaId: 'p',
    content: '今天和她聊了海边。',
    model: 'm',
    endpointId: 'e',
    conversationIds: [],
    status: 'done',
    createdAt: 0,
    updatedAt: 0,
  });
  assert.match(block, /你昨天写下的日记（2026-07-17）/);
  assert.match(block, /今天和她聊了海边/);
  assert.match(block, /不要主动复述全文/);
});
