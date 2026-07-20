import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { RefreshCw } from 'lucide-react';
import { db, getSettings } from '../db';
import {
  downloadBackup,
  suggestedBackupFilename,
} from '../lib/backup';
import { hasActiveWork } from '../lib/stream-activity';
import {
  noteBackupOnSentinel,
  touchDataSentinel,
} from '../lib/data-sentinel';

/**
 * Service-worker update prompter.
 *
 * Aggressive detection:
 *  - immediate check on mount
 *  - re-check whenever the tab/PWA returns to the foreground
 *  - poll every 5 minutes while open
 *
 * Auto-apply (default on, via AppSettings.autoApplyUpdate): after a new SW
 * is detected we write a safety backup, then call updateServiceWorker(true)
 * which SKIP_WAITINGs and reloads. Workbox skipWaiting is false so the new
 * SW does not claim the tab mid-session (that used to blank the UI).
 *
 * Module-level guard survives banner remounts during chunk races.
 */

/** Survives UpdateBanner remounts (chunk reload / StrictMode). */
let autoApplyStarted = false;

export default function UpdateBanner() {
  const settings = useLiveQuery(() => getSettings(), [], null);
  const autoApply = settings?.autoApplyUpdate ?? true;

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

      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', onVisible);
        window.removeEventListener('pageshow', onVisible);
      };
    },
  });

  const [backupPhase, setBackupPhase] = useState<
    'idle' | 'waiting' | 'backing' | 'done' | 'backup-failed'
  >('idle');

  useEffect(() => {
    if (!needRefresh) return;
    if (!autoApply) return;
    if (autoApplyStarted) return;
    autoApplyStarted = true;
    setBackupPhase('waiting');

    const apply = async () => {
      // Wait out chat streams + import/export so reload can't truncate writes.
      for (let i = 0; i < 180 && hasActiveWork(); i++) {
        await new Promise((r) => setTimeout(r, 500));
      }

      // Refresh the localStorage sentinel BEFORE reload so a post-update
      // empty IDB still proves the user once had data.
      try {
        const [conversationCount, messageCount] = await Promise.all([
          db.conversations.count(),
          db.messages.count(),
        ]);
        touchDataSentinel({ conversationCount, messageCount });
      } catch {
        // ignore — sentinel best-effort
      }

      setBackupPhase('backing');
      let backupOk = false;
      try {
        await downloadBackup(suggestedBackupFilename());
        backupOk = true;
        noteBackupOnSentinel();
      } catch (err) {
        console.warn('[update] pre-update backup failed:', err);
        setBackupPhase('backup-failed');
        // Still proceed — SW updates do not wipe IndexedDB. The sentinel +
        // recover UI cover the real eviction/reinstall cases. Blocking the
        // update forever when the share sheet fails would leave users stuck
        // on broken chunk hashes after skipWaiting=false installs.
      }

      setBackupPhase(backupOk ? 'done' : 'backup-failed');
      await new Promise((r) => setTimeout(r, backupOk ? 400 : 1200));
      await updateServiceWorker(true);
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

  const bottomStyle = {
    bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
  } as const;

  if (autoApply) {
    const label =
      backupPhase === 'waiting'
        ? '新版本就位 · 等待进行中的写入…'
        : backupPhase === 'backing'
          ? '新版本就位 · 正在备份…'
          : backupPhase === 'backup-failed'
            ? '备份未完成 · 仍将刷新（数据在本地库）…'
            : '新版本就位 · 备份后自动应用…';
    return (
      <div
        style={bottomStyle}
        className={`pointer-events-none fixed inset-x-0 z-[100] mx-auto flex w-[min(92vw,22rem)] items-center justify-center gap-2 rounded-2xl border border-lavender-300 bg-white/95 px-4 py-3 shadow-lg backdrop-blur transition-all duration-200 ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        }`}
      >
        <RefreshCw size={14} className="animate-spin text-sky-500" />
        <span className="text-sm text-ink-700">{label}</span>
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
          onClick={() => {
            void (async () => {
              try {
                const [conversationCount, messageCount] = await Promise.all([
                  db.conversations.count(),
                  db.messages.count(),
                ]);
                touchDataSentinel({ conversationCount, messageCount });
                await downloadBackup(suggestedBackupFilename());
                noteBackupOnSentinel();
              } catch (err) {
                console.warn('[update] manual backup before refresh failed:', err);
              }
              await updateServiceWorker(true);
            })();
          }}
          className="rounded-lg bg-lavender-200 px-3 py-1 text-xs font-medium text-ink-900 transition hover:bg-lavender-300"
        >
          备份并刷新
        </button>
      </div>
    </div>
  );
}
