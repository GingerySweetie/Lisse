import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Capacitor } from '@capacitor/core';
import { db } from '../db';
import UsageStats, {
  type AppUsage,
  type DayUsage,
  type UnlockSummary,
} from '../lib/native/usage-stats';
import { friendlyAppName } from '../lib/app-names';
import {
  fetchUsage,
  formatCompact,
  formatHM,
  generatePageRoasts,
  pickRoastTarget,
  recordAndNotifyRoast,
} from '../lib/screen-time';
import './st-aqua.css';

/**
 * 屏幕使用时间 — DOM and CSS classes mirror `staquaapp.jsx` + `staqua.css`
 * verbatim. All numbers come from the native UsageStats plugin, which
 * rebuilds foreground time from the raw event stream (deduped, bucketed
 * at local midnight) — the big total, the week bars and the 24h dist all
 * share that one source, so they agree with each other. Typing is the
 * one in-app metric: it counts chat characters in this app only.
 */

/* ═══════ Icons ═══════ */
type SvgProps = React.SVGProps<SVGSVGElement>;
const SI = (p: SvgProps): SvgProps => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  ...p,
});
const STIc = {
  back: (p: SvgProps = {}) => (
    <svg {...SI({ width: 18, height: 18, ...p })}>
      <path d="m15 6-6 6 6 6" />
    </svg>
  ),
};

/* ═══════ Stars & Sparkles ═══════ */
function FourStar({ size, color }: { size: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color || 'rgba(255,255,255,0.7)'}>
      <path d="M12 0 C12.5 5 12.8 8 12 12 C8 12.8 5 12.5 0 12 C5 11.5 8 11.2 12 12 C11.2 8 11.5 5 12 0Z" />
      <path d="M12 24 C11.5 19 11.2 16 12 12 C16 11.2 19 11.5 24 12 C19 12.5 16 12.8 12 12 C12.8 16 12.5 19 12 24Z" />
    </svg>
  );
}

function CrossStar({ size, color }: { size: number; color?: string }) {
  const c = color || 'rgba(255,255,255,0.75)';
  const h = size / 2;
  const t = size * 0.06;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill={c}>
      <path d={`M${h} 0 L${h + t} ${h * 0.6} L${h} ${size} L${h - t} ${h * 0.6} Z`} />
      <path d={`M${h} ${size} L${h - t} ${h * 1.4} L${h} 0 L${h + t} ${h * 1.4} Z`} />
      <path d={`M0 ${h} L${h * 0.6} ${h - t} L${size} ${h} L${h * 0.6} ${h + t} Z`} />
      <path d={`M${size} ${h} L${h * 1.4} ${h + t} L0 ${h} L${h * 1.4} ${h - t} Z`} />
    </svg>
  );
}

function Sparkles() {
  const dots = useMemo(() => {
    const arr: { left: string; top: string; delay: string; dur: string }[] = [];
    for (let i = 0; i < 35; i++) {
      arr.push({
        left: Math.random() * 100 + '%',
        top: Math.random() * 100 + '%',
        delay: (Math.random() * 3).toFixed(1) + 's',
        dur: (2.5 + Math.random() * 2).toFixed(1) + 's',
      });
    }
    return arr;
  }, []);

  const stars = useMemo(() => {
    const arr: { right: string; top: string; size: number; delay: string; dur: string; cross: boolean }[] = [];
    for (let i = 0; i < 10; i++) {
      arr.push({
        right: 3 + Math.random() * 30 + '%',
        top: 5 + i * 9 + Math.random() * 6 + '%',
        size: 10 + Math.random() * 14,
        delay: (Math.random() * 2.5).toFixed(1) + 's',
        dur: (2 + Math.random() * 2).toFixed(1) + 's',
        cross: Math.random() > 0.4,
      });
    }
    return arr;
  }, []);

  return (
    <div className="st-sparkles">
      {dots.map((d, i) => (
        <div
          key={'d' + i}
          className="st-sparkle"
          style={{
            left: d.left,
            top: d.top,
            animationDelay: d.delay,
            animationDuration: d.dur,
          }}
        />
      ))}
      {stars.map((s, i) => (
        <div
          key={'s' + i}
          className="st-star4"
          style={{
            right: s.right,
            top: s.top,
            animationDelay: s.delay,
            animationDuration: s.dur,
          }}
        >
          {s.cross ? <CrossStar size={s.size} /> : <FourStar size={s.size} />}
        </div>
      ))}
    </div>
  );
}

/* ═══════ Components ═══════ */

interface Bar {
  day: string;
  val: number;
  today?: boolean;
}

function BarChart({ bars }: { bars: Bar[] }) {
  const mx = Math.max(...bars.map((b) => b.val), 1);
  return (
    <div className="st-bars">
      {bars.map((b, i) => (
        <div key={i} className="st-bar-col">
          <div className="st-bar-track">
            <div
              className={'st-bar' + (b.today ? ' today' : '')}
              style={{ height: Math.max(3, (b.val / mx) * 56) + 'px' }}
            />
          </div>
          <span className={'st-bar-label' + (b.today ? ' today' : '')}>{b.day}</span>
        </div>
      ))}
    </div>
  );
}

function Dist24({ data }: { data: number[] }) {
  const mx = Math.max(...data, 1);
  const peakIdx = data.indexOf(Math.max(...data));
  return (
    <div className="st-dist">
      <div className="st-dist-label">24 小时分布</div>
      <div className="st-dist-row">
        <span className="st-dist-edge l">00</span>
        <div className="st-dist-bars">
          {data.map((v, i) => (
            <div
              key={i}
              className={'st-dist-bar' + (v > 0 && i === peakIdx ? ' peak' : '')}
              style={{ height: Math.max(1, (v / mx) * 32) + 'px' }}
            />
          ))}
        </div>
        <span className="st-dist-edge r">24</span>
      </div>
      <div className="st-dist-ticks">
        <span className="st-dist-tick">06:00</span>
        <span className="st-dist-tick">12:00</span>
        <span className="st-dist-tick">18:00</span>
      </div>
    </div>
  );
}

interface AppRow {
  name: string;
  time: string;
  pct: number;
  top?: boolean;
}

function AppRanking({ apps }: { apps: AppRow[] }) {
  return (
    <div className="st-apps">
      {apps.map((a, i) => (
        <div key={i} className="st-app-row">
          <div className="st-app-info">
            <span className="st-app-name">{a.name}</span>
            <span className="st-app-time">{a.time}</span>
          </div>
          <div className="st-app-track">
            <div
              className={'st-app-fill' + (a.top ? ' top' : '')}
              style={{ width: a.pct * 100 + '%' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Unlocks({
  data,
}: {
  data: { count: number; first: string | null; cmp: string };
}) {
  return (
    <div>
      <div className="st-unlock-num">
        {data.count}
        <span>次解锁</span>
      </div>
      <div className="st-unlock-detail">
        {data.first && <span>首次解锁 {data.first}</span>}
        <span className="green">{data.cmp}</span>
      </div>
    </div>
  );
}

function Typing({
  data,
  isWeekly,
}: {
  data: { today: number; avg: number };
  isWeekly: boolean;
}) {
  return (
    <div className="st-typing-row">
      <div className="st-typing-item">
        <div className="st-typing-val">{data.today.toLocaleString()}</div>
        <div className="st-typing-label">
          {isWeekly ? '本周字数' : '今日字数'}
        </div>
      </div>
      <div className="st-typing-item">
        <div className="st-typing-val">{data.avg.toLocaleString()}</div>
        <div className="st-typing-label">日均</div>
      </div>
    </div>
  );
}

function RoastPopup({
  lili,
  rhema,
  onClose,
}: {
  lili?: string;
  rhema?: string;
  onClose: () => void;
}) {
  return (
    <div className="st-popup-mask" onClick={onClose}>
      <div className="st-popup-card" onClick={(e) => e.stopPropagation()}>
        <div className="st-popup-label">TODAY · ROAST</div>
        <div className="st-popup-roast">
          <div className="st-roast-item lili">
            <div className="st-roast-who">
              <span className="st-roast-dot" />
              <span className="st-roast-name">理理酱</span>
            </div>
            <div className="st-roast-text lili-text">{lili ?? '……'}</div>
          </div>
          <div className="st-roast-item rhema">
            <div className="st-roast-who">
              <span className="st-roast-dot" />
              <span className="st-roast-name">Rhema</span>
            </div>
            <div className="st-roast-text rhema-text">{rhema ?? '……'}</div>
          </div>
        </div>
        <button type="button" className="st-popup-close" onClick={onClose}>
          知道了
        </button>
      </div>
    </div>
  );
}

function RoastSection({
  lili,
  rhema,
  generating,
}: {
  lili?: string;
  rhema?: string;
  generating: boolean;
}) {
  return (
    <div className="st-roast">
      <div className="st-roast-item lili">
        <div className="st-roast-who">
          <span className="st-roast-dot" />
          <span className="st-roast-name">理理酱</span>
        </div>
        <div className="st-roast-text lili-text">
          {lili || (generating ? '……' : '（先去 settings 配个 endpoint，她才能说话）')}
        </div>
      </div>
      <div className="st-roast-item rhema">
        <div className="st-roast-who">
          <span className="st-roast-dot" />
          <span className="st-roast-name">Rhema</span>
        </div>
        <div className="st-roast-text rhema-text">
          {rhema || (generating ? '……' : '（先去 settings 配个 endpoint）')}
        </div>
      </div>
    </div>
  );
}

/* ═══════ Data shaping (real Android usage → mockup shapes) ═══════ */

function buildAppRanking(usage: AppUsage[], totalMs: number): AppRow[] {
  if (totalMs <= 0) return [];
  return usage.slice(0, 6).map((u, i) => ({
    name: friendlyAppName(u.packageName, u.appName),
    time: formatCompact(u.foregroundMs),
    pct: u.foregroundMs / totalMs,
    top: i === 0,
  }));
}

const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

function buildWeekBars(days: DayUsage[]): Bar[] {
  // days is oldest → newest, length 7. Last entry is today.
  return days.map((d, i) => {
    const date = new Date(d.date + 'T00:00:00');
    const dayOfWeek = (date.getDay() + 6) % 7; // Mon=0
    return {
      day: DAY_NAMES[dayOfWeek] ?? '',
      val: d.totalMs / 3_600_000,
      today: i === days.length - 1,
    };
  });
}

/** Format ms vs yesterday's total into the comparison line shown under
 *  the big total. Negative deltas = "减少 N", positive = "增加 N". */
function buildComparison(days: DayUsage[]): string {
  if (days.length < 2) return '今天还行';
  const today = days[days.length - 1].totalMs;
  const yesterday = days[days.length - 2].totalMs;
  const deltaMs = today - yesterday;
  if (yesterday === 0) return '今天还行';
  const absMin = Math.round(Math.abs(deltaMs) / 60_000);
  if (absMin < 10) return '和昨天差不多';
  const h = Math.floor(absMin / 60);
  const m = absMin % 60;
  const dur = h > 0 ? `${h} 小时${m > 0 ? ` ${m} 分` : ''}` : `${m} 分`;
  return deltaMs < 0 ? `较前一日减少 ${dur}` : `较前一日增加 ${dur}`;
}

/* ═══════ Main ═══════ */

export default function ScreenTimePage() {
  const navigate = useNavigate();
  const [granted, setGranted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<AppUsage[]>([]);
  const [weekDays, setWeekDays] = useState<DayUsage[]>([]);
  const [hourBuckets, setHourBuckets] = useState<number[]>(
    () => new Array<number>(24).fill(0),
  );
  const [unlocks, setUnlocks] = useState<UnlockSummary>({ count: 0, firstAt: null });
  // Typing: sum of user message content lengths in db.messages — only what
  // she types in THIS app's chats. Android has no public system-wide
  // keystroke source (that'd take shipping an IME), so the section is
  // labeled 应用内聊天 instead of pretending to be a global counter.
  // Today = sum where createdAt ≥ today 00:00. Avg = last 7 days / 7.
  // Lives in dexie; useLiveQuery re-runs when she sends a new message.
  const typing = useLiveQuery(
    async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 7);
      const weekMsgs = await db.messages
        .where('createdAt')
        .above(weekStart.getTime())
        .filter((m) => m.role === 'user')
        .toArray();
      const todayMs = todayStart.getTime();
      let todayChars = 0;
      let weekChars = 0;
      for (const m of weekMsgs) {
        const len = m.content?.length ?? 0;
        weekChars += len;
        if (m.createdAt >= todayMs) todayChars += len;
      }
      return { today: todayChars, avg: Math.round(weekChars / 7) };
    },
    [],
    { today: 0, avg: 0 },
  );
  const [liliText, setLiliText] = useState<string | undefined>();
  const [rhemaText, setRhemaText] = useState<string | undefined>();
  const [generating, setGenerating] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);

  async function refresh() {
    if (Capacitor.getPlatform() !== 'android') {
      setGranted(false);
      return;
    }
    const perm = await UsageStats.hasPermission();
    setGranted(perm.granted);
    if (!perm.granted) return;

    // Pull everything in parallel — they're independent native queries
    // and we don't want the page to feel sequential.
    const [u, week, dist, unl] = await Promise.all([
      fetchUsage(),
      UsageStats.getWeekUsage().catch(() => ({ days: [] as DayUsage[] })),
      UsageStats.getHourlyDistribution().catch(() => ({ hours: new Array(24).fill(0) })),
      UsageStats.getUnlocks().catch(() => ({ count: 0, firstAt: null })),
    ]);
    setUsage(u);
    setWeekDays(week.days);
    setHourBuckets(dist.hours);
    setUnlocks(unl);

    setGenerating(true);
    try {
      const { lili, rhema, fromCache } = await generatePageRoasts(u);
      setLiliText(lili);
      setRhemaText(rhema);
      if (!fromCache) setPopupOpen(true);
    } finally {
      setGenerating(false);
    }

    const target = await pickRoastTarget(u);
    if (target) {
      await recordAndNotifyRoast(target, u);
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
  const { h: totalH, m: totalM } = formatHM(totalMs);

  // getTodayUsage and getWeekUsage's last bar share the native span
  // engine, so they agree; the week value only backstops the ranking
  // denominator while today's per-app list is still loading.
  const todayMsFromWeek = weekDays[weekDays.length - 1]?.totalMs ?? 0;
  const weekBars = buildWeekBars(weekDays);
  const comparison = buildComparison(weekDays);
  const dist24 = hourBuckets;
  const apps = buildAppRanking(usage, totalMs || todayMsFromWeek);
  const unlocksData = {
    count: unlocks.count,
    first: unlocks.firstAt,
    // No yesterday baseline yet — could compute once we cache day totals.
    cmp: unlocks.firstAt ? '今天的解锁记录' : '暂无解锁数据',
  };
  if (granted === false) {
    return (
      <div className="st">
        <Sparkles />
        <div className="st-inner">
          <div className="st-header">
            <button className="st-back" onClick={() => navigate('/body')}>
              <STIc.back />
            </button>
            <span className="st-header-title">身体</span>
          </div>
          <div
            style={{
              marginTop: 60,
              padding: 24,
              background: 'rgba(255,255,255,0.6)',
              backdropFilter: 'blur(8px)',
              borderRadius: 18,
              textAlign: 'center',
              color: '#3A6E8A',
              fontSize: 13,
              lineHeight: 1.7,
            }}
          >
            Wisteria 需要「用量访问」权限才能看到今天的屏幕时间。
            <br />
            系统设置里给一下就行。
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 10,
                marginTop: 18,
              }}
            >
              <button
                onClick={() => void UsageStats.openSettings().catch(() => {})}
                style={{
                  background: '#2E6580',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '8px 16px',
                  fontSize: 13,
                }}
              >
                去开启
              </button>
              <button
                onClick={() => void refresh()}
                style={{
                  background: 'rgba(255,255,255,0.7)',
                  color: '#2E6580',
                  border: '1px solid rgba(90,155,190,0.25)',
                  borderRadius: 10,
                  padding: '8px 16px',
                  fontSize: 13,
                }}
              >
                已授权 · 刷新
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="st">
      <Sparkles />
      <div className="st-inner">
        <div className="st-header">
          <button className="st-back" onClick={() => navigate('/body')}>
            <STIc.back />
          </button>
          <span className="st-header-title">身体</span>
        </div>

        <div className="st-fade-enter">
          <div className="st-total">
            <div className="st-total-num">
              {totalH}
              <span>小时</span>
              {totalM}
              <span>分钟</span>
            </div>
            <div className="st-total-cmp">{comparison}</div>
          </div>

          <BarChart bars={weekBars} />

          <Dist24 data={dist24} />

          <div className="st-div" />

          <div className="st-section-title">应用使用情况</div>
          {apps.length > 0 ? (
            <AppRanking apps={apps} />
          ) : (
            <div style={{ fontSize: 12, color: '#8ABACE' }}>
              今天还没有用量记录。
            </div>
          )}

          <div className="st-div" />

          <Unlocks data={unlocksData} />

          <div className="st-div" />

          <div className="st-section-title">打字 · 应用内聊天</div>
          <Typing data={typing} isWeekly={false} />

          <div className="st-div" />

          <RoastSection lili={liliText} rhema={rhemaText} generating={generating} />
        </div>
      </div>
      {popupOpen && (
        <RoastPopup
          lili={liliText}
          rhema={rhemaText}
          onClose={() => setPopupOpen(false)}
        />
      )}
    </div>
  );
}
