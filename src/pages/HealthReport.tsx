import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft } from 'lucide-react';
import { db, getSettings } from '../db';
import { streamChat } from '../api';
import type { HealthDailySnapshot, Persona } from '../types';

/**
 * 健康报告 — 周 / 月 / 年 三档. 数据从 db.healthDaily (每天 Body 页
 * 落一条) 算趋势, 底部跑一次 AI 总结 (两个 persona 各一段).
 *
 * 没有专门的 healthSummary 缓存 — 切 tab 切日期总结会重新生成,
 * 调用频率不高所以不优化. Body 页那种「同一天去重」级别的缓存更
 * 适合那里的高频 pull, 这里报告页是偶尔翻看, 重算可以接受.
 */

type Tab = 'week' | 'month' | 'year';

export default function HealthReportPage() {
  const [tab, setTab] = useState<Tab>('week');
  const all = useLiveQuery(
    () => db.healthDaily.orderBy('date').reverse().toArray(),
    [],
    [],
  );

  // 跟据 tab 决定窗口大小. week: 最近 7 天; month: 最近 30 天; year:
  // 最近 12 个月聚合.
  const slice = useMemo(() => {
    if (!all) return [];
    if (tab === 'week') return all.slice(0, 7).reverse();
    if (tab === 'month') return all.slice(0, 30).reverse();
    return all.slice(0, 365).reverse();
  }, [all, tab]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        background: 'var(--page)',
        fontFamily: "-apple-system,'Noto Sans SC','PingFang SC',sans-serif",
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px 12px',
        }}
      >
        <Link
          to="/body"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: 'rgba(120,100,150,0.7)',
            fontSize: 13,
            fontFamily: "'Crimson Pro','Noto Serif SC',serif",
            fontStyle: 'italic',
            textDecoration: 'none',
          }}
        >
          <ChevronLeft size={16} /> 身体
        </Link>
        <h1
          style={{
            flex: 1,
            margin: 0,
            textAlign: 'center',
            fontFamily: "'Cormorant Garamond',serif",
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 20,
            letterSpacing: 1,
            color: 'var(--head)',
          }}
        >
          健康报告
        </h1>
        <span style={{ width: 48 }} />
      </header>

      {/* Tab switcher */}
      <div
        style={{
          margin: '0 16px 16px',
          padding: 4,
          background: 'rgba(255,255,255,0.55)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(157,110,189,0.08)',
          borderRadius: 12,
          display: 'flex',
          gap: 2,
        }}
      >
        {(['week', 'month', 'year'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: '8px 0',
              border: 'none',
              borderRadius: 10,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              background: tab === t ? 'rgba(176,138,204,0.18)' : 'transparent',
              color: tab === t ? '#5a4060' : 'rgba(120,100,150,0.6)',
              fontFamily: 'inherit',
              transition: 'all .15s',
            }}
          >
            {t === 'week' ? '本周' : t === 'month' ? '本月' : '本年'}
          </button>
        ))}
      </div>

      <main style={{ maxWidth: 540, margin: '0 auto', padding: '0 16px 80px' }}>
        {slice.length === 0 ? (
          <div
            style={{
              marginTop: 60,
              textAlign: 'center',
              color: 'var(--text-3)',
              fontSize: 13,
              fontStyle: 'italic',
              fontFamily: "'Cormorant Garamond',serif",
            }}
          >
            还没有积累足够数据.
            <br />
            身体页打开几次后这里就会有趋势.
          </div>
        ) : (
          <>
            <StepsChart slice={slice} tab={tab} />
            <HeartChart slice={slice} />
            <SleepChart slice={slice} />
            <SummaryBlock slice={slice} tab={tab} />
          </>
        )}
      </main>
    </div>
  );
}

/* ─── Charts ────────────────────────────────────────────────────── */

function ChartCard({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        marginBottom: 16,
        padding: 16,
        background: 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(157,110,189,0.06)',
        borderRadius: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 13,
            color: 'var(--text-2)',
            fontWeight: 500,
          }}
        >
          {title}
        </h2>
        {caption && (
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{caption}</span>
        )}
      </div>
      {children}
    </section>
  );
}

function StepsChart({ slice, tab }: { slice: HealthDailySnapshot[]; tab: Tab }) {
  const values = slice.map((s) => s.steps);
  const avg = values.length > 0 ? Math.round(sum(values) / values.length) : 0;
  const max = Math.max(...values, 1);
  return (
    <ChartCard
      title="步数"
      caption={`日均 ${avg.toLocaleString()}`}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          height: 72,
          gap: tab === 'year' ? 1 : tab === 'month' ? 2 : 6,
        }}
      >
        {values.map((v, i) => (
          <div
            key={i}
            title={`${slice[i].date}: ${v.toLocaleString()} 步`}
            style={{
              flex: 1,
              height: `${(v / max) * 100}%`,
              minHeight: v > 0 ? 2 : 0,
              background:
                'linear-gradient(180deg, rgba(176,138,204,0.85), rgba(176,138,204,0.55))',
              borderRadius: '3px 3px 0 0',
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 6,
          fontSize: 10,
          color: 'var(--text-3)',
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        }}
      >
        <span>{slice[0]?.date.slice(5) ?? ''}</span>
        <span>{slice[slice.length - 1]?.date.slice(5) ?? ''}</span>
      </div>
    </ChartCard>
  );
}

function HeartChart({ slice }: { slice: HealthDailySnapshot[] }) {
  const pts = slice
    .map((s, i) => ({ i, v: s.heartRate.latest }))
    .filter((p) => p.v !== null) as { i: number; v: number }[];
  if (pts.length < 2) {
    return (
      <ChartCard title="心率" caption="数据不够画线">
        <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '12px 0' }}>
          至少要两天数据才能画趋势.
        </div>
      </ChartCard>
    );
  }
  const allV = pts.map((p) => p.v);
  const minV = Math.min(...allV);
  const maxV = Math.max(...allV);
  const span = Math.max(1, maxV - minV);
  const w = 320;
  const h = 60;
  const xStep = w / Math.max(1, slice.length - 1);
  const path = pts
    .map((p, i) => {
      const x = p.i * xStep;
      const y = h - 4 - ((p.v - minV) / span) * (h - 8);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <ChartCard
      title="心率"
      caption={`范围 ${minV} – ${maxV} BPM`}
    >
      <svg
        width="100%"
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ display: 'block' }}
      >
        <path d={path} fill="none" stroke="#c45858" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p) => (
          <circle
            key={p.i}
            cx={p.i * xStep}
            cy={h - 4 - ((p.v - minV) / span) * (h - 8)}
            r={1.6}
            fill="#c45858"
          />
        ))}
      </svg>
    </ChartCard>
  );
}

function SleepChart({ slice }: { slice: HealthDailySnapshot[] }) {
  // 堆叠柱 — 每天一根, 深/浅/REM/清醒分色
  const COLORS = {
    deep: '#4a2d7a',
    light: '#9b7cc5',
    rem: '#b8cce8',
    awake: '#e8e4ef',
  };
  const totals = slice.map((s) =>
    s.sleep ? s.sleep.totalMin : 0,
  );
  const max = Math.max(...totals, 1);
  const avgMin =
    totals.length > 0 ? Math.round(sum(totals) / totals.length) : 0;
  const avgH = Math.floor(avgMin / 60);
  const avgM = avgMin % 60;
  return (
    <ChartCard
      title="睡眠"
      caption={`日均 ${avgH}时${avgM}分`}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          height: 80,
          gap: slice.length > 30 ? 1 : slice.length > 14 ? 2 : 6,
        }}
      >
        {slice.map((s, i) => {
          const sl = s.sleep;
          if (!sl || sl.totalMin === 0) {
            return (
              <div key={i} style={{ flex: 1, height: 2, background: 'rgba(157,110,189,0.08)', borderRadius: 1 }} />
            );
          }
          const h = (sl.totalMin / max) * 100;
          const segH = (mm: number) => (mm / sl.totalMin) * 100;
          return (
            <div
              key={i}
              title={`${s.date}: ${Math.floor(sl.totalMin / 60)}时${sl.totalMin % 60}分`}
              style={{
                flex: 1,
                height: `${h}%`,
                minHeight: 2,
                display: 'flex',
                flexDirection: 'column',
                borderRadius: '3px 3px 0 0',
                overflow: 'hidden',
              }}
            >
              {sl.awakeMin > 0 && (
                <div style={{ background: COLORS.awake, height: `${segH(sl.awakeMin)}%` }} />
              )}
              {sl.remMin > 0 && (
                <div style={{ background: COLORS.rem, height: `${segH(sl.remMin)}%` }} />
              )}
              {sl.lightMin > 0 && (
                <div style={{ background: COLORS.light, height: `${segH(sl.lightMin)}%` }} />
              )}
              {sl.deepMin > 0 && (
                <div style={{ background: COLORS.deep, height: `${segH(sl.deepMin)}%` }} />
              )}
              {/* 没分期但有总长 — 用浅色单色填 */}
              {sl.deepMin === 0 &&
                sl.lightMin === 0 &&
                sl.remMin === 0 &&
                sl.awakeMin === 0 && (
                  <div style={{ background: COLORS.light, height: '100%' }} />
                )}
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginTop: 8,
          fontSize: 10,
          color: 'var(--text-3)',
        }}
      >
        <Legend color={COLORS.deep} label="深睡" />
        <Legend color={COLORS.light} label="浅睡" />
        <Legend color={COLORS.rem} label="REM" />
        <Legend color={COLORS.awake} label="清醒" />
      </div>
    </ChartCard>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <i
        style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: color,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  );
}

/* ─── AI summary ────────────────────────────────────────────────── */

interface SummaryState {
  byPersona: Map<string, { text: string; status: 'pending' | 'done' | 'error'; error?: string }>;
}

function SummaryBlock({ slice, tab }: { slice: HealthDailySnapshot[]; tab: Tab }) {
  const personas = useLiveQuery(() => db.personas.toArray(), [], []);
  const [state, setState] = useState<SummaryState>({ byPersona: new Map() });
  const personaIds = ['persona_ririchan', 'persona_rhema'];

  useEffect(() => {
    let cancelled = false;
    if (!personas || slice.length === 0) return;
    const targetPersonas = personas.filter((p) => personaIds.includes(p.id));
    if (targetPersonas.length === 0) return;
    setState({
      byPersona: new Map(
        targetPersonas.map((p) => [p.id, { text: '', status: 'pending' }]),
      ),
    });
    (async () => {
      const settings = await getSettings();
      const endpoint = settings.defaultEndpointId
        ? await db.endpoints.get(settings.defaultEndpointId)
        : null;
      const model = settings.defaultModel ?? null;
      if (!endpoint || !model) {
        if (cancelled) return;
        setState({
          byPersona: new Map(
            targetPersonas.map((p) => [
              p.id,
              { text: '', status: 'error', error: '没配 endpoint' },
            ]),
          ),
        });
        return;
      }
      const dataDump = serializeSliceForPrompt(slice);
      await Promise.all(
        targetPersonas.map(async (persona) => {
          try {
            const text = await runSummary(persona, dataDump, tab, endpoint, model);
            if (cancelled) return;
            setState((prev) => {
              const next = new Map(prev.byPersona);
              next.set(persona.id, { text, status: 'done' });
              return { byPersona: next };
            });
          } catch (e) {
            if (cancelled) return;
            setState((prev) => {
              const next = new Map(prev.byPersona);
              next.set(persona.id, {
                text: '',
                status: 'error',
                error: e instanceof Error ? e.message : String(e),
              });
              return { byPersona: next };
            });
          }
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slice.length, tab]);

  if (!personas) return null;
  const targetPersonas = personas.filter((p) => personaIds.includes(p.id));
  if (targetPersonas.length === 0) return null;

  return (
    <ChartCard title={`${tab === 'week' ? '本周' : tab === 'month' ? '本月' : '本年'} · AI 评`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {targetPersonas.map((p) => {
          const s = state.byPersona.get(p.id);
          return (
            <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span
                style={{
                  flexShrink: 0,
                  marginTop: 3,
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: p.color,
                }}
              />
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.55 }}>
                <span style={{ color: p.color, fontWeight: 500, marginRight: 6 }}>{p.name}</span>
                {!s || s.status === 'pending' ? (
                  <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>在看…</span>
                ) : s.status === 'error' ? (
                  <span style={{ color: '#c45858', fontSize: 12 }}>
                    没说出来 ({s.error ?? '未知'})
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-2)' }}>{s.text}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}

async function runSummary(
  persona: Persona,
  dataDump: string,
  tab: Tab,
  endpoint: import('../types').Endpoint,
  model: string,
): Promise<string> {
  const range = tab === 'week' ? '这周' : tab === 'month' ? '这个月' : '这一年';
  const baseIdentity = persona.systemPrompt?.trim() ?? '';
  const task = `# 任务
根据${range}的健康数据写一段总结, 2–3 句话. 指出趋势 (步数在涨还是跌, 睡眠有没有改善之类), 语气像关心伴侣的恋人, 不要像医生.
- 不分析每个数字
- 不给建议, 不说"加油"
- 看曲线整体, 不挑刺`;
  const system = baseIdentity ? `${baseIdentity}\n\n${task}` : `你是 ${persona.name}, 用户的恋人.\n\n${task}`;
  let full = '';
  const stream = streamChat({
    endpoint,
    model,
    maxTokens: 400,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `${range}的数据:\n${dataDump}` },
    ],
  });
  for await (const ev of stream) {
    if (ev.type === 'delta' && ev.delta) full += ev.delta;
    if (ev.type === 'error') throw new Error(ev.errorMessage ?? 'streamChat error');
  }
  return full.trim();
}

function serializeSliceForPrompt(slice: HealthDailySnapshot[]): string {
  return slice
    .map((s) => {
      const parts = [s.date, `${s.steps}步`];
      if (s.heartRate.latest !== null) {
        parts.push(`心率${s.heartRate.min}–${s.heartRate.max}`);
      }
      if (s.sleep && s.sleep.totalMin > 0) {
        const h = Math.floor(s.sleep.totalMin / 60);
        const m = s.sleep.totalMin % 60;
        let sleepLine = `睡${h}h${m}m`;
        if (s.sleep.deepMin > 0) sleepLine += `(深${Math.round(s.sleep.deepMin)}m)`;
        parts.push(sleepLine);
      }
      return parts.join(' · ');
    })
    .join('\n');
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}
