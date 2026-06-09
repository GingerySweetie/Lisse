import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import UsageStats, { type AppUsage } from '../lib/native/usage-stats';
import {
  fetchUsage,
  formatDuration,
  generateRoast,
  getAllTodayRoasts,
  isReader,
  pickRoastTarget,
  recordAndNotifyRoast,
} from '../lib/screen-time';

/**
 * 屏幕使用时间 — aqua-palette page (#D4E5EE). Mounted at /screen-time;
 * Body page hangs a link to here at the bottom of the day's panel.
 *
 * Fetches today's per-app foreground time from UsageStatsManager (native
 * Android, special-access permission). Above a daily threshold for any
 * non-reader app, generates a roast in the user's active persona's voice
 * and surfaces it as a banner + local notification.
 */

const AQUA_BG =
  'linear-gradient(180deg, #D4E5EE 0%, #C8DDE9 60%, #BFD5E4 100%)';

interface RoastRow {
  text: string;
  at: number;
  appName: string;
  minutes: number;
}

export default function ScreenTimePage() {
  const navigate = useNavigate();
  const [granted, setGranted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<AppUsage[]>([]);
  const [roasts, setRoasts] = useState<RoastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  async function refresh() {
    if (Capacitor.getPlatform() !== 'android') {
      setGranted(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const perm = await UsageStats.hasPermission();
      setGranted(perm.granted);
      if (!perm.granted) {
        setLoading(false);
        return;
      }
      const u = await fetchUsage();
      setUsage(u);
      setRoasts(await getAllTodayRoasts());

      // Auto-roast: if a non-reader app crossed threshold and hasn't
      // been roasted yet today, fire a line. Doesn't block the UI —
      // banner appears once the call returns.
      const target = await pickRoastTarget(u);
      if (target && !generating) {
        setGenerating(true);
        try {
          const text = await generateRoast(target);
          await recordAndNotifyRoast(target, text);
          setRoasts(await getAllTodayRoasts());
        } finally {
          setGenerating(false);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    function onVis() {
      if (document.visibilityState === 'visible') void refresh();
    }
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalMs = usage.reduce((a, b) => a + b.foregroundMs, 0);
  const readerMs = usage
    .filter((u) => isReader(u.packageName))
    .reduce((a, b) => a + b.foregroundMs, 0);
  const scrollMs = totalMs - readerMs;
  const topApps = usage.slice(0, 8);
  const maxMs = topApps[0]?.foregroundMs ?? 1;

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100%',
        background: AQUA_BG,
        position: 'relative',
        fontFamily: "'Noto Sans SC', -apple-system, 'PingFang SC', sans-serif",
        color: '#1f3a4a',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '14px 16px 12px',
        }}
      >
        <button
          onClick={() => navigate('/body')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'rgba(31,58,74,0.55)',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            fontStyle: 'italic',
            fontFamily: "'Cormorant Garamond','Noto Serif SC',serif",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M10 3L5 8L10 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          身体
        </button>
        <div
          style={{
            flex: 1,
            textAlign: 'center',
            fontFamily: "'Cormorant Garamond', serif",
            fontStyle: 'italic',
            fontSize: 18,
            letterSpacing: 2,
            color: 'rgba(31,58,74,0.75)',
          }}
        >
          屏幕使用时间
        </div>
        <div style={{ width: 48 }} />
      </header>

      <div style={{ padding: '12px 18px 40px' }}>
        {granted === false && (
          <PermissionGate
            onOpen={() => void UsageStats.openSettings().catch(() => {})}
            onRefresh={() => void refresh()}
          />
        )}

        {granted === true && (
          <>
            <HeroCard
              loading={loading}
              totalMs={totalMs}
              readerMs={readerMs}
              scrollMs={scrollMs}
            />

            {roasts.length > 0 && <RoastList rows={roasts} />}
            {generating && roasts.length === 0 && (
              <div
                style={{
                  marginTop: 12,
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.4)',
                  borderRadius: 12,
                  fontSize: 12,
                  color: 'rgba(31,58,74,0.55)',
                  fontStyle: 'italic',
                  fontFamily: "'Cormorant Garamond', serif",
                }}
              >
                让她想想要怎么说你……
              </div>
            )}

            <TopAppsList apps={topApps} maxMs={maxMs} />
          </>
        )}
      </div>
    </div>
  );
}

function PermissionGate({
  onOpen,
  onRefresh,
}: {
  onOpen: () => void;
  onRefresh: () => void;
}) {
  return (
    <div
      style={{
        marginTop: 40,
        padding: 24,
        background: 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(8px)',
        borderRadius: 18,
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: 13, color: 'rgba(31,58,74,0.7)', margin: 0 }}>
        Wisteria 需要「用量访问」权限才能看到你今天用了哪些 app 多久。
        <br />
        系统设置里给一下就行。
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 18 }}>
        <button
          onClick={onOpen}
          style={{
            background: 'rgba(31,58,74,0.85)',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            padding: '8px 16px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          去开启
        </button>
        <button
          onClick={onRefresh}
          style={{
            background: 'rgba(255,255,255,0.6)',
            color: 'rgba(31,58,74,0.85)',
            border: '1px solid rgba(31,58,74,0.2)',
            borderRadius: 10,
            padding: '8px 16px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          已授权 · 刷新
        </button>
      </div>
    </div>
  );
}

function HeroCard({
  loading,
  totalMs,
  readerMs,
  scrollMs,
}: {
  loading: boolean;
  totalMs: number;
  readerMs: number;
  scrollMs: number;
}) {
  const readerPct = totalMs > 0 ? (readerMs / totalMs) * 100 : 0;
  return (
    <section
      style={{
        background: 'rgba(255,255,255,0.5)',
        backdropFilter: 'blur(10px)',
        borderRadius: 18,
        padding: '20px 22px 18px',
        boxShadow: '0 2px 12px rgba(31,58,74,0.06)',
      }}
    >
      <div
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontStyle: 'italic',
          fontSize: 11,
          color: 'rgba(31,58,74,0.55)',
          letterSpacing: 2,
        }}
      >
        TODAY
      </div>
      <div
        style={{
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          fontSize: 34,
          fontWeight: 300,
          color: 'rgba(31,58,74,0.92)',
          marginTop: 2,
          letterSpacing: -0.5,
        }}
      >
        {loading ? '…' : formatDuration(totalMs)}
      </div>
      <div
        style={{
          display: 'flex',
          height: 6,
          marginTop: 14,
          borderRadius: 3,
          overflow: 'hidden',
          background: 'rgba(31,58,74,0.08)',
        }}
      >
        <div
          style={{
            width: `${readerPct}%`,
            background: 'linear-gradient(90deg, #6fa5b5, #8fc0cf)',
          }}
        />
        <div style={{ flex: 1, background: 'rgba(31,58,74,0.15)' }} />
      </div>
      <div
        style={{
          marginTop: 8,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: 'rgba(31,58,74,0.55)',
        }}
      >
        <span>
          <i
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#6fa5b5',
              marginRight: 4,
            }}
          />
          阅读 {formatDuration(readerMs)}
        </span>
        <span>
          <i
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'rgba(31,58,74,0.3)',
              marginRight: 4,
            }}
          />
          其他 {formatDuration(scrollMs)}
        </span>
      </div>
    </section>
  );
}

function RoastList({ rows }: { rows: RoastRow[] }) {
  return (
    <section
      style={{
        marginTop: 16,
        background: 'rgba(255,255,255,0.5)',
        backdropFilter: 'blur(10px)',
        borderRadius: 18,
        padding: '16px 20px',
      }}
    >
      <div
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontStyle: 'italic',
          fontSize: 11,
          color: 'rgba(31,58,74,0.55)',
          letterSpacing: 2,
          marginBottom: 8,
        }}
      >
        TODAY · ROASTS
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows
          .sort((a, b) => b.at - a.at)
          .map((r, i) => (
            <li
              key={`${r.appName}-${i}`}
              style={{
                paddingLeft: 12,
                borderLeft: '2px solid rgba(31,58,74,0.25)',
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  lineHeight: 1.65,
                  color: 'rgba(31,58,74,0.92)',
                  fontFamily: "'Noto Serif SC', serif",
                }}
              >
                {r.text}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: 'rgba(31,58,74,0.45)',
                  marginTop: 2,
                  letterSpacing: 1,
                }}
              >
                {r.appName} · {r.minutes} 分
              </div>
            </li>
          ))}
      </ul>
    </section>
  );
}

function TopAppsList({ apps, maxMs }: { apps: AppUsage[]; maxMs: number }) {
  return (
    <section
      style={{
        marginTop: 16,
        background: 'rgba(255,255,255,0.5)',
        backdropFilter: 'blur(10px)',
        borderRadius: 18,
        padding: '16px 20px 14px',
      }}
    >
      <div
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontStyle: 'italic',
          fontSize: 11,
          color: 'rgba(31,58,74,0.55)',
          letterSpacing: 2,
          marginBottom: 10,
        }}
      >
        APPS
      </div>
      {apps.length === 0 ? (
        <div style={{ fontSize: 12, color: 'rgba(31,58,74,0.5)' }}>
          今天还没有用量记录。
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {apps.map((a) => {
            const pct = (a.foregroundMs / maxMs) * 100;
            const reader = isReader(a.packageName);
            return (
              <li key={a.packageName} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AppIcon usage={a} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span
                      style={{
                        fontSize: 13,
                        color: 'rgba(31,58,74,0.85)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '60%',
                      }}
                    >
                      {a.appName}
                    </span>
                    <span
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 11,
                        color: 'rgba(31,58,74,0.65)',
                      }}
                    >
                      {formatDuration(a.foregroundMs)}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 5,
                      height: 4,
                      borderRadius: 2,
                      background: 'rgba(31,58,74,0.08)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: reader
                          ? 'linear-gradient(90deg, #6fa5b5, #8fc0cf)'
                          : 'linear-gradient(90deg, rgba(31,58,74,0.4), rgba(31,58,74,0.25))',
                      }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AppIcon({ usage }: { usage: AppUsage }) {
  if (usage.iconPng) {
    return (
      <img
        src={`data:image/png;base64,${usage.iconPng}`}
        alt={usage.appName}
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          flexShrink: 0,
          background: 'rgba(255,255,255,0.5)',
        }}
      />
    );
  }
  // Fallback glyph: first character of the app name on an aqua chip.
  const ch = usage.appName.charAt(0) || '·';
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        background: 'rgba(31,58,74,0.12)',
        color: 'rgba(31,58,74,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontFamily: "'Cormorant Garamond', serif",
        fontStyle: 'italic',
        flexShrink: 0,
      }}
    >
      {ch}
    </div>
  );
}
