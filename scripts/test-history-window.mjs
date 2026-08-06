/**
 * Pure-logic tests for history window trimming (day boundary + turn cap).
 * Run: node --experimental-strip-types --test scripts/test-history-window.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { trimHistoryForContext } from '../src/lib/history-window.ts';

function msg(id, createdAt) {
  return {
    id,
    conversationId: 'c1',
    parentId: null,
    role: 'user',
    content: id,
    createdAt,
  };
}

const day = (y, m, d, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0).getTime();

test('historyTodayOnly drops messages before local midnight', () => {
  const now = new Date(2026, 7, 6, 10, 0, 0); // Aug 6 2026
  const branch = [
    msg('y1', day(2026, 8, 5, 22)),
    msg('y2', day(2026, 8, 5, 23, 30)),
    msg('t1', day(2026, 8, 6, 0, 1)),
    msg('t2', day(2026, 8, 6, 9)),
  ];
  const out = trimHistoryForContext(branch, {
    historyTodayOnly: true,
    maxHistoryTurns: null,
    now,
  });
  assert.deepEqual(
    out.map((m) => m.id),
    ['t1', 't2'],
  );
});

test('historyTodayOnly=false keeps multi-day history', () => {
  const now = new Date(2026, 7, 6, 10, 0, 0);
  const branch = [
    msg('y1', day(2026, 8, 5, 22)),
    msg('t1', day(2026, 8, 6, 9)),
  ];
  const out = trimHistoryForContext(branch, {
    historyTodayOnly: false,
    maxHistoryTurns: null,
    now,
  });
  assert.equal(out.length, 2);
});

test('default historyTodayOnly is on when omitted', () => {
  const now = new Date(2026, 7, 6, 10, 0, 0);
  const branch = [
    msg('y1', day(2026, 8, 5, 22)),
    msg('t1', day(2026, 8, 6, 9)),
  ];
  const out = trimHistoryForContext(branch, { now });
  assert.deepEqual(
    out.map((m) => m.id),
    ['t1'],
  );
});

test('maxHistoryTurns chunk-drops within today', () => {
  const now = new Date(2026, 7, 6, 20, 0, 0);
  // 12 messages today, keep 3 turns = 6 messages → drop in chunk of 3
  const branch = Array.from({ length: 12 }, (_, i) =>
    msg(`m${i}`, day(2026, 8, 6, 8 + i)),
  );
  const out = trimHistoryForContext(branch, {
    historyTodayOnly: true,
    maxHistoryTurns: 3,
    now,
  });
  // keep=6, chunk=3, drop = ceil((12-6)/3)*3 = 6 → slice(6) → m6..m11
  assert.deepEqual(
    out.map((m) => m.id),
    ['m6', 'm7', 'm8', 'm9', 'm10', 'm11'],
  );
});

test('day filter applies before turn cap', () => {
  const now = new Date(2026, 7, 6, 12, 0, 0);
  const branch = [
    msg('y1', day(2026, 8, 5, 10)),
    msg('y2', day(2026, 8, 5, 11)),
    msg('t1', day(2026, 8, 6, 9)),
    msg('t2', day(2026, 8, 6, 10)),
  ];
  const out = trimHistoryForContext(branch, {
    historyTodayOnly: true,
    maxHistoryTurns: 50,
    now,
  });
  assert.deepEqual(
    out.map((m) => m.id),
    ['t1', 't2'],
  );
});

test('empty after midnight with only yesterday messages', () => {
  const now = new Date(2026, 7, 6, 0, 5, 0);
  const branch = [msg('y1', day(2026, 8, 5, 23))];
  const out = trimHistoryForContext(branch, {
    historyTodayOnly: true,
    now,
  });
  assert.equal(out.length, 0);
});
