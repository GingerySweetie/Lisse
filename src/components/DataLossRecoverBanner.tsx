import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, HardDrive, X } from 'lucide-react';
import { db, getSettings } from '../db';
import {
  dismissWipeBanner,
  getLastBackups,
  isWipeBannerDismissed,
  lastKnownConversationCount,
  looksLikeDataWipe,
  rememberConversationPresence,
} from '../lib/data-presence';
import { requestPersistentStorage } from '../lib/storage-persist';

/**
 * Banner when IndexedDB looks wiped after an update.
 * Mount in Sidebar AND Home (mobile often has the drawer closed).
 */
export default function DataLossRecoverBanner({
  onNavigate,
  variant = 'inline',
}: {
  onNavigate?: () => void;
  /** `fixed` sits over the Home art; `inline` sits in the sidebar list. */
  variant?: 'inline' | 'fixed';
}) {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [lastCount, setLastCount] = useState(0);
  const [backupNames, setBackupNames] = useState<string[]>([]);

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
        setLastCount(lastKnownConversationCount());
        setBackupNames(getLastBackups().map((b) => b.filename).slice(0, 3));
        setShow(true);
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

  const shell =
    variant === 'fixed'
      ? 'fixed inset-x-3 z-[80] rounded-xl border border-amber-200 bg-amber-50/97 px-3 py-3 text-[12.5px] leading-relaxed text-amber-950 shadow-lg backdrop-blur'
      : 'mx-2 mb-2 rounded-xl border border-amber-200 bg-amber-50/95 px-3 py-3 text-[12.5px] leading-relaxed text-amber-950 shadow-sm';

  const topStyle =
    variant === 'fixed'
      ? {
          top: 'calc(12px + env(safe-area-inset-top, 0px))',
        }
      : undefined;

  return (
    <div className={shell} style={topStyle} role="alert">
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
            请立刻去找回。
          </p>
          {backupNames.length > 0 ? (
            <p className="mt-1.5 text-[11px] text-amber-900/75">
              上次自动备份文件名：
              {backupNames.map((n) => (
                <code
                  key={n}
                  className="ml-1 inline-block rounded bg-amber-100/90 px-1"
                >
                  {n}
                </code>
              ))}
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] text-amber-900/75">
              在「下载」里找{' '}
              <code className="rounded bg-amber-100/80 px-1">
                lisse-backup-….json
              </code>
            </p>
          )}
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
