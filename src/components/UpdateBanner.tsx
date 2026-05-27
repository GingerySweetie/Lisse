import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';

/**
 * Tiny banner shown when a new service-worker version has been installed.
 * Tapping it reloads the page so the user immediately runs the new bundle.
 */
export default function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Poll for updates every 30 minutes while the app is open.
      if (reg) {
        setInterval(() => reg.update().catch(() => undefined), 30 * 60 * 1000);
      }
    },
  });

  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (needRefresh) {
      const t = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(t);
    }
    setVisible(false);
  }, [needRefresh]);

  if (!needRefresh) return null;

  return (
    <div
      className={`pointer-events-auto fixed inset-x-0 bottom-3 z-[100] mx-auto flex w-[min(92vw,28rem)] items-center justify-between gap-2 rounded-2xl border border-lavender-300 bg-white/95 px-4 py-3 shadow-lg backdrop-blur transition-all duration-200 ${
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
