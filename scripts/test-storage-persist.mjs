import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  getStoragePersistState,
  requestPersistentStorage,
} from '../src/lib/storage-persist.ts';

describe('storage-persist', () => {
  it('reports unsupported when StorageManager is missing (Node)', async () => {
    const state = await getStoragePersistState();
    assert.equal(state.supported, false);
    assert.equal(state.persisted, null);
  });

  it('requestPersistentStorage never throws without navigator.storage', async () => {
    const state = await requestPersistentStorage();
    assert.equal(state.supported, false);
    assert.ok(state.message);
  });

  it('starts persist() without awaiting persisted() first', async () => {
    const order = [];
    const storage = {
      persist: mock.fn(async () => {
        order.push('persist');
        return false;
      }),
      persisted: mock.fn(async () => {
        order.push('persisted');
        return false;
      }),
    };
    Object.defineProperty(globalThis, 'navigator', {
      value: { storage },
      configurable: true,
    });
    try {
      const state = await requestPersistentStorage();
      assert.equal(state.supported, true);
      assert.equal(state.persisted, false);
      assert.equal(state.requested, false);
      assert.equal(order[0], 'persist');
      assert.ok(state.message?.includes('拒绝') || state.message?.includes('未开启'));
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        value: undefined,
        configurable: true,
      });
    }
  });

  it('times out hanging persist() and still returns a message', async () => {
    const storage = {
      persist: mock.fn(() => new Promise(() => {})),
      persisted: mock.fn(async () => false),
    };
    Object.defineProperty(globalThis, 'navigator', {
      value: { storage },
      configurable: true,
    });
    try {
      const state = await requestPersistentStorage();
      assert.equal(state.supported, true);
      assert.equal(state.timedOut, true);
      assert.ok(state.message);
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        value: undefined,
        configurable: true,
      });
    }
  });
});
