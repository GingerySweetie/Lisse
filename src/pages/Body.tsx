import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Footprints, Bed, Droplet, Scale } from 'lucide-react';
import StepCounter from '../lib/native/step-counter';

/**
 * Body / 健康 — preview implementation following the Lavender DS health
 * mockup. Four cards: 步数 / 睡眠 / 经期 / 体重.
 *
 * No real data source yet. Top toggle flips between "示例" (hardcoded
 * demo numbers so you can preview the layout) and "空" (empty state —
 * what the page will look like before any data sync is wired up).
 *
 * Real persistence + Google Fit / 手环 / 手动日志 inputs land later
 * when there's an actual source feeding numbers in.
 */

const DEMO = {
  steps: { today: 6420, goal: 8000, week: [5200, 7100, 6800, 9200, 4300, 8800, 6420] },
  sleep: {
    startHHMM: '23:00',
    endHHMM: '06:48',
    totalH: 7,
    totalM: 48,
    deepH: 3,
    deepM: 30,
    deltaMinVsYesterday: 12,
    segs: [
      { o: 0.2, d: 0.6, deep: false },
      { o: 0.8, d: 1.9, deep: true },
      { o: 2.7, d: 1.2, deep: false },
      { o: 3.9, d: 1.6, deep: true },
      { o: 5.5, d: 2.1, deep: false },
    ],
    windowH: 8.5,
  },
  period: { cycle: 28, day: 3, nextDays: 25, todayIndex: 5 },
  weight: {
    current: 61.5,
    history: [62.4, 62.1, 62.3, 61.8, 61.9, 61.6, 61.5],
    deltaKgVsLastWeek: -0.9,
  },
};

export default function BodyPage() {
  const navigate = useNavigate();
  const [filled, setFilled] = useState(true);
  const [weightDraft, setWeightDraft] = useState('');
  const [liveSteps, setLiveSteps] = useState<number | null>(null);

  // Subscribe to the native step counter when running on Android. On
  // web the plugin is a no-op shim — we stay on the demo number.
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        await StepCounter.start();
        const initial = await StepCounter.getSteps();
        if (!cancelled) setLiveSteps(initial.steps);
        const listener = await StepCounter.addListener('stepUpdate', (data) => {
          if (!cancelled) setLiveSteps(data.steps);
        });
        cleanup = () => {
          void listener.remove();
          void StepCounter.stop();
        };
      } catch {
        // Permission denied / no sensor — silently fall back to demo.
      }
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  // Merge live step count into the demo skeleton when available.
  const data = filled
    ? liveSteps !== null
      ? { ...DEMO, steps: { ...DEMO.steps, today: liveSteps } }
      : DEMO
    : null;

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100%',
        position: 'relative',
        background: 'var(--page)',
        fontFamily: "-apple-system,'PingFang SC',sans-serif",
      }}
    >
      <div
        className="topbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px 12px',
        }}
      >
        <button
          onClick={() => navigate('/home')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-3)',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            fontFamily: "'Crimson Pro','Noto Serif SC',serif",
            fontStyle: 'italic',
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
          玄関
        </button>
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 18,
            color: 'var(--head)',
            letterSpacing: 1,
          }}
        >
          身体
        </div>
        <div style={{ width: 48 }} />
      </div>

      <div
        style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: 'clamp(20px, 4vw, 36px) clamp(16px, 5vw, 32px) 80px',
        }}
      >
        <div className="wis-screen-eyebrow">健康 · 一间安静的诊室</div>
        <h1 className="wis-screen-title">今天的身体</h1>

        {/* Preview toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginTop: 18,
            padding: '10px 14px',
            borderRadius: 'var(--r-card)',
            border: '1px dashed var(--line)',
            background: 'rgba(245,240,250,0.45)',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text-2)', fontWeight: 500 }}>预览模式</strong>
            <span style={{ marginLeft: 8 }}>
              真实数据要等接入 Google Fit / 手环 / 手动日志后才会有
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFilled((v) => !v)}
            className="btn-ghost"
            style={{ flexShrink: 0, fontSize: 12, padding: '4px 12px' }}
          >
            {filled ? '看空状态' : '看示例数据'}
          </button>
        </div>

        {data ? (
          <div className="wis-health-cards">
            <StepsCard data={data.steps} />
            <SleepCard data={data.sleep} />
            <PeriodCard data={data.period} />
            <WeightCard
              data={data.weight}
              draft={weightDraft}
              onDraftChange={setWeightDraft}
            />
          </div>
        ) : (
          <EmptyHealth />
        )}
      </div>
    </div>
  );
}

function StepsCard({ data }: { data: typeof DEMO.steps }) {
  const days = ['一', '二', '三', '四', '五', '六', '日'];
  return (
    <div className="wis-hcard">
      <div className="wis-hcard-head">
        <span className="wis-hcard-ic">
          <Footprints size={16} strokeWidth={1.7} />
        </span>
        <span className="wis-hcard-label">步数</span>
        <span className="wis-hcard-aside">目标 {data.goal.toLocaleString()}</span>
      </div>
      <div className="wis-steps-row">
        <div className="wis-ring-wrap">
          <RingProgress value={data.today} max={data.goal} size={96} stroke={9} />
          <div className="wis-ring-center">
            <div className="wis-ring-num">{data.today.toLocaleString()}</div>
            <div className="wis-ring-unit">步</div>
          </div>
        </div>
        <div className="wis-steps-side">
          <div className="wis-steps-goal">
            还差 <b>{Math.max(0, data.goal - data.today).toLocaleString()}</b> 步达成今日目标
          </div>
          <div className="wis-spark">
            <Sparkline data={data.week} h={40} />
            <div className="wis-spark-days">
              {days.map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SleepCard({ data }: { data: typeof DEMO.sleep }) {
  return (
    <div className="wis-hcard">
      <div className="wis-hcard-head">
        <span className="wis-hcard-ic">
          <Bed size={16} strokeWidth={1.7} />
        </span>
        <span className="wis-hcard-label">睡眠</span>
        <span className="wis-hcard-aside">
          {data.startHHMM} — {data.endHHMM}
        </span>
      </div>
      <div className="wis-sleep-bars">
        <div className="wis-sleep-track">
          <svg
            width="100%"
            height="18"
            viewBox="0 0 340 18"
            preserveAspectRatio="none"
            style={{ display: 'block' }}
          >
            {data.segs.map((s, i) => (
              <rect
                key={i}
                x={(s.o / data.windowH) * 340}
                y={s.deep ? 0 : 4}
                width={Math.max(0, (s.d / data.windowH) * 340 - 2)}
                height={s.deep ? 18 : 10}
                rx="3"
                fill={s.deep ? 'var(--lav-600)' : 'var(--lav-300)'}
              />
            ))}
          </svg>
        </div>
        <div className="wis-sleep-scale">
          <span>23:00</span>
          <span>01:00</span>
          <span>03:00</span>
          <span>05:00</span>
          <span>07:00</span>
        </div>
      </div>
      <div className="wis-sleep-tot">
        <span className="wis-sleep-big">
          {data.totalH}
          <span style={{ fontSize: 16, color: 'var(--text-3)' }}>时</span>
          {data.totalM}
          <span style={{ fontSize: 16, color: 'var(--text-3)' }}>分</span>
        </span>
        <span className="wis-sleep-cap">
          深睡 {data.deepH} 时 {data.deepM} 分 · 较昨日{' '}
          {data.deltaMinVsYesterday >= 0 ? '+' : ''}
          {data.deltaMinVsYesterday} 分
        </span>
      </div>
      <div className="wis-legend">
        <span>
          <i style={{ background: 'var(--lav-600)' }} />
          深睡
        </span>
        <span>
          <i style={{ background: 'var(--lav-300)' }} />
          浅睡
        </span>
      </div>
    </div>
  );
}

function PeriodCard({ data }: { data: typeof DEMO.period }) {
  const cal = Array.from({ length: data.cycle }, (_, i) => {
    const day = i + 1;
    if (day >= 1 && day <= 3) return 'on';
    if (day === data.todayIndex) return 'today';
    if (day >= data.cycle - 2) return 'predict';
    return '';
  });
  return (
    <div className="wis-hcard">
      <div className="wis-hcard-head">
        <span
          className="wis-hcard-ic"
          style={{ background: 'var(--amber-100)', color: 'var(--amber-text)' }}
        >
          <Droplet size={16} strokeWidth={1.7} />
        </span>
        <span className="wis-hcard-label">经期</span>
        <span className="wis-hcard-aside">周期 {data.cycle} 天</span>
      </div>
      <div className="wis-period">
        <div className="wis-period-badge">
          <span className="wis-period-day">{data.day}</span>
          <span className="wis-period-lab">第 N 天</span>
        </div>
        <div className="wis-period-main">
          <div className="wis-period-state">经期第 {data.day} 天</div>
          <div className="wis-period-sub">
            流量渐弱 · 距下次约{' '}
            <b style={{ color: 'var(--amber-text)' }}>{data.nextDays} 天</b> · 多喝温水
          </div>
        </div>
      </div>
      <div className="wis-period-cal">
        {cal.map((c, i) => (
          <div key={i} className={`wis-cal-dot ${c}`.trim()}>
            {i + 1}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeightCard({
  data,
  draft,
  onDraftChange,
}: {
  data: typeof DEMO.weight;
  draft: string;
  onDraftChange: (v: string) => void;
}) {
  return (
    <div className="wis-hcard">
      <div className="wis-hcard-head">
        <span className="wis-hcard-ic">
          <Scale size={16} strokeWidth={1.7} />
        </span>
        <span className="wis-hcard-label">体重</span>
        <span className="wis-hcard-aside">近 7 天</span>
      </div>
      <div className="wis-weight-row">
        <span className="wis-weight-big">{data.current.toFixed(1)}</span>
        <span className="wis-weight-unit">kg</span>
        <span className="wis-weight-delta">
          较上周 {data.deltaKgVsLastWeek >= 0 ? '+' : ''}
          {data.deltaKgVsLastWeek.toFixed(1)} kg
        </span>
      </div>
      <div style={{ marginTop: 12 }}>
        <Sparkline data={data.history} h={44} />
      </div>
      <div className="wis-weight-input">
        <input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="记一笔今天的体重 / 备注…"
          inputMode="decimal"
        />
        <button
          type="button"
          className="wis-mini-btn"
          onClick={() => {
            /* persistence wires up when health-data table lands */
            onDraftChange('');
          }}
        >
          记录
        </button>
      </div>
    </div>
  );
}

function EmptyHealth() {
  return (
    <div
      style={{
        marginTop: 40,
        padding: '40px 20px',
        textAlign: 'center',
        color: 'var(--text-3)',
        fontSize: 13,
        lineHeight: 1.8,
      }}
    >
      <div className="empty-state-flower" style={{ display: 'inline-block', marginBottom: 16 }}>
        <svg width="48" height="48" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="20" stroke="var(--lav-300)" strokeWidth="1" opacity="0.6" />
          <circle cx="32" cy="32" r="3" fill="var(--lav-400)" />
        </svg>
      </div>
      <div>
        手环 / Google Fit / 手动健康日志 还没接上 ——
        <br />
        接好之后这里会显示心率、睡眠、步数和经期。
      </div>
    </div>
  );
}

// ─── Mini SVG primitives ──────────────────────────────────────────────

function RingProgress({
  value,
  max,
  size,
  stroke,
}: {
  value: number;
  max: number;
  size: number;
  stroke: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, value / Math.max(1, max));
  const dash = c * pct;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent-tint)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function Sparkline({ data, h }: { data: number[]; h: number }) {
  const w = 200;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = Math.max(1, max - min);
  const stepX = w / Math.max(1, data.length - 1);
  const pts = data
    .map((v, i) => {
      const x = i * stepX;
      const y = h - 4 - ((v - min) / span) * (h - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <polyline
        points={pts}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
