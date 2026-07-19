/**
 * Ask the browser / WebView to keep IndexedDB across storage pressure.
 *
 * Without `navigator.storage.persist()`, Android WebViews and mobile Chrome
 * may silently evict the whole `lisse` database when disk is low — the classic
 * "I opened the app and every conversation was gone" symptom.
 */

export type StoragePersistState = {
  /** Whether the StorageManager API exists in this environment. */
  supported: boolean;
  /** True when the origin already has persistent storage. */
  persisted: boolean | null;
  /** Result of the most recent `persist()` request, if any. */
  requested: boolean | null;
};

/** Best-effort: request persistent storage. Never throws. */
export async function requestPersistentStorage(): Promise<StoragePersistState> {
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!storage || typeof storage.persist !== 'function') {
    return { supported: false, persisted: null, requested: null };
  }

  try {
    const already =
      typeof storage.persisted === 'function' ? await storage.persisted() : false;
    if (already) {
      return { supported: true, persisted: true, requested: null };
    }
    const granted = await storage.persist();
    return { supported: true, persisted: granted, requested: granted };
  } catch {
    return { supported: true, persisted: null, requested: null };
  }
}

/** Read current persist flag for diagnostics UI. Never throws. */
export async function getStoragePersistState(): Promise<StoragePersistState> {
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!storage || typeof storage.persisted !== 'function') {
    return { supported: false, persisted: null, requested: null };
  }
  try {
    const persisted = await storage.persisted();
    return { supported: true, persisted, requested: null };
  } catch {
    return { supported: true, persisted: null, requested: null };
  }
}
