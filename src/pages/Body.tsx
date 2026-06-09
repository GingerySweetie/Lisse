import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Capacitor } from '@capacitor/core';
import { Footprints, Bed, Droplet, Plus, Scale, Trash2, X } from 'lucide-react';
import { db } from '../db';
import StepCounter from '../lib/native/step-counter';
import Sleep, { type SleepSession } from '../lib/native/sleep';
import { schedulePeriodReminders } from '../lib/native/notifications';
import {
  addPeriodStart,
  daysBetween,
  deletePeriodEntry,
  isoDate,
  summarizeCycle,
} from '../lib/period';
import type { PeriodEntry } from '../types';

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

/** Build a sleep.* shape from a Health Connect session. We only know
 *  total start/end; without sleep stages we approximate "深睡" as 45%
 *  of total and render a single non-deep segment. Good enough for the
 *  card; sleep stages can come later. */
function mergeSleep(s: SleepSession): typeof DEMO.sleep {
  const start = new Date(s.startTime);
  const end = new Date(s.endTime);
  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const totalMin = Math.max(0, s.durationMinutes);
  const totalH = Math.floor(totalMin / 60);
  const totalM = totalMin % 60;
  const deepMin = Math.round(totalMin * 0.45);
  const deepH = Math.floor(deepMin / 60);
  const deepM = deepMin % 60;
  const windowH = Math.max(8.5, totalMin / 60 + 0.5);
  return {
    startHHMM: fmt(start),
    endHHMM: fmt(end),
    totalH,
    totalM,
    deepH,
    deepM,
    deltaMinVsYesterday: 0,
    segs: [{ o: 0, d: totalMin / 60, deep: false }],
    windowH,
  };
}

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
  const [liveSleep, setLiveSleep] = useState<SleepSession | null>(null);
  const [sleepNeedsAuth, setSleepNeedsAuth] = useState(false);
  const [periodSheet, setPeriodSheet] = useState(false);

  // Real period entries — when the user has logged at least one cycle,
  // we render that instead of the demo period card.
  const periodEntries = useLiveQuery(
    () => db.periodEntries.orderBy('startDate').toArray(),
    [],
    [],
  );
  const hasRealPeriod = (periodEntries ?? []).length > 0;

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

  // Read last night's sleep from Health Connect on mount. On non-Android
  // or when permission is denied this stays null and the demo data shows.
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let cancelled = false;
    (async () => {
      try {
        const avail = await Sleep.isAvailable();
        if (!avail.available) return;
        const perm = await Sleep.hasPermission();
        if (!perm.granted) {
          if (!cancelled) setSleepNeedsAuth(true);
          return;
        }
        const res = await Sleep.getLastSleep();
        if (!cancelled && res.session) setLiveSleep(res.session);
      } catch {
        // Silently fall back to demo.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleConnectSleep() {
    try {
      await Sleep.requestPermission();
      // The user might come back having granted or not; re-check + read.
      const perm = await Sleep.hasPermission();
      if (perm.granted) {
        setSleepNeedsAuth(false);
        const res = await Sleep.getLastSleep();
        if (res.session) setLiveSleep(res.session);
      }
    } catch {
      // ignore
    }
  }

  // Merge live data into the demo skeleton.
  const data = filled
    ? {
        ...DEMO,
        steps:
          liveSteps !== null ? { ...DEMO.steps, today: liveSteps } : DEMO.steps,
        sleep: liveSleep ? mergeSleep(liveSleep) : DEMO.sleep,
      }
    : null;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: 'var(--page)',
        fontFamily: "-apple-system,'PingFang SC',sans-serif",
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div
        className="topbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px 12px',
          position: 'sticky',
          top: 0,
          zIndex: 5,
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
            <SleepCard
              data={data.sleep}
              needsAuth={sleepNeedsAuth}
              onConnect={handleConnectSleep}
            />
            {hasRealPeriod ? (
              <RealPeriodCard
                entries={periodEntries ?? []}
                onAdd={() => setPeriodSheet(true)}
              />
            ) : (
              <PeriodCard
                data={data.period}
                onAdd={() => setPeriodSheet(true)}
              />
            )}
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

      {periodSheet && (
        <PeriodSheet
          entries={periodEntries ?? []}
          onClose={() => setPeriodSheet(false)}
        />
      )}
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

function SleepCard({
  data,
  needsAuth,
  onConnect,
}: {
  data: typeof DEMO.sleep;
  needsAuth?: boolean;
  onConnect?: () => void;
}) {
  return (
    <div className="wis-hcard">
      <div className="wis-hcard-head">
        <span className="wis-hcard-ic">
          <Bed size={16} strokeWidth={1.7} />
        </span>
        <span className="wis-hcard-label">睡眠</span>
        {needsAuth ? (
          <button
            type="button"
            onClick={onConnect}
            className="wis-hcard-aside"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--lav-600)',
              textDecoration: 'underline',
            }}
          >
            接 Health Connect
          </button>
        ) : (
          <span className="wis-hcard-aside">
            {data.startHHMM} — {data.endHHMM}
          </span>
        )}
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

function PeriodCard({
  data,
  onAdd,
}: {
  data: typeof DEMO.period;
  onAdd?: () => void;
}) {
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
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="icon-btn"
            style={{ marginLeft: 6 }}
            aria-label="记一笔"
            title="记一笔"
          >
            <Plus size={14} />
          </button>
        )}
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

// ─── Real period card + add sheet ─────────────────────────────────────

function RealPeriodCard({
  entries,
  onAdd,
}: {
  entries: PeriodEntry[];
  onAdd: () => void;
}) {
  const today = isoDate(new Date());
  const summary = summarizeCycle(entries, today);
  // Calendar window: avgCycle days starting from latest start.
  const latest = summary.latestStart!;
  const cal: { dayNum: number; iso: string; cls: string }[] = [];
  for (let i = 0; i < summary.avgCycle; i++) {
    const d = new Date(latest + 'T00:00:00');
    d.setDate(d.getDate() + i);
    const iso = isoDate(d);
    let cls = '';
    // Active period: within avgPeriod days of any logged startDate
    const isOn = entries.some((e) => {
      const dayDelta = daysBetween(e.startDate, iso);
      const lenDays = e.endDate
        ? daysBetween(e.startDate, e.endDate) + 1
        : summary.avgPeriod;
      return dayDelta >= 0 && dayDelta < lenDays;
    });
    if (isOn) cls = 'on';
    if (iso === today) cls = 'today';
    if (iso === summary.predictedNext) cls = cls === 'today' ? 'today' : 'predict';
    cal.push({ dayNum: i + 1, iso, cls });
  }

  const stateLabel =
    summary.currentDay <= summary.avgPeriod
      ? `经期第 ${summary.currentDay} 天`
      : summary.daysToNext <= 0
        ? `应来 · 超过 ${-summary.daysToNext} 天`
        : `周期第 ${summary.currentDay} 天`;
  const nextLabel =
    summary.daysToNext >= 0
      ? `距下次约 ${summary.daysToNext} 天`
      : `已超 ${-summary.daysToNext} 天`;

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
        <span className="wis-hcard-aside">周期 {summary.avgCycle} 天</span>
        <button
          type="button"
          onClick={onAdd}
          className="icon-btn"
          style={{ marginLeft: 6 }}
          aria-label="记一笔"
          title="记一笔"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="wis-period">
        <div className="wis-period-badge">
          <span className="wis-period-day">{summary.currentDay}</span>
          <span className="wis-period-lab">第 N 天</span>
        </div>
        <div className="wis-period-main">
          <div className="wis-period-state">{stateLabel}</div>
          <div className="wis-period-sub">
            最近开始 {summary.latestStart} ·{' '}
            <b style={{ color: 'var(--amber-text)' }}>{nextLabel}</b>
          </div>
        </div>
      </div>
      <div className="wis-period-cal">
        {cal.map((c) => (
          <div key={c.iso} className={`wis-cal-dot ${c.cls}`.trim()}>
            {c.dayNum}
          </div>
        ))}
      </div>
    </div>
  );
}

function PeriodSheet({
  entries,
  onClose,
}: {
  entries: PeriodEntry[];
  onClose: () => void;
}) {
  const today = isoDate(new Date());
  const [draftDate, setDraftDate] = useState(today);
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    setBusy(true);
    try {
      await addPeriodStart(draftDate);
      // Re-schedule notifications: cancels previous reminders and queues
      // new ones based on the updated prediction. No-op on web.
      const all = await db.periodEntries.toArray();
      const s = summarizeCycle(all);
      await schedulePeriodReminders({
        predictedNext: s.predictedNext,
        avgCycle: s.avgCycle,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('删除这一条？')) return;
    await deletePeriodEntry(id);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(60,30,50,0.25)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'rgba(255,247,250,0.96)',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          padding: '18px 18px 22px',
          maxHeight: '80vh',
          overflowY: 'auto',
          fontFamily: "-apple-system,'PingFang SC',sans-serif",
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <span
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontStyle: 'italic',
              fontWeight: 500,
              fontSize: 18,
              color: '#9a5a76',
            }}
          >
            经期记录
          </span>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn"
            aria-label="关掉"
          >
            <X size={14} />
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            padding: '12px 14px',
            borderRadius: 14,
            background: 'rgba(255,236,232,0.6)',
            border: '1px solid rgba(232,161,75,0.25)',
          }}
        >
          <span style={{ fontSize: 13, color: '#9a5a76', fontWeight: 500 }}>
            开始日
          </span>
          <input
            type="date"
            value={draftDate}
            max={today}
            onChange={(e) => setDraftDate(e.target.value)}
            style={{
              flex: 1,
              fontSize: 14,
              padding: '6px 10px',
              border: '1px solid rgba(232,161,75,0.35)',
              borderRadius: 10,
              background: '#fff',
              fontFamily: 'inherit',
              outline: 'none',
              color: '#643040',
            }}
          />
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={busy}
            style={{
              border: 0,
              borderRadius: 10,
              background: '#E8A14B',
              color: '#fff',
              fontSize: 13,
              fontWeight: 500,
              padding: '7px 14px',
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy ? '记…' : '记下'}
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          <div
            style={{
              fontSize: 11,
              color: 'rgba(154,90,118,0.7)',
              letterSpacing: '0.1em',
              marginBottom: 8,
              padding: '0 4px',
            }}
          >
            历史 ({entries.length})
          </div>
          {entries.length === 0 ? (
            <div
              style={{
                padding: '20px 12px',
                textAlign: 'center',
                fontSize: 12,
                color: 'rgba(154,90,118,0.55)',
                fontStyle: 'italic',
              }}
            >
              还没有记录。
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {[...entries]
                .sort((a, b) => b.startDate.localeCompare(a.startDate))
                .map((e) => (
                  <li
                    key={e.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 12,
                      background: 'rgba(255,247,250,0.65)',
                      border: '1px solid rgba(232,161,75,0.15)',
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontSize: 13, color: '#643040', flex: 1 }}>
                      {e.startDate}
                      {e.endDate && (
                        <span
                          style={{
                            color: 'rgba(100,48,64,0.6)',
                            marginLeft: 6,
                            fontSize: 11,
                          }}
                        >
                          → {e.endDate}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleDelete(e.id)}
                      className="icon-btn danger"
                      aria-label="删除"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
