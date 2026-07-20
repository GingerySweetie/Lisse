import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { db } from '../db';
import {
  ensureDbOpen,
  getDbHealth,
  subscribeDbHealth,
  type DbHealth,
} from '../lib/db-health';
import {
  looksLikeSilentDataLoss,
  readDataSentinel,
  type DataSentinel,
} from '../lib/data-sentinel';

/**
 * Surfaces Dexie blocked/error states and the "sentinel says you had data
 * but IndexedDB is empty" footprint so users don't panic-wipe a recoverable DB.
 */
export default function DataHealthBanner() {
  const [health, setHealth] = useState<DbHealth>(() => getDbHealth());
  const [sentinel, setSentinel] = useState<DataSentinel | null>(null);
  const [emptyLoss, setEmptyLoss] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => subscribeDbHealth(setHealth), []);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        await ensureDbOpen(db);
        const n = await db.conversations.count();
        if (cancelled) return;
        setSentinel(readDataSentinel());
        setEmptyLoss(looksLikeSilentDataLoss(n));
      } catch {
        if (!cancelled) {
          setSentinel(readDataSentinel());
          setEmptyLoss(false);
        }
      }
    }
    void check();
    const t = window.setInterval(() => void check(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [health.kind]);

  async function retryOpen() {
    setRetrying(true);
    try {
      if (db.isOpen()) {
        try {
          db.close();
        } catch {
          // ignore
        }
      }
      await ensureDbOpen(db);
      window.location.reload();
    } catch {
      // health already updated
    } finally {
      setRetrying(false);
    }
  }

  const showDbIssue =
    health.kind === 'blocked' ||
    health.kind === 'error' ||
    health.kind === 'versionchange';
  const showEmptyLoss = emptyLoss && !showDbIssue;

  if (!showDbIssue && !showEmptyLoss) return null;

  const title = showDbIssue
    ? health.message ?? '本地数据库异常'
    : '检测到对话库异常为空';
  const detail = showDbIssue
    ? health.detail
    : sentinel
      ? `这台设备上曾经有过约 ${sentinel.conversationCount} 条对话` +
        (sentinel.messageCount
          ? ` / ${sentinel.messageCount} 条消息`
          : '') +
        '。当前 IndexedDB 是空的——常见于更新后存储被系统回收，或重装 APK。' +
        '请先到「导入 / 导出」用手动找回 / 备份恢复，不要点「替换导入」或新建对话覆盖。'
      : null;

  return (
    <div
      className="pointer-events-auto fixed inset-x-0 z-[110] mx-auto w-[min(94vw,28rem)] rounded-2xl border border-rose-300 bg-rose-50/95 px-4 py-3 shadow-lg backdrop-blur"
      style={{
        top: 'calc(0.75rem + env(safe-area-inset-top, 0px))',
      }}
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          size={16}
          className="mt-0.5 shrink-0 text-rose-600"
          strokeWidth={1.75}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-rose-900">{title}</p>
          {detail && (
            <p className="mt-1 text-xs leading-relaxed text-rose-800/90">
              {detail}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {(health.kind === 'blocked' || health.kind === 'error') && (
              <button
                type="button"
                disabled={retrying}
                onClick={() => void retryOpen()}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-200 px-2.5 py-1 text-[11px] font-medium text-rose-950 transition hover:bg-rose-300 disabled:opacity-60"
              >
                <RefreshCw
                  size={11}
                  className={retrying ? 'animate-spin' : ''}
                />
                重试打开
              </button>
            )}
            <Link
              to="/data"
              className="inline-flex items-center rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-900 transition hover:bg-rose-100"
            >
              去导入 / 导出恢复
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
