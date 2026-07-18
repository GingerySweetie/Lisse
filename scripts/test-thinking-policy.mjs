/**
 * Pure-logic tests for smart thinking / depth classification.
 * Run: node --experimental-strip-types --test scripts/test-thinking-policy.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyChatDepth,
  resolveThinkingEffort,
  wantsHealthContext,
  budgetForEffort,
} from '../src/lib/thinking-policy.ts';

test('nudge and short hello stay casual', () => {
  assert.equal(classifyChatDepth('[nudge] 想你了'), 'casual');
  assert.equal(classifyChatDepth('在干嘛'), 'casual');
  assert.equal(
    resolveThinkingEffort({ userText: '吃了吗', baseline: 'medium' }),
    'medium',
  );
});

test('emotional dump → deep → high', () => {
  assert.equal(classifyChatDepth('好想你，今天好难过'), 'deep');
  assert.equal(
    resolveThinkingEffort({
      userText: '我有点崩溃，你陪我一下',
      baseline: 'medium',
    }),
    'high',
  );
});

test('intimate → high; sticky 长思考 → max', () => {
  assert.equal(classifyChatDepth('想要你抱紧我'), 'intimate');
  assert.equal(
    resolveThinkingEffort({
      userText: '在干嘛',
      baseline: 'medium',
      forceDeepThink: true,
    }),
    'max',
  );
});

test('health intent gate', () => {
  assert.equal(wantsHealthContext('今天步数多少'), true);
  assert.equal(wantsHealthContext('想你了'), false);
});

test('budget scales with effort', () => {
  assert.equal(budgetForEffort(16000, 'low'), 2048);
  assert.equal(budgetForEffort(16000, 'medium'), 8000);
  assert.ok(budgetForEffort(8000, 'high') >= 12000);
  assert.ok(budgetForEffort(8000, 'max') >= 16000);
});
