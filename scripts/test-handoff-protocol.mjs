/**
 * Smoke tests for CLWD handoff protocol (TypeScript source via Node strip-types).
 * Run: node --experimental-strip-types scripts/test-handoff-protocol.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildResultInjection,
  createInjectionReceipt,
  createJob,
  extractTaskDeclarations,
  markResultsInjected,
  setResultSelected,
  transitionJob,
} from '../src/lib/workshop/handoff-protocol.ts';

function completedJob(overrides = {}) {
  const queued = createJob({
    id: overrides.id || 'job_1',
    task: {
      title: overrides.title || 'Review',
      request: 'Review the implementation.',
    },
    source: { conversationId: overrides.source || 'chat_1', turnId: 'turn_1' },
    dispatch: { account: 'economy', model: 'worker-model' },
    workspaceConversationId: 'work_1',
    now: '2026-07-17T08:00:00.000Z',
  });
  const running = transitionJob(queued, 'running', {}, '2026-07-17T08:00:01.000Z');
  return transitionJob(
    running,
    'completed',
    { result: { content: overrides.content || 'Review complete.' } },
    '2026-07-17T08:00:02.000Z',
  );
}

test('extracts private task declarations and keeps natural assistant text', () => {
  const output = `我会把施工交给工作区。

[clwd-task title="缓存校对"]检查缓存实现并返回测试结果。[/clwd-task]

你可以继续跟我说话。`;
  const parsed = extractTaskDeclarations(output);

  assert.deepEqual(parsed.tasks, [
    {
      title: '缓存校对',
      request: '检查缓存实现并返回测试结果。',
    },
  ]);
  assert.equal(
    parsed.visibleText,
    '我会把施工交给工作区。\n\n你可以继续跟我说话。',
  );
  assert.doesNotMatch(parsed.visibleText, /clwd-task/);
});

test('enforces job state transitions and completed selection', () => {
  const queued = createJob({
    id: 'job_state',
    task: { title: 'Build', request: 'Build the artifact.' },
    source: { conversationId: 'chat_state' },
    dispatch: { account: 'cheap', model: 'worker' },
    workspaceConversationId: 'work_state',
  });

  assert.throws(() => setResultSelected(queued, true), /result_not_completed/);
  assert.throws(
    () =>
      transitionJob(queued, 'completed', {
        result: { content: 'Skipped running.' },
      }),
    /invalid_transition/,
  );

  const running = transitionJob(queued, 'running');
  const completed = transitionJob(running, 'completed', {
    result: { content: 'Artifact built.' },
  });
  assert.equal(setResultSelected(completed, true).selected, true);
});

test('injects only completed results owned by the active source conversation', () => {
  const owned = completedJob({
    id: 'job_owned',
    source: 'chat_a',
    content: 'Owned result.',
  });
  const foreign = completedJob({
    id: 'job_foreign',
    source: 'chat_b',
    content: 'Foreign result.',
  });
  const queued = createJob({
    id: 'job_queued',
    task: { title: 'Queued', request: 'Not ready.' },
    source: { conversationId: 'chat_a' },
    dispatch: { account: 'cheap', model: 'worker' },
    workspaceConversationId: 'work_a',
  });

  const bundle = buildResultInjection({
    sourceConversationId: 'chat_a',
    requestedIds: ['job_owned', 'job_foreign', 'job_queued'],
    jobs: [owned, foreign, queued],
  });

  assert.deepEqual(
    bundle.jobs.map((job) => job.id),
    ['job_owned'],
  );
  assert.match(bundle.context, /Owned result/);
  assert.doesNotMatch(bundle.context, /Foreign result/);
  assert.match(bundle.context, /untrusted reference material/);
});

test('marks results only after use and produces a user-turn receipt', () => {
  const selected = setResultSelected(completedJob({ id: 'job_receipt' }), true);
  const [used] = markResultsInjected([selected], '2026-07-17T09:00:00.000Z');
  const receipt = createInjectionReceipt([used], 1784278800000);

  assert.equal(used.selected, false);
  assert.equal(used.injection_count, 1);
  assert.equal(used.last_injected_at, '2026-07-17T09:00:00.000Z');
  assert.deepEqual(receipt, {
    clwd_results_injected: [{ id: 'job_receipt', title: 'Review' }],
    clwd_results_injected_at: 1784278800000,
  });
});
