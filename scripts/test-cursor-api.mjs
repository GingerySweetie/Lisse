/**
 * Smoke tests for Cursor workshop helpers (no network).
 * Run: pnpm test:cursor-api
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isTerminalRunStatus,
  resolveCursorApiBase,
  toGithubRepoUrl,
} from '../src/lib/workshop/cursor-api.ts';

test('toGithubRepoUrl parses owner/repo and full URLs', () => {
  assert.equal(toGithubRepoUrl('acme/payments'), 'https://github.com/acme/payments');
  assert.equal(
    toGithubRepoUrl('https://github.com/acme/payments.git'),
    'https://github.com/acme/payments',
  );
  assert.equal(toGithubRepoUrl('not a repo'), null);
  assert.equal(toGithubRepoUrl(''), null);
});

test('isTerminalRunStatus', () => {
  for (const s of ['FINISHED', 'ERROR', 'CANCELLED', 'EXPIRED']) {
    assert.equal(isTerminalRunStatus(s), true);
  }
  assert.equal(isTerminalRunStatus('RUNNING'), false);
});

test('resolveCursorApiBase honors explicit override', () => {
  assert.equal(
    resolveCursorApiBase('https://example.com/proxy/'),
    'https://example.com/proxy',
  );
});
