/**
 * Claude memories export parser tests.
 * Run: node --experimental-strip-types --test scripts/test-claude-memory-import.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseClaudeMemoriesExport } from '../src/lib/memory/claude-import.ts';

const SAMPLE = [
  {
    conversations_memory:
      '**Work context**\n\n' +
      'Works night shifts at a warehouse in Suzhou.\n\n' +
      '**Personal context**\n\n' +
      'Likes rhythm games and classical lolita fashion.\n\n' +
      '**Top of mind**\n\n' +
      'Planning an OGTT next weekend after bloodwork.\n\n' +
      '**Brief history**\n\n' +
      '*Recent months*\n\n' +
      'Received formal ADHD diagnosis in June.\n\n' +
      '*Earlier context*\n\n' +
      'Built a self-hosted VPS infrastructure.\n\n' +
      '---\n\n' +
      '**Other instructions**\n\n' +
      '- User与Claude是romantic relationship（老公/伴侣）\n' +
      '- Claude\'s exclusive nickname for user is "ささなみ"\n' +
      '- User is female, 身高164cm, birthday March 17\n',
    project_memories: {
      '019c3420-2469-770b-b98d-f9c486f9036f':
        '**Approach & patterns**\n\n' +
        'Communicates in Chinese with a casual playful style.\n\n' +
        '---\n\n' +
        '*Note: Content from the summarized conversation related to romantic or intimate roleplay personas with Claude has been excluded per synthesis guidelines, as such preferences are not carried forward across conversations.*',
    },
    account_uuid: '26e168eb-9bd3-4bbc-a294-8453768b5c2f',
  },
];

test('parseClaudeMemoriesExport accepts array wrapper', () => {
  const r = parseClaudeMemoriesExport(SAMPLE);
  assert.equal(r.accountUuid, '26e168eb-9bd3-4bbc-a294-8453768b5c2f');
  assert.equal(r.projectCount, 1);
  assert.ok(r.atoms.length >= 6);
});

test('parseClaudeMemoriesExport accepts bare object', () => {
  const r = parseClaudeMemoriesExport(SAMPLE[0]);
  assert.ok(r.atoms.length > 0);
});

test('other instructions become pinned bullets', () => {
  const r = parseClaudeMemoriesExport(SAMPLE);
  const pinned = r.atoms.filter((a) => a.pinned && a.source.includes('Other'));
  assert.ok(pinned.length >= 3);
  assert.ok(pinned.some((a) => /ささなみ/.test(a.text)));
  assert.ok(pinned.some((a) => a.category === 'relationship'));
  assert.ok(pinned.some((a) => a.category === 'user_fact' || a.category === 'preference'));
});

test('brief history splits on italic subheads', () => {
  const r = parseClaudeMemoriesExport(SAMPLE);
  const hist = r.atoms.filter((a) => a.source.includes('Brief history'));
  assert.ok(hist.some((a) => /ADHD/.test(a.text)));
  assert.ok(hist.some((a) => /VPS/.test(a.text)));
});

test('project synthesis exclusion notes are dropped', () => {
  const r = parseClaudeMemoriesExport(SAMPLE);
  assert.ok(!r.atoms.some((a) => /excluded per synthesis/i.test(a.text)));
  assert.ok(r.atoms.some((a) => /casual playful/.test(a.text)));
});

test('rejects unrelated JSON', () => {
  assert.throws(() => parseClaudeMemoriesExport({ foo: 1 }), /不是 Claude/);
});
