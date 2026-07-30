/**
 * Tests for backup integrity helpers (no IndexedDB).
 * Run: node --experimental-strip-types --test scripts/test-backup-integrity.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertReplaceKeepSafe,
  orderBackupTablesForIntegrity,
  sanitizeExportedConversation,
} from '../src/lib/backup-integrity.ts';

test('orderBackupTablesForIntegrity puts messages before conversations', () => {
  const ordered = orderBackupTablesForIntegrity([
    'endpoints',
    'personas',
    'conversations',
    'messages',
    'memoryFacts',
  ]);
  assert.deepEqual(ordered, [
    'endpoints',
    'personas',
    'messages',
    'conversations',
    'memoryFacts',
  ]);
});

test('sanitizeExportedConversation fixes orphan leaf and dangling activeChildId', () => {
  const messages = [
    {
      id: 'm1',
      conversationId: 'c1',
      parentId: null,
      role: 'user',
      content: 'hi',
      status: 'done',
      createdAt: 1,
      activeChildId: 'missing-sibling',
    },
    {
      id: 'm2',
      conversationId: 'c1',
      parentId: 'm1',
      role: 'assistant',
      content: 'hello',
      status: 'done',
      createdAt: 2,
    },
  ];
  const conv = sanitizeExportedConversation(
    {
      id: 'c1',
      title: 't',
      currentLeafId: 'ghost-leaf',
      createdAt: 1,
      updatedAt: 2,
    },
    messages,
  );
  assert.equal(conv.currentLeafId, 'm2');
  assert.equal(messages[0].activeChildId, null);
});

test('assertReplaceKeepSafe blocks wiping messages when conversations exist', () => {
  assert.throws(
    () => assertReplaceKeepSafe('messages', 0, 3),
    /messages 为空|中止替换/,
  );
  assert.doesNotThrow(() => assertReplaceKeepSafe('messages', 10, 3));
  assert.doesNotThrow(() => assertReplaceKeepSafe('messages', 0, 0));
});
