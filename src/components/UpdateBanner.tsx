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
 * Auto-apply (default on): wait for in-flight writes, refresh the
 * localStorage sentinel, backup first (toast shows the filename), then
 * call updateServiceWorker(true). Workbox skipWaiting is false so the new
 * SW does not claim the tab mid-session (that used to blank the UI).
 *
 * Module-level guard survives banner remounts during chunk races.
 */

/** Survives UpdateBanner remounts (chunk reload / StrictMode). */
let autoApplyStarted = false;

export default function UpdateBanner() {
  const settings = useLiveQuery(() => getSettings(), [], null);
  const autoApply = settings?.autoApplyUpdate ?? true;
  const [backupNote, setBackupNote] = useState<string | null>(null);
  const [backupPhase, setBackupPhase] = useState<
    'idle' | 'waiting' | 'backing' | 'done' | 'backup-failed'
  >('idle');

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

  async function backupThenReload() {
    setBackupPhase('waiting');
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
    const filename = suggestedBackupFilename();
    let backupOk = false;
    try {
      const saved = await downloadBackup(filename);
      backupOk = true;
      setBackupNote(saved.filename);
      noteBackupOnSentinel();
      // Keep the note visible briefly so she can read the filename.
      await new Promise((r) => setTimeout(r, 900));
    } catch (err) {
      console.warn('[update] pre-update backup failed:', err);
      setBackupPhase('backup-failed');
      // Still proceed — SW updates do not wipe IndexedDB. The sentinel +
      // recover UI cover the real eviction/reinstall cases.
    }

    setBackupPhase(backupOk ? 'done' : 'backup-failed');
    await new Promise((r) => setTimeout(r, backupOk ? 350 : 1200));
    await updateServiceWorker(true);
  }

  useEffect(() => {
    if (!needRefresh) return;
    if (!autoApply) return;
    if (autoApplyStarted) return;
    autoApplyStarted = true;
    void backupThenReload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            : backupNote
              ? '备份完成 · 正在应用新版本…'
              : '新版本就位 · 备份后自动应用…';
    return (
      <div
        style={bottomStyle}
        className={`pointer-events-none fixed inset-x-0 z-[100] mx-auto flex w-[min(92vw,24rem)] flex-col items-center justify-center gap-1 rounded-2xl border border-lavender-300 bg-white/95 px-4 py-3 shadow-lg backdrop-blur transition-all duration-200 ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        }`}
      >
        <div className="flex items-center gap-2">
          <RefreshCw size={14} className="animate-spin text-sky-500" />
          <span className="text-sm text-ink-700">{label}</span>
        </div>
        {backupNote && (
          <span className="max-w-full truncate text-[10px] text-ink-500">
            {backupNote}
          </span>
        )}
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
      <div className="flex min-w-0 flex-col gap-0.5 text-sm text-ink-900">
        <div className="flex items-center gap-2">
          <RefreshCw size={16} className="shrink-0 text-sky-500" />
          <span>有新版本啦，点一下刷新喵～</span>
        </div>
        <span className="pl-6 text-[10px] text-ink-500">
          刷新前会先自动备份到下载文件夹
        </span>
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
          onClick={() => void backupThenReload()}
          className="rounded-lg bg-lavender-200 px-3 py-1 text-xs font-medium text-ink-900 transition hover:bg-lavender-300"
        >
          备份并刷新
        </button>
      </div>
    </div>
  );
}
