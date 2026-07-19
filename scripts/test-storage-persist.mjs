import { describe, it } from 'node:test';
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
  });
});
