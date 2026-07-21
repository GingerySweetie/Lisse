/**
 * Ask the browser / WebView to keep IndexedDB across storage pressure.
 *
 * Without `navigator.storage.persist()`, Android WebViews and mobile Chrome
 * may silently evict the whole `lisse` database when disk is low — the classic
 * "I opened the app and every conversation was gone" symptom.
 *
 * Important UX notes:
 * - On many Android WebViews, `persist()` returns `false` with **no dialog**.
 * - Do **not** `await persisted()` before starting `persist()` — some engines
 *   drop transient user activation across awaits, so the click looks dead
 *   (hangs or silently denies with no UI update path the user notices).
 * - Always race against a short timeout; never leave the button spinning forever.
 */

import { Capacitor } from '@capacitor/core';

export type StoragePersistState = {
  /** Whether the Storage Manager API exists in this environment. */
  supported: boolean;
  /** True when the origin already has persistent storage. */
  persisted: boolean | null;
  /** Result of the most recent `persist()` request, if any. */
  requested: boolean | null;
  /** Human-readable outcome for the last interactive request. */
  message?: string;
  /** True when persist/persisted did not settle before the timeout. */
  timedOut?: boolean;
};

const PERSIST_TIMEOUT_MS = 2500;

function isAndroidWebView(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

function explainResult(state: StoragePersistState): string {
  if (!state.supported) {
    return '当前环境没有 StorageManager.persist（无法用按钮申请）。请照常使用自动备份 / 备份目录。';
  }
  if (state.timedOut) {
    return isAndroidWebView()
      ? '系统没有回应持久化申请（Android 上常见，通常也不会弹窗）。这不代表失败闪退——请改设备份目录并打开自动备份。'
      : '浏览器没有在时限内回应持久化申请。请再试一次，或依赖定期备份。';
  }
  if (state.persisted) {
    return state.requested === true
      ? '已开启持久化存储。系统紧张时不会优先清掉本应用的对话库。'
      : '持久化存储本来就是开启的。';
  }
  if (state.requested === false) {
    return isAndroidWebView()
      ? '系统已拒绝持久化（没有弹窗是正常的，不是按钮坏了）。请务必设置备份目录并打开自动备份；别清应用数据。'
      : '浏览器拒绝了持久化请求。可把站点「安装到主屏幕」后再试，或依赖定期备份。';
  }
  if (state.persisted === null) {
    return '申请时出错了，没能确认结果。请再试一次；同时请设置好备份目录。';
  }
  return '持久化仍未开启。';
}

/** Best-effort: request persistent storage. Never throws. */
export async function requestPersistentStorage(): Promise<StoragePersistState> {
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!storage || typeof storage.persist !== 'function') {
    const state: StoragePersistState = {
      supported: false,
      persisted: null,
      requested: null,
    };
    return { ...state, message: explainResult(state) };
  }

  try {
    // Start persist() in the same turn as the user gesture. Checking
    // persisted() first (with await) can drop activation on some WebViews.
    const persistPromise = storage.persist();
    type PersistSettle =
      | { ok: true; value: boolean; timedOut?: undefined }
      | { ok: false; value: boolean; timedOut?: boolean };

    const grantOrTimeout: PersistSettle = await withTimeout<PersistSettle>(
      persistPromise.then(
        (v): PersistSettle => ({ ok: true, value: v }),
        (): PersistSettle => ({ ok: false, value: false }),
      ),
      PERSIST_TIMEOUT_MS,
      { ok: false, value: false, timedOut: true },
    );

    const timedOut = grantOrTimeout.timedOut === true;
    const granted = grantOrTimeout.ok ? grantOrTimeout.value : false;

    let persisted = granted;
    if (typeof storage.persisted === 'function') {
      persisted = await withTimeout(storage.persisted(), PERSIST_TIMEOUT_MS, granted);
    }

    const state: StoragePersistState = {
      supported: true,
      persisted,
      requested: timedOut ? null : granted,
      timedOut: timedOut || undefined,
    };
    return { ...state, message: explainResult(state) };
  } catch {
    const state: StoragePersistState = {
      supported: true,
      persisted: null,
      requested: null,
    };
    return { ...state, message: explainResult(state) };
  }
}

/** Read current persist flag for diagnostics UI. Never throws. */
export async function getStoragePersistState(): Promise<StoragePersistState> {
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!storage || typeof storage.persisted !== 'function') {
    return { supported: false, persisted: null, requested: null };
  }
  try {
    const persisted = await withTimeout(storage.persisted(), PERSIST_TIMEOUT_MS, null);
    return { supported: true, persisted, requested: null };
  } catch {
    return { supported: true, persisted: null, requested: null };
  }
}
