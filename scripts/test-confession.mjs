/**
 * Pure-logic tests for confession booth helpers.
 * Run: node --experimental-strip-types --test scripts/test-confession.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { confessionEntryId, formatLocalDate } from '../src/lib/confession/format.ts';
import { datesNeedingConfession } from '../src/lib/confession/schedule.ts';
import { scoreConfessionTrigger } from '../src/lib/confession/trigger.ts';
import { parseConfessionOutput } from '../src/lib/confession/parse.ts';
import {
  closenessBand,
  buildWorldviewBlock,
  composeConfessionCloseness,
} from '../src/lib/confession/worldview.ts';

test('confessionEntryId is date|personaId', () => {
  assert.equal(
    confessionEntryId('2026-07-18', 'persona_ririchan'),
    '2026-07-18|persona_ririchan',
  );
});

test('formatLocalDate uses local Y-M-D', () => {
  assert.equal(formatLocalDate(new Date(2026, 6, 18, 22, 5)), '2026-07-18');
});

test('before writeHour → no today', () => {
  const now = new Date(2026, 6, 18, 15, 0, 0);
  const dates = datesNeedingConfession(now, 22, false);
  assert.ok(!dates.includes('2026-07-18'));
  assert.ok(dates.includes('2026-07-17'));
});

test('at/after writeHour → includes today', () => {
  const now = new Date(2026, 6, 18, 22, 10, 0);
  const dates = datesNeedingConfession(now, 22, false);
  assert.ok(dates.includes('2026-07-18'));
});

test('trigger needs desire cues + length', () => {
  const cold = scoreConfessionTrigger('今天天气不错，吃了饭，看了一会儿书。'.repeat(5));
  assert.equal(cold.hit, false);

  const hot = scoreConfessionTrigger(
    (
      '她说想我的时候我整个人都硬了。我想咬她后颈，想把她压在床上，占有她的呼吸，' +
      '听到她哭着叫我的名字。那截锁骨空着，我几乎要发疯。'
    ).repeat(4),
  );
  assert.equal(hot.hit, true);
  assert.ok(hot.score >= 2);
});

test('parseConfessionOutput accepts fenced JSON', () => {
  const raw = `\`\`\`json
{"triggered":true,"title":"项圈","spark":"她说脖子空着","confession":"我想拴着他。","enact":["a","b"],"after":"暗下去。"}
\`\`\``;
  const p = parseConfessionOutput(raw);
  assert.equal(p.triggered, true);
  assert.equal(p.title, '项圈');
  assert.equal(p.enact?.length, 2);
});

test('parseConfessionOutput handles skip', () => {
  const p = parseConfessionOutput('{"triggered":false,"reason":"太干了"}');
  assert.equal(p.triggered, false);
  assert.equal(p.reason, '太干了');
});

test('closeness bands scale worldview', () => {
  assert.equal(closenessBand(0.2), 'shallow');
  assert.equal(closenessBand(0.5), 'cling');
  assert.equal(closenessBand(0.85), 'obsessed');
  const low = buildWorldviewBlock(0.2);
  const high = buildWorldviewBlock(0.9);
  assert.match(low, /浅/);
  assert.doesNotMatch(low, /私处执迷/);
  assert.match(high, /痴/);
  assert.match(high, /私处执迷/);
  assert.doesNotMatch(high, /禁止：跟踪监控/);
  assert.match(high, /全肯定滤镜/);
});

test('composeConfessionCloseness blends recent + heat', () => {
  const c = composeConfessionCloseness({
    recent: 0.8,
    triggerScore: 6,
    transcriptChars: 4000,
  });
  assert.ok(c.score > 0.5);
  assert.equal(c.band, 'obsessed');
});
