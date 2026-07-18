/**
 * Pure-logic tests for manual conversation recovery helpers.
 * Run: node --experimental-strip-types --test scripts/test-recover.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectRecoverKind,
  filesToRecoverableItems,
  formatBytes,
  guessKindFromName,
  kindLabel,
  sourceLabel,
} from '../src/lib/recover-detect.ts';

test('detectRecoverKind recognizes lisse markers', () => {
  assert.equal(
    detectRecoverKind('{"__lisse":"backup","version":5}'),
    'backup',
  );
  assert.equal(
    detectRecoverKind('{ "__lisse" : "conversation" , "version": 1 }'),
    'conversation',
  );
  assert.equal(
    detectRecoverKind('{"__lisse":"conversations","items":[]}'),
    'conversations',
  );
  assert.equal(
    detectRecoverKind('{"__lisse":"config","version":1}'),
    'config',
  );
});

test('detectRecoverKind recognizes ChatGPT / Claude shapes', () => {
  assert.equal(
    detectRecoverKind(
      '[{"title":"hi","create_time":1,"mapping":{"a":{}},"current_node":"a"}]',
    ),
    'chatgpt',
  );
  assert.equal(
    detectRecoverKind(
      '[{"uuid":"x","name":"chat","chat_messages":[{"sender":"human"}]}]',
    ),
    'claude',
  );
  assert.equal(detectRecoverKind('{"foo":1}'), 'unknown');
});

test('guessKindFromName covers common export filenames', () => {
  assert.equal(guessKindFromName('lisse-backup-20260101.json'), 'backup');
  assert.equal(guessKindFromName('lisse-conversations-foo.json'), 'conversations');
  assert.equal(guessKindFromName('config-export.json'), 'config');
  assert.equal(guessKindFromName('chatgpt-conversations.json'), 'chatgpt');
  assert.equal(guessKindFromName('claude-export.json'), 'claude');
});

test('filesToRecoverableItems filters and sorts', () => {
  const now = Date.now();
  const files = [
    new File(['{}'], 'notes.txt', { lastModified: now - 1000 }),
    new File(['{}'], 'lisse-backup-a.json', { lastModified: now - 5000 }),
    new File(['{}'], 'lisse-conversations-b.json', { lastModified: now }),
    new File(['{}'], 'photo.png', { lastModified: now }),
  ];
  const items = filesToRecoverableItems(files, 'picked');
  assert.equal(items.length, 2);
  assert.equal(items[0].name, 'lisse-conversations-b.json');
  assert.equal(items[1].name, 'lisse-backup-a.json');
  assert.equal(items[0].source, 'picked');
});

test('labels and formatBytes', () => {
  assert.equal(sourceLabel('app-private'), '应用私有目录（隐藏）');
  assert.equal(kindLabel('backup'), '全量备份');
  assert.equal(formatBytes(512), '512 B');
  assert.match(formatBytes(2048), /KB/);
  assert.match(formatBytes(3 * 1024 * 1024), /MB/);
});
