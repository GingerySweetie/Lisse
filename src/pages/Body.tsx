import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Capacitor } from '@capacitor/core';
import {
  Activity,
  Bed,
  Droplet,
  Footprints,
  Plus,
  Scale,
  Trash2,
  X,
} from 'lucide-react';
import { db } from '../db';
import StepCounter from '../lib/native/step-counter';
import Sleep, { type SleepSession } from '../lib/native/sleep';
import {
  checkHealthAuth,
  getLastNightSleep,
  getTodayHeartRate,
  getTodayHeartRateSeries,
  getTodaySteps,
  getWeeklySteps,
  isHealthAvailable,
  requestHealthPermissions,
  type SleepSummary,
} from '../services/health-connect';
import { schedulePeriodReminders } from '../lib/native/notifications';
import {
  addPeriodStart,
  daysBetween,
  deletePeriodEntry,
  isoDate,
  summarizeCycle,
} from '../lib/period';
import { addWeight } from '../lib/weight';
import type { PeriodEntry, WeightEntry } from '../types';

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

/** Build a weight.* shape from persisted entries. Latest entry is the
 *  current; the last 7 (oldest→newest) become the sparkline. Delta vs
 *  last week = current - the reading from ~7 days ago, or first reading
 *  if there aren't 7 days of history yet. */
function mergeWeight(entries: WeightEntry[]): typeof DEMO.weight {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-7);
  const current = recent[recent.length - 1].kg;
  const baseline =
    sorted.length >= 8
      ? sorted[sorted.length - 8].kg
      : sorted[0].kg;
  return {
    current,
    history: recent.map((e) => e.kg),
    deltaKgVsLastWeek: +(current - baseline).toFixed(1),
  };
}

/** One segment in the sleep bar. `stage` is HC sleep-stage data when the
 *  band provided it; otherwise undefined. `deep` is kept for backward
 *  compat — true ↔ stage === 'deep' so renderers that ignore stage still
 *  pick the right color. */
interface SleepSeg {
  o: number;
  d: number;
  deep: boolean;
  stage?: string;
}
interface SleepData {
  startHHMM: string;
  endHHMM: string;
  totalH: number;
  totalM: number;
  /** -1 sentinel: no stage data available → renderer hides "深睡" line. */
  deepH: number;
  deepM: number;
  deltaMinVsYesterday: number;
  segs: SleepSeg[];
  windowH: number;
}

/** Build a sleep.* shape from the native sleep estimate. The native
 *  source is just "longest screen-off span overnight" — no sleep-stage
 *  data is available at all. We deliberately set deepH/deepM to -1 so
 *  the renderer can hide the 深睡 line instead of showing a fabricated
 *  number (the previous impl wrote `totalMin * 0.45`, which always
 *  disagreed with any wearable / Health Connect source — confusing,
 *  not informative). Segments are a single non-deep block. */
function mergeSleep(s: SleepSession): SleepData {
  const start = new Date(s.startTime);
  const end = new Date(s.endTime);
  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const totalMin = Math.max(0, s.durationMinutes);
  const totalH = Math.floor(totalMin / 60);
  const totalM = totalMin % 60;
  const windowH = Math.max(8.5, totalMin / 60 + 0.5);
  return {
    startHHMM: fmt(start),
    endHHMM: fmt(end),
    totalH,
    totalM,
    deepH: -1,
    deepM: -1,
    deltaMinVsYesterday: 0,
    segs: [{ o: 0, d: totalMin / 60, deep: false }],
    windowH,
  };
}

/** Sleep summary from Health Connect (band-recorded). If the band emits
 *  per-stage data, we surface deep-sleep minutes and split the segments
 *  bar into deep / non-deep blocks. If no stages, falls back to one
 *  block + -1 sentinel (renderer hides "深睡" line, same as estimate). */
function mergeHcSleep(s: SleepSummary): SleepData {
  const start = new Date(s.startDate);
  const end = new Date(s.endDate);
  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const totalMin = Math.max(0, s.durationMinutes);
  const totalH = Math.floor(totalMin / 60);
  const totalM = totalMin % 60;
  const windowH = Math.max(8.5, totalMin / 60 + 0.5);

  const hasStages = s.stages.length > 0;
  let deepH = -1;
  let deepM = -1;
  let segs: { o: number; d: number; deep: boolean; stage?: string }[] = [
    { o: 0, d: totalMin / 60, deep: false },
  ];
  if (hasStages) {
    const deepMin = s.totalsByStage.deep;
    deepH = Math.floor(deepMin / 60);
    deepM = deepMin % 60;
    // Build segments relative to the session start, in hours.
    const sessionStartMs = start.getTime();
    segs = s.stages.map((st) => {
      const o = (new Date(st.startDate).getTime() - sessionStartMs) / 3_600_000;
      const d = st.durationMinutes / 60;
      return {
        o: Math.max(0, o),
        d,
        deep: st.stage === 'deep',
        stage: st.stage,
      };
    });
  }

  return {
    startHHMM: fmt(start),
    endHHMM: fmt(end),
    totalH,
    totalM,
    deepH,
    deepM,
    deltaMinVsYesterday: 0,
    segs,
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
  /** HC 给的过去 7 天每天步数 (升序, 今天在末). 没接通 HC 则保持 null. */
  const [weeklySteps, setWeeklySteps] = useState<number[] | null>(null);
  const [liveSleep, setLiveSleep] = useState<SleepSession | null>(null);
  const [hcSleep, setHcSleep] = useState<SleepSummary | null>(null);
  const [sleepNeedsAuth, setSleepNeedsAuth] = useState(false);
  /** Health Connect 授权态. null = 还没问, true = 拿了 HC 读权限, false = 没拿
   *  (或者系统根本没装 HC). HC ready 时步数 / 睡眠都走 HC, 不再启动原生
   *  TYPE_STEP_COUNTER + SleepEstimate. */
  const [hcReady, setHcReady] = useState<boolean | null>(null);
  /** 今日心率: HC 直接读。null = 还没接通 / 没数据。 */
  const [hr, setHr] = useState<{
    latest: number | null;
    min: number | null;
    max: number | null;
    series: number[];
  }>({ latest: null, min: null, max: null, series: [] });
  const [periodSheet, setPeriodSheet] = useState(false);

  // Real period entries — when the user has logged at least one cycle,
  // we render that instead of the demo period card.
  const periodEntries = useLiveQuery(
    () => db.periodEntries.orderBy('startDate').toArray(),
    [],
    [],
  );
  const hasRealPeriod = (periodEntries ?? []).length > 0;

  const weightEntries = useLiveQuery(
    () => db.weightEntries.orderBy('date').toArray(),
    [],
    [],
  );

  // Probe Health Connect authorization on first mount. HC ready (read
  // grant for steps/sleep) → it's the data source. Otherwise we fall
  // through to the native plugins (TYPE_STEP_COUNTER + UsageEvents
  // sleep estimate) so we still have *something* on a fresh install
  // where the user hasn't connected HC yet.
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') {
      setHcReady(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const avail = await isHealthAvailable();
      if (!avail) {
        if (!cancelled) setHcReady(false);
        return;
      }
      const ok = await checkHealthAuth();
      if (!cancelled) setHcReady(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── HC data pull ──────────────────────────────────────────────────
  // Pulled out as a callback so it can fire from visibilitychange / focus
  // listeners AND from the manual pull-to-refresh gesture below. Always
  // re-fetches everything HC has — small batches, fast.
  const pullHc = useCallback(async () => {
    if (Capacitor.getPlatform() !== 'android') return;
    const [today, week, sleep, hrSummary, hrSeries] = await Promise.all([
      getTodaySteps(),
      getWeeklySteps(),
      getLastNightSleep(),
      getTodayHeartRate(),
      getTodayHeartRateSeries(),
    ]);
    setLiveSteps(Math.round(today));
    if (week.length === 7) setWeeklySteps(week.map((d) => d.steps));
    if (sleep) setHcSleep(sleep);
    setHr({
      latest: hrSummary.latest,
      min: hrSummary.min,
      max: hrSummary.max,
      series: hrSeries,
    });
  }, []);

  // When HC is authorized: pull today's steps + last 7-day daily totals
  // + last night's sleep + heart rate. Refresh on visibility so
  // backgrounding then returning gives fresh numbers (small bands write
  // to HC in batches).
  useEffect(() => {
    if (hcReady !== true) return;
    void pullHc();
    function onVis() {
      if (document.visibilityState === 'visible') void pullHc();
    }
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [hcReady, pullHc]);

  // ─── Native fallback path ──────────────────────────────────────────
  // Only used when HC isn't connected. Once user grants HC we tear
  // down the sensor listener.
  useEffect(() => {
    if (hcReady !== false) return;
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
        // Permission denied / no sensor — leave demo number.
      }
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [hcReady]);

  // Sleep — also native fallback path. SleepEstimatePlugin reads the
  // screen-off span via UsageEvents and is "estimate, not real".
  useEffect(() => {
    if (hcReady !== false) return;
    if (Capacitor.getPlatform() !== 'android') return;
    let cancelled = false;
    async function refresh() {
      try {
        const perm = await Sleep.hasPermission();
        if (!perm.granted) {
          if (!cancelled) setSleepNeedsAuth(true);
          return;
        }
        if (!cancelled) setSleepNeedsAuth(false);
        const r = await Sleep.getLastSleep();
        if (!cancelled && r.session) setLiveSleep(r.session);
      } catch {
        // ignore
      }
    }
    void refresh();
    function onVis() {
      if (document.visibilityState === 'visible') void refresh();
    }
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [hcReady]);

  async function handleConnectHc() {
    const ok = await requestHealthPermissions();
    setHcReady(ok);
  }

  // ─── Pull-to-refresh ──────────────────────────────────────────────
  // Touch handlers on the scroll container. Detect a downward drag
  // while at scrollTop=0, show a small "正在同步…" indicator, and call
  // pullHc when the user crosses the trigger threshold + releases.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const PULL_TRIGGER = 70;
  const PULL_CAP = 100;

  function onTouchStart(e: React.TouchEvent) {
    if (refreshing) return;
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0) {
      touchStartY.current = null;
      return;
    }
    touchStartY.current = e.touches[0].clientY;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (touchStartY.current === null) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy <= 0) {
      setPullPx(0);
      return;
    }
    // Rubber-band: scale beyond half the cap to ease the drag.
    const eased = dy <= PULL_CAP ? dy * 0.55 : PULL_CAP * 0.55;
    setPullPx(eased);
  }
  async function onTouchEnd() {
    if (touchStartY.current === null) return;
    touchStartY.current = null;
    if (pullPx >= PULL_TRIGGER * 0.5) {
      setRefreshing(true);
      setPullPx(36);
      try {
        await pullHc();
      } catch {
        // pullHc is already noisy on the console — swallow here.
      }
      setRefreshing(false);
      setPullPx(0);
    } else {
      setPullPx(0);
    }
  }

  async function handleConnectSleep() {
    try {
      await Sleep.requestPermission();
      // The user comes back from system Settings; the focus listener
      // above will re-poll on its own, but try once eagerly too.
      const perm = await Sleep.hasPermission();
      if (perm.granted) {
        setSleepNeedsAuth(false);
        const r = await Sleep.getLastSleep();
        if (r.session) setLiveSleep(r.session);
      }
    } catch {
      // ignore
    }
  }

  // Merge live data into the demo skeleton. Source priority for sleep:
  // HC (real, may include stages) > native estimate > DEMO. For steps:
  // HC weekly array > DEMO week. liveSteps already coalesces today.
  const mergedSleep = hcSleep
    ? mergeHcSleep(hcSleep)
    : liveSleep
      ? mergeSleep(liveSleep)
      : DEMO.sleep;
  const data = filled
    ? {
        ...DEMO,
        steps: {
          ...DEMO.steps,
          today: liveSteps !== null ? liveSteps : DEMO.steps.today,
          week: weeklySteps ?? DEMO.steps.week,
        },
        sleep: mergedSleep,
      }
    : null;

  return (
    <div
      ref={scrollRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
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
      {/* Pull-to-refresh indicator */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: pullPx,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          color: 'var(--text-3)',
          letterSpacing: 1,
          pointerEvents: 'none',
          transition: refreshing ? 'none' : 'height 0.2s',
          overflow: 'hidden',
        }}
      >
        {pullPx > 0 && (
          <span>
            {refreshing
              ? '同步中…'
              : pullPx >= PULL_TRIGGER * 0.5
                ? '松开同步'
                : '下拉同步'}
          </span>
        )}
      </div>
      <div
        style={{
          transform: `translateY(${pullPx}px)`,
          transition: refreshing ? 'none' : 'transform 0.2s',
          willChange: 'transform',
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

        {/* HC connection prompt / preview toggle */}
        {hcReady === false && Capacitor.getPlatform() === 'android' ? (
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
              <strong style={{ color: 'var(--text-2)', fontWeight: 500 }}>
                连接 Health Connect
              </strong>
              <span style={{ marginLeft: 8 }}>
                授权后步数 / 心率 / 睡眠 / 体重从手环走 HC 同步
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleConnectHc()}
              className="btn-ghost"
              style={{ flexShrink: 0, fontSize: 12, padding: '4px 12px' }}
            >
              连接
            </button>
          </div>
        ) : (
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
              <strong style={{ color: 'var(--text-2)', fontWeight: 500 }}>
                {hcReady ? '已连接 Health Connect' : '预览模式'}
              </strong>
              <span style={{ marginLeft: 8 }}>
                {hcReady
                  ? '步数 / 睡眠走手环实时数据'
                  : '真实数据要等接入 Health Connect / 手动日志后才会有'}
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
        )}

        {data ? (
          <div className="wis-health-cards">
            <StepsCard data={data.steps} />
            <HeartRateCard data={hr} hcReady={hcReady === true} />
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
              data={
                (weightEntries ?? []).length > 0
                  ? mergeWeight(weightEntries ?? [])
                  : data.weight
              }
              draft={weightDraft}
              onDraftChange={setWeightDraft}
              onSave={async () => {
                const v = parseFloat(weightDraft);
                if (!isFinite(v) || v <= 0 || v > 500) return;
                await addWeight(v);
                setWeightDraft('');
              }}
            />
          </div>
        ) : (
          <EmptyHealth />
        )}

        <button
          type="button"
          onClick={() => navigate('/screen-time')}
          style={{
            marginTop: 20,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 18px',
            background:
              'linear-gradient(135deg, rgba(212,229,238,0.85), rgba(191,213,228,0.85))',
            border: '1px solid rgba(31,58,74,0.08)',
            borderRadius: 16,
            cursor: 'pointer',
            fontFamily: "'Noto Sans SC', sans-serif",
            color: 'rgba(31,58,74,0.85)',
            boxShadow: '0 1px 6px rgba(31,58,74,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(255,255,255,0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(31,58,74,0.7)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect
                  x="5"
                  y="3"
                  width="14"
                  height="18"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <circle cx="12" cy="18" r="0.8" fill="currentColor" />
              </svg>
            </span>
            <div style={{ textAlign: 'left' }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  letterSpacing: 1,
                }}
              >
                屏幕使用时间
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'rgba(31,58,74,0.55)',
                  marginTop: 2,
                  fontStyle: 'italic',
                  fontFamily: "'Cormorant Garamond', serif",
                }}
              >
                今天用了多久 / 谁占的时间最多
              </div>
            </div>
          </div>
          <span style={{ color: 'rgba(31,58,74,0.4)', fontSize: 14 }}>→</span>
        </button>
      </div>

      {periodSheet && (
        <PeriodSheet
          entries={periodEntries ?? []}
          onClose={() => setPeriodSheet(false)}
        />
      )}
      </div>{/* /pull translate wrapper */}
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

function HeartRateCard({
  data,
  hcReady,
}: {
  data: {
    latest: number | null;
    min: number | null;
    max: number | null;
    series: number[];
  };
  hcReady: boolean;
}) {
  const empty = data.latest === null;
  return (
    <div className="wis-hcard">
      <div className="wis-hcard-head">
        <span className="wis-hcard-ic">
          <Activity size={16} strokeWidth={1.7} />
        </span>
        <span className="wis-hcard-label">心率</span>
        <span className="wis-hcard-aside">
          {empty ? (hcReady ? '今日暂无' : '需连接 HC') : 'BPM'}
        </span>
      </div>
      <div className="wis-steps-row">
        <div
          style={{
            flexShrink: 0,
            width: 96,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontSize: 34,
              fontWeight: 500,
              color: 'var(--head)',
              lineHeight: 1,
              letterSpacing: -1,
            }}
          >
            {empty ? '—' : data.latest}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
            最新
          </div>
        </div>
        <div className="wis-steps-side">
          <div className="wis-steps-goal">
            {empty ? (
              <span>戴上手环测一次就有了</span>
            ) : (
              <>
                范围 <b>{data.min}</b> – <b>{data.max}</b> BPM
              </>
            )}
          </div>
          {data.series.length >= 2 && (
            <div className="wis-spark" style={{ marginTop: 8 }}>
              <Sparkline data={data.series} h={40} />
            </div>
          )}
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
  data: SleepData;
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
            开启用量访问
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
            {data.segs.map((s, i) => {
              // 4-color stage palette (per brief): deep / light / rem / awake.
              // Falls back to the binary deep/light coloring when stage isn't
              // available (native estimate or band w/o stage data).
              const fill = s.stage
                ? s.stage === 'deep'
                  ? '#4a2d7a'
                  : s.stage === 'light'
                    ? '#9b7cc5'
                    : s.stage === 'rem'
                      ? '#b8cce8'
                      : '#e8e4ef'
                : s.deep
                  ? 'var(--lav-600)'
                  : 'var(--lav-300)';
              const isFullHeight = s.stage === 'deep' || s.deep;
              return (
                <rect
                  key={i}
                  x={(s.o / data.windowH) * 340}
                  y={isFullHeight ? 0 : 4}
                  width={Math.max(0, (s.d / data.windowH) * 340 - 2)}
                  height={isFullHeight ? 18 : 10}
                  rx="3"
                  fill={fill}
                />
              );
            })}
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
          {data.deepH >= 0 ? (
            <>
              深睡 {data.deepH} 时 {data.deepM} 分 ·{' '}
            </>
          ) : (
            <>估算·熄屏时长 · </>
          )}
          较昨日 {data.deltaMinVsYesterday >= 0 ? '+' : ''}
          {data.deltaMinVsYesterday} 分
        </span>
      </div>
      <div className="wis-legend">
        {data.segs.some((s) => s.stage) ? (
          <>
            <span>
              <i style={{ background: '#4a2d7a' }} />
              深睡
            </span>
            <span>
              <i style={{ background: '#9b7cc5' }} />
              浅睡
            </span>
            <span>
              <i style={{ background: '#b8cce8' }} />
              REM
            </span>
            <span>
              <i style={{ background: '#e8e4ef' }} />
              清醒
            </span>
          </>
        ) : data.deepH >= 0 ? (
          <>
            <span>
              <i style={{ background: 'var(--lav-600)' }} />
              深睡
            </span>
            <span>
              <i style={{ background: 'var(--lav-300)' }} />
              浅睡
            </span>
          </>
        ) : (
          <span style={{ opacity: 0.7 }}>
            <i style={{ background: 'var(--lav-300)' }} />
            没有分期数据
          </span>
        )}
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
  onSave,
}: {
  data: typeof DEMO.weight;
  draft: string;
  onDraftChange: (v: string) => void;
  onSave: () => void | Promise<void>;
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
          onClick={() => void onSave()}
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
  // Min 3% arc so the ring never reads as fully empty even at 0 steps
  // (Anti-loneliness 强制保留一小段紫色, 跟 brief 一致). 0 步走到达
  // 目标都会被 clamp 到 [0.03, 1.0] 之间.
  const pct = Math.min(1, Math.max(0.03, value / Math.max(1, max)));
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
