import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { RefreshCw } from 'lucide-react';
import { getSettings } from '../db';
import {
  exportBackup,
  downloadJSON,
  suggestedBackupFilename,
} from '../lib/backup';

/**
 * Service-worker update prompter.
 *
 * Aggressive detection:
 *  - immediate check on mount
 *  - re-check whenever the tab/PWA returns to the foreground
 *  - poll every 5 minutes while open
 *
 * Auto-apply (default on, via AppSettings.autoApplyUpdate): the moment
 * a new SW is detected, the page reloads itself with a half-second
 * "新版本就位…" toast. The user never needs to manually clear the SW
 * cache. Toggle off to fall back to the classic banner.
 *
 * Auto-backup: before reloading for an update a full backup JSON is
 * downloaded automatically so the user always has a recent copy of
 * their data even if the update somehow wipes local storage.
 */
export default function UpdateBanner() {
  const settings = useLiveQuery(() => getSettings(), [], null);
  const autoApply = settings?.autoApplyUpdate ?? true;
  const autoAppliedRef = useRef(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const r = reg;
      r.update().catch(() => undefined);

      const interval = setInterval(
        () => r.update().catch(() => undefined),
        5 * 60 * 1000,
      );

      function onVisible() {
        if (document.visibilityState === 'visible') {
          r.update().catch(() => undefined);
        }
      }

      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onVisible);
      window.addEventListener('pageshow', onVisible);

      // Note: vite-plugin-pwa's onRegisteredSW does not call this cleanup
      // automatically, but it is kept here for documentation purposes.
      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', onVisible);
        window.removeEventListener('pageshow', onVisible);
      };
    },
  });

  // Auto-apply path: when needRefresh flips true and the user hasn't
  // opted out, create a safety backup then reload.
  // Ref guard so React StrictMode double-invocation doesn't double-apply.
  useEffect(() => {
    if (!needRefresh) return;
    if (!autoApply) return;
    if (autoAppliedRef.current) return;
    autoAppliedRef.current = true;

    // Download a backup before reloading so the user always has a copy
    // of their data, even if storage is somehow affected by the update.
    const apply = async () => {
      try {
        const bundle = await exportBackup();
        await downloadJSON(bundle, suggestedBackupFilename());
      } catch {
        // Non-fatal: if the backup or save fails, proceed with the update.
      }
      // Small delay so the "新版本就位…" toast renders before reload.
      setTimeout(() => updateServiceWorker(true), 600);
    };

    void apply();
  }, [needRefresh, autoApply, updateServiceWorker]);

  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (needRefresh) {
      const t = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(t);
    }
    setVisible(false);
  }, [needRefresh]);

  if (!needRefresh) return null;

  // Sit above the transparent Android gesture-nav bar in edge-to-edge mode
  // (safe-area-inset-bottom falls back to 0px in normal browsers).
  const bottomStyle = {
    bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
  } as const;

  if (autoApply) {
    return (
      <div
        style={bottomStyle}
        className={`pointer-events-none fixed inset-x-0 z-[100] mx-auto flex w-[min(92vw,22rem)] items-center justify-center gap-2 rounded-2xl border border-lavender-300 bg-white/95 px-4 py-3 shadow-lg backdrop-blur transition-all duration-200 ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        }`}
      >
        <RefreshCw size={14} className="animate-spin text-sky-500" />
        <span className="text-sm text-ink-700">新版本就位 · 备份后自动应用…</span>
      </div>
    );
  }

  return (
    <div
      style={bottomStyle}
      className={`pointer-events-auto fixed inset-x-0 z-[100] mx-auto flex w-[min(92vw,28rem)] items-center justify-between gap-2 rounded-2xl border border-lavender-300 bg-white/95 px-4 py-3 shadow-lg backdrop-blur transition-all duration-200 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`}
    >
      <div className="flex items-center gap-2 text-sm text-ink-900">
        <RefreshCw size={16} className="text-sky-500" />
        <span>有新版本啦，点一下刷新喵～</span>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="rounded-lg px-2 py-1 text-xs text-ink-500 transition hover:bg-lavender-50"
        >
          稍后
        </button>
        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          className="rounded-lg bg-lavender-200 px-3 py-1 text-xs font-medium text-ink-900 transition hover:bg-lavender-300"
        >
          刷新
        </button>
      </div>
    </div>
  );
}
