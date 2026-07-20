/**
 * Ask the browser / WebView to keep IndexedDB across storage pressure.
 *
 * Without `navigator.storage.persist()`, Android WebViews and mobile Chrome
 * may silently evict the whole `lisse` database when disk is low — the classic
 * "I opened the app and every conversation was gone" symptom.
 *
 * Important UX note: on many Android WebViews, `persist()` returns `false`
 * immediately with **no system dialog**. Callers must surface that result so
 * the button doesn't look dead.
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
};

function isAndroidWebView(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

function explainResult(state: StoragePersistState): string {
  if (!state.supported) {
    return '当前环境没有 StorageManager.persist（无法用按钮申请）。请照常使用自动备份 / 备份目录。';
  }
  if (state.persisted) {
    return state.requested === true
      ? '已开启持久化存储。系统紧张时不会优先清掉本应用的对话库。'
      : '持久化存储本来就是开启的。';
  }
  if (state.requested === false) {
    return isAndroidWebView()
      ? '系统没有批准持久化（Android 应用里很常见，往往不会弹出确认框）。请务必设置备份目录并打开自动备份；别清应用数据。'
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
    const already =
      typeof storage.persisted === 'function' ? await storage.persisted() : false;
    if (already) {
      const state: StoragePersistState = {
        supported: true,
        persisted: true,
        requested: null,
      };
      return { ...state, message: explainResult(state) };
    }
    const granted = await storage.persist();
    // Re-read — some engines report persist() true but persisted() lags a tick.
    let persisted = granted;
    if (typeof storage.persisted === 'function') {
      try {
        persisted = (await storage.persisted()) || granted;
      } catch {
        persisted = granted;
      }
    }
    const state: StoragePersistState = {
      supported: true,
      persisted,
      requested: granted,
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
    const persisted = await storage.persisted();
    return { supported: true, persisted, requested: null };
  } catch {
    return { supported: true, persisted: null, requested: null };
  }
}
