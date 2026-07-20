import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, HardDrive, X } from 'lucide-react';
import { db, getSettings } from '../db';
import {
  dismissWipeBanner,
  isWipeBannerDismissed,
  looksLikeDataWipe,
  rememberConversationPresence,
} from '../lib/data-presence';
import { requestPersistentStorage } from '../lib/storage-persist';

/**
 * Sidebar / home banner when IndexedDB looks wiped after an update.
 * Points the user at 导入导出 → 手动找回 (auto-scan via ?recover=1).
 */
export default function DataLossRecoverBanner({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [lastCount, setLastCount] = useState(0);

  const conversationCount = useLiveQuery(
    () => db.conversations.count(),
    [],
    null,
  );
  const messageCount = useLiveQuery(() => db.messages.count(), [], null);
  const endpointCount = useLiveQuery(() => db.endpoints.count(), [], null);
  const settings = useLiveQuery(() => getSettings(), [], null);

  useEffect(() => {
    if (conversationCount === null || messageCount === null) return;
    if (conversationCount > 0) {
      rememberConversationPresence(conversationCount);
      setShow(false);
      return;
    }
    if (isWipeBannerDismissed()) {
      setShow(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const wipe = await looksLikeDataWipe({
        conversationCount,
        messageCount,
        endpointCount: endpointCount ?? undefined,
        hasDefaultEndpoint: Boolean(settings?.defaultEndpointId),
      });
      if (cancelled) return;
      if (wipe) {
        setLastCount(
          Number(localStorage.getItem('lisse.lastKnownConvCount') || '0') || 0,
        );
        setShow(true);
        // Re-request persist so the next restore isn't evicted again.
        void requestPersistentStorage();
      } else {
        setShow(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationCount, messageCount, endpointCount, settings?.defaultEndpointId]);

  if (!show) return null;

  return (
    <div
      className="mx-2 mb-2 rounded-xl border border-amber-200 bg-amber-50/95 px-3 py-3 text-[12.5px] leading-relaxed text-amber-950 shadow-sm"
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          size={16}
          className="mt-0.5 shrink-0 text-amber-600"
          strokeWidth={1.75}
        />
        <div className="min-w-0 flex-1">
          <div className="font-medium tracking-wide">对话记录好像不见了</div>
          <p className="mt-1 text-amber-900/85">
            多半是系统在更新时清掉了本地库（不是气泡透明度改动导致的）。
            {lastCount > 0 ? ` 之前大约有 ${lastCount} 条对话。` : ''}
            请立刻去找回：更新前自动备份通常在「下载」里，文件名类似{' '}
            <code className="rounded bg-amber-100/80 px-1">lisse-backup-…json</code>
            。
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                navigate('/data?recover=1');
                onNavigate?.();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-amber-700"
            >
              <HardDrive size={13} />
              立即找回
            </button>
            <button
              type="button"
              onClick={() => {
                dismissWipeBanner();
                setShow(false);
              }}
              className="rounded-lg px-2.5 py-1.5 text-[12px] text-amber-800/80 transition hover:bg-amber-100"
            >
              稍后
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            dismissWipeBanner();
            setShow(false);
          }}
          className="shrink-0 rounded p-0.5 text-amber-700/60 transition hover:bg-amber-100 hover:text-amber-900"
          aria-label="关闭"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
