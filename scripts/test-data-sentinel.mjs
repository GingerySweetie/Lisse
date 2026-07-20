import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearDataSentinel,
  looksLikeSilentDataLoss,
  mirrorBackupFolder,
  noteBackupOnSentinel,
  readDataSentinel,
  readMirroredBackupFolder,
  touchDataSentinel,
} from '../src/lib/data-sentinel.ts';

/** Minimal localStorage stub for Node. */
function installLocalStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
}

describe('data-sentinel', () => {
  beforeEach(() => {
    installLocalStorage();
    clearDataSentinel();
    mirrorBackupFolder(null);
  });

  it('ignores empty touch and records non-empty counts', () => {
    touchDataSentinel({ conversationCount: 0, messageCount: 0 });
    assert.equal(readDataSentinel(), null);
    touchDataSentinel({ conversationCount: 3, messageCount: 40 });
    const s = readDataSentinel();
    assert.ok(s);
    assert.equal(s.conversationCount, 3);
    assert.equal(s.messageCount, 40);
  });

  it('keeps the high-water mark across smaller updates', () => {
    touchDataSentinel({ conversationCount: 10, messageCount: 100 });
    touchDataSentinel({ conversationCount: 2, messageCount: 5 });
    const s = readDataSentinel();
    assert.equal(s?.conversationCount, 10);
    assert.equal(s?.messageCount, 100);
  });

  it('detects silent data loss when live DB is empty', () => {
    assert.equal(looksLikeSilentDataLoss(0), false);
    touchDataSentinel({ conversationCount: 5, messageCount: 20 });
    assert.equal(looksLikeSilentDataLoss(0), true);
    assert.equal(looksLikeSilentDataLoss(1), false);
  });

  it('mirrors backup folder outside IndexedDB', () => {
    assert.equal(readMirroredBackupFolder(), null);
    mirrorBackupFolder({ uri: 'content://folder', label: '备份夹' });
    assert.deepEqual(readMirroredBackupFolder(), {
      uri: 'content://folder',
      label: '备份夹',
    });
    noteBackupOnSentinel(123);
    assert.equal(readDataSentinel()?.lastBackupAt, 123);
  });
});
