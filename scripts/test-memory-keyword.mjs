/**
 * Keyword fallback for memory retrieval without embeddings.
 * Run: node --experimental-strip-types --test scripts/test-memory-keyword.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  keywordMemoryScore,
  tokenizeForMemory,
} from '../src/lib/memory/keyword.ts';

test('tokenizeForMemory extracts CJK bigrams and latin words', () => {
  const toks = tokenizeForMemory('她在苏州做仓储 ADHD');
  assert.ok(toks.includes('苏州') || toks.some((t) => t.includes('苏')));
  assert.ok(toks.includes('adhd'));
});

test('exact containment scores 1', () => {
  assert.equal(
    keywordMemoryScore('冷库做仓储', '她在苏州一家冷库做仓储夜班'),
    1,
  );
});

test('partial token overlap scores between 0 and 1', () => {
  const s = keywordMemoryScore('苏州仓储夜班', '她在苏州做日班零售');
  assert.ok(s > 0 && s < 1);
});

test('unrelated query scores 0', () => {
  assert.equal(keywordMemoryScore('maimai评分', '今天天气很好'), 0);
});
