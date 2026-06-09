import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import UsageStats, { type AppUsage } from '../lib/native/usage-stats';
import {
  fetchUsage,
  formatCompact,
  formatHM,
  getAllTodayRoasts,
  getTier,
  LILI,
  pickRoast,
  pickRoastTarget,
  recordAndNotifyRoast,
  RHEMA,
} from '../lib/screen-time';
import './st-aqua.css';

/**
 * 屏幕使用时间 — DOM and CSS classes mirror `staquaapp.jsx` + `staqua.css`
 * verbatim. Mockup data swapped for real UsageStatsManager numbers where
 * available; week bars / 24h dist / unlocks / typing are stubbed with
 * sensible-but-honest fallbacks when we can't compute them yet.
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
          {isWeekly ? '本周总字数' : '今日打字'}
        </div>
      </div>
      <div className="st-typing-item">
        <div className="st-typing-val">{data.avg.toLocaleString()}</div>
        <div className="st-typing-label">日均</div>
      </div>
    </div>
  );
}

function RoastSection({
  totalHours,
  liliText,
  rhemaText,
}: {
  totalHours: number;
  liliText?: string;
  rhemaText?: string;
}) {
  const tier = getTier(totalHours);
  const [lili] = useState(() => liliText ?? pickRoast(LILI[tier]));
  const [rhema] = useState(() => rhemaText ?? pickRoast(RHEMA[tier]));
  return (
    <div className="st-roast">
      <div className="st-roast-item lili">
        <div className="st-roast-who">
          <span className="st-roast-dot" />
          <span className="st-roast-name">理理酱</span>
        </div>
        <div className="st-roast-text lili-text">{lili}</div>
      </div>
      <div className="st-roast-item rhema">
        <div className="st-roast-who">
          <span className="st-roast-dot" />
          <span className="st-roast-name">Rhema</span>
        </div>
        <div className="st-roast-text rhema-text">{rhema}</div>
      </div>
    </div>
  );
}

/* ═══════ Data shaping (real Android usage → mockup shapes) ═══════ */

function buildAppRanking(usage: AppUsage[], totalMs: number): AppRow[] {
  if (totalMs <= 0) return [];
  return usage.slice(0, 6).map((u, i) => ({
    name: u.appName,
    time: formatCompact(u.foregroundMs),
    pct: u.foregroundMs / totalMs,
    top: i === 0,
  }));
}

function buildWeekBars(todayHours: number): Bar[] {
  // We don't (yet) query 7 days of UsageStats; everything except today is
  // an honest 0. The "today" column still renders with its real height
  // because val matches todayHours.
  const days = ['一', '二', '三', '四', '五', '六', '日'];
  const todayIdx = ((new Date().getDay() + 6) % 7); // Mon=0
  return days.map((d, i) => ({
    day: d,
    val: i === todayIdx ? todayHours : 0,
    today: i === todayIdx,
  }));
}

function buildDist24(usage: AppUsage[]): number[] {
  // Without UsageEvents we can't reconstruct the full hourly histogram;
  // approximate by anchoring each app's foreground time to its
  // lastTimeUsed hour. Cheap, but the shape gives a sense of when she
  // was using the phone today.
  const buckets = new Array<number>(24).fill(0);
  for (const u of usage) {
    if (!u.lastTimeUsed) continue;
    const h = new Date(u.lastTimeUsed).getHours();
    buckets[h] += u.foregroundMs;
  }
  return buckets;
}

/* ═══════ Main ═══════ */

export default function ScreenTimePage() {
  const navigate = useNavigate();
  const [granted, setGranted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<AppUsage[]>([]);
  const [latestLili, setLatestLili] = useState<string | undefined>();
  const [tab, setTab] = useState<'daily' | 'weekly'>('daily');

  async function refresh() {
    if (Capacitor.getPlatform() !== 'android') {
      setGranted(false);
      return;
    }
    const perm = await UsageStats.hasPermission();
    setGranted(perm.granted);
    if (!perm.granted) return;
    const u = await fetchUsage();
    setUsage(u);

    const roasts = await getAllTodayRoasts();
    if (roasts.length > 0) {
      // Newest one shown as the active lili line.
      setLatestLili(roasts.sort((a, b) => b.at - a.at)[0].text);
    }

    const totalMs = u.reduce((a, b) => a + b.foregroundMs, 0);
    const totalH = totalMs / 3_600_000;
    const target = await pickRoastTarget(u);
    if (target) {
      const text = await recordAndNotifyRoast(target, totalH);
      setLatestLili(text);
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
  const totalHoursFloat = totalMs / 3_600_000;

  const weekBars = buildWeekBars(totalHoursFloat);
  const dist24 = buildDist24(usage);
  const apps = buildAppRanking(usage, totalMs);

  // Unlocks / typing aren't queryable through UsageStatsManager (need
  // accessibility / IME stats). Show "—" rather than fake.
  const unlocks = { count: 0, first: null as string | null, cmp: '暂未统计' };
  const typing = { today: 0, avg: 0 };

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

        <div className="st-tabs">
          <button
            className={'st-tab' + (tab === 'daily' ? ' active' : '')}
            onClick={() => setTab('daily')}
          >
            每日
          </button>
          <button
            className={'st-tab' + (tab === 'weekly' ? ' active' : '')}
            onClick={() => setTab('weekly')}
          >
            每周
          </button>
        </div>

        <div key={tab} className="st-fade-enter">
          <div className="st-total">
            <div className="st-total-num">
              {totalH}
              <span>小时</span>
              {totalM}
              <span>分钟</span>
            </div>
            <div className="st-total-cmp">
              {totalH >= 8 ? '比起昨天又多了' : '今天还行'}
            </div>
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

          <Unlocks data={unlocks} />

          <div className="st-div" />

          <div className="st-section-title">打字</div>
          <Typing data={typing} isWeekly={tab === 'weekly'} />

          <div className="st-div" />

          <RoastSection totalHours={totalHoursFloat} liliText={latestLili} />
        </div>
      </div>
    </div>
  );
}
