import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';

/**
 * Billing — 极简日配额视图.
 *
 * 几何海面 = 今日花费 / 每日配给 的水位线. 沙滩淹没 = 今天没钱了.
 *
 * 设置页四个输入: 工资 / 储蓄 / 房租 / 今日已花. dailyBudget =
 * (工资 − 储蓄 − 房租) / 当月天数. 财务面三项存 localStorage.
 *
 * spent 来源是两合: Dexie 自动汇总今日 expense 总和作为 baseline,
 * 设置页里手动改的话写一个 "今日 override", 第二天 0:00 自动失效
 * 回到 Dexie auto.
 *
 * 性能: 没有 SVG filter (feGaussianBlur 在数千 circle 上是性能毒
 * 药). sparkle 只用 opacity animation, will-change: opacity 让 GPU
 * 接管. sparkle 总数约 2500 个.
 */

const COLS = 10;
const ROWS = 15;
const W = 400;
const H = 700;
const JITTER = 0.55;

const FIN_KEY = 'wisteria-budget-finance';
const OVERRIDE_KEY = 'wisteria-budget-spent-override';

interface FinanceConfig {
  salary: number;
  savings: number;
  rent: number;
}
const DEFAULT_FIN: FinanceConfig = { salary: 5000, savings: 1000, rent: 1500 };

interface SpentOverride {
  value: number;
  date: string; // YYYY-MM-DD
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadFinance(): FinanceConfig {
  try {
    const raw = localStorage.getItem(FIN_KEY);
    if (!raw) return { ...DEFAULT_FIN };
    const parsed = JSON.parse(raw) as Partial<FinanceConfig>;
    return {
      salary: Number(parsed.salary) || DEFAULT_FIN.salary,
      savings: Number(parsed.savings) || 0,
      rent: Number(parsed.rent) || 0,
    };
  } catch {
    return { ...DEFAULT_FIN };
  }
}

function loadOverrideIfFresh(): SpentOverride | null {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SpentOverride;
    if (parsed.date !== todayStr()) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface Pt {
  x: number;
  y: number;
}
interface Sparkle {
  x: number;
  y: number;
  delay: number;
  dur: number;
  size: number;
}
interface Triangle {
  id: number;
  points: string;
  cx: number;
  cy: number;
  depth: number;
  hueShift: number;
  lightShift: number;
  sparkles: Sparkle[];
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function buildMesh(seed: number): Triangle[] {
  const rand = seededRandom(seed);
  const cw = W / COLS;
  const ch = H / ROWS;
  const pts: Pt[] = [];

  for (let r = 0; r <= ROWS; r++) {
    for (let c = 0; c <= COLS; c++) {
      const edge = r === 0 || r === ROWS || c === 0 || c === COLS;
      pts.push({
        x: c * cw + (edge ? 0 : (rand() - 0.5) * cw * JITTER),
        y: r * ch + (edge ? 0 : (rand() - 0.5) * ch * JITTER),
      });
    }
  }

  const tris: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tl = r * (COLS + 1) + c;
      const tr = tl + 1;
      const bl = tl + (COLS + 1);
      const br = bl + 1;
      if (rand() > 0.5) {
        tris.push([tl, tr, bl]);
        tris.push([tr, br, bl]);
      } else {
        tris.push([tl, tr, br]);
        tris.push([tl, br, bl]);
      }
    }
  }

  return tris.map((idxs, i) => {
    const vs = idxs.map((j) => pts[j]);
    const cx = (vs[0].x + vs[1].x + vs[2].x) / 3;
    const cy = (vs[0].y + vs[1].y + vs[2].y) / 3;
    const depth = (cx / W + (1 - cy / H)) / 2 + (rand() - 0.5) * 0.12;

    // v5 sparkle count: 10..16 per triangle (was 16..26)
    const sparkles: Sparkle[] = Array.from(
      { length: 10 + Math.floor(rand() * 6) },
      () => {
        const a = rand(),
          b = rand();
        const s = a + b > 1 ? { a: 1 - a, b: 1 - b } : { a, b };
        return {
          x: vs[0].x + s.a * (vs[1].x - vs[0].x) + s.b * (vs[2].x - vs[0].x),
          y: vs[0].y + s.a * (vs[1].y - vs[0].y) + s.b * (vs[2].y - vs[0].y),
          delay: rand() * 16,
          dur: 0.8 + rand() * 3.7,
          size: 0.4 + rand() * 0.9,
        };
      },
    );

    return {
      id: i,
      points: vs.map((v) => `${v.x},${v.y}`).join(' '),
      cx,
      cy,
      depth,
      hueShift: rand() * 14 - 7,
      lightShift: rand() * 5 - 2.5,
      sparkles,
    };
  });
}

function GeoSea({ ratio, mesh }: { ratio: number; mesh: Triangle[] }) {
  const waterLine = 1 - Math.min(ratio, 1.15) * 0.95;
  const isDrowned = ratio >= 0.95;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      {mesh.map((tri) => {
        const isSea = tri.depth > waterLine;
        const nearEdge = Math.abs(tri.depth - waterLine) < 0.06;

        let fill: string;
        if (isSea) {
          const d = Math.min(
            (tri.depth - waterLine) / Math.max(1 - waterLine, 0.01),
            1,
          );
          const h = 205 + tri.hueShift;
          const s = isDrowned ? 25 + d * 15 : 30 + d * 20;
          const l = isDrowned
            ? 72 + d * 8 + tri.lightShift
            : 78 - d * 12 + tri.lightShift;
          fill = `hsl(${h}, ${s}%, ${Math.max(60, Math.min(92, l))}%)`;
        } else {
          const d = Math.min(
            (waterLine - tri.depth) / Math.max(waterLine, 0.01),
            1,
          );
          const h = 275 + tri.hueShift * 0.4;
          const s = 18 + d * 8;
          const l = 88 + d * 4 + tri.lightShift * 0.3;
          fill = `hsl(${h}, ${s}%, ${Math.max(85, Math.min(96, l))}%)`;
        }

        return (
          <polygon
            key={tri.id}
            points={tri.points}
            fill={fill}
            stroke={
              nearEdge && !isDrowned
                ? 'rgba(200,210,235,0.5)'
                : isSea
                  ? 'rgba(190,215,240,0.15)'
                  : 'rgba(220,210,235,0.12)'
            }
            strokeWidth={nearEdge ? 1 : 0.4}
            style={{ transition: 'fill 0.7s ease' }}
          />
        );
      })}

      {/* main sparkle layer */}
      {mesh
        .filter((tri) => tri.depth <= waterLine + 0.02)
        .flatMap((tri) =>
          tri.sparkles.map((sp, si) => (
            <circle
              key={`s${tri.id}-${si}`}
              cx={sp.x}
              cy={sp.y}
              r={sp.size}
              fill="white"
              opacity={0}
              style={{
                willChange: 'opacity',
                animation: `shimmerDot ${sp.dur}s ${sp.delay}s ease-in-out infinite`,
              }}
            />
          )),
        )}

      {/* accent sparkles — 30 only */}
      {!isDrowned &&
        mesh
          .filter((tri) => tri.depth < waterLine - 0.03)
          .slice(0, 30)
          .map((tri) => (
            <circle
              key={`b-${tri.id}`}
              cx={tri.cx + tri.hueShift}
              cy={tri.cy + tri.lightShift * 2}
              r={1.0}
              fill="white"
              opacity={0}
              style={{
                willChange: 'opacity',
                animation: `shimmerAccent ${4.8 + tri.lightShift * 0.3}s ${tri.sparkles[0].delay}s ease-in-out infinite`,
              }}
            />
          ))}

      {/* dust layer — every 3rd of main reused */}
      {!isDrowned &&
        mesh
          .filter((tri) => tri.depth < waterLine)
          .flatMap((tri) =>
            tri.sparkles
              .filter((_, i) => i % 3 === 0)
              .map((sp, si) => (
                <circle
                  key={`d-${tri.id}-${si}`}
                  cx={sp.x + si * 1.2}
                  cy={sp.y - si * 0.6}
                  r={0.25 + sp.size * 0.2}
                  fill="white"
                  opacity={0}
                  style={{
                    willChange: 'opacity',
                    animation: `shimmerDust ${0.5 + sp.dur * 0.5}s ${sp.delay * 1.2}s ease-in-out infinite`,
                  }}
                />
              )),
          )}
    </svg>
  );
}

interface SettingsDraft {
  salary: string;
  savings: string;
  rent: string;
  spent: string;
}

function SettingsPage({
  finance,
  spentBaseline,
  onSave,
  onBack,
}: {
  finance: FinanceConfig;
  /** Today's spent value the main page is currently showing (Dexie sum or override). */
  spentBaseline: number;
  onSave: (
    finance: FinanceConfig,
    spentOverride: number | null,
  ) => void;
  onBack: () => void;
}) {
  const [vals, setVals] = useState<SettingsDraft>({
    salary: String(finance.salary),
    savings: String(finance.savings),
    rent: String(finance.rent),
    spent: String(spentBaseline),
  });
  const set = (k: keyof SettingsDraft, v: string) =>
    setVals((p) => ({ ...p, [k]: v }));

  const now = new Date();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const salary = Math.max(0, Number(vals.salary) || 0);
  const savings = Math.max(0, Number(vals.savings) || 0);
  const rent = Math.max(0, Number(vals.rent) || 0);
  const pool = Math.max(0, salary - savings - rent);
  const daily = Math.round(pool / daysInMonth);

  const save = () => {
    const editedSpent = Math.max(0, Number(vals.spent) || 0);
    // Only persist as override if user actually moved it off baseline.
    const override =
      editedSpent === Math.round(spentBaseline) ? null : editedSpent;
    onSave({ salary, savings, rent }, override);
    onBack();
  };

  const serif = "'Cormorant Garamond',serif";
  const fields: Array<{ key: keyof SettingsDraft; label: string }> = [
    { key: 'salary', label: '工资' },
    { key: 'savings', label: '储蓄' },
    { key: 'rent', label: '房租' },
    { key: 'spent', label: '今日已花' },
  ];

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100%',
        background: '#fbf9fd',
        fontFamily:
          "'Hiragino Sans','PingFang SC','Noto Sans SC',system-ui,sans-serif",
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300&display=swap');
        .min-input { border: none; outline: none; background: none; }
      `}</style>

      <div
        onClick={save}
        style={{
          padding: '52px 32px 0',
          color: 'rgba(160,140,180,0.35)',
          fontSize: 16,
          cursor: 'pointer',
          fontWeight: 200,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        ‹
      </div>

      <div
        style={{
          flex: 1,
          padding: '48px 36px',
          display: 'flex',
          flexDirection: 'column',
          gap: 40,
        }}
      >
        {fields.map((f) => (
          <div key={f.key}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: 3,
                color: 'rgba(140,120,170,0.35)',
                fontWeight: 300,
                marginBottom: 12,
              }}
            >
              {f.label}
            </div>
            <input
              type="number"
              className="min-input"
              value={vals[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              style={{
                width: '100%',
                fontSize: 36,
                fontWeight: 300,
                fontFamily: serif,
                color: 'rgba(80,60,110,0.7)',
                letterSpacing: -0.5,
                borderBottom: '1px solid rgba(200,185,220,0.15)',
                paddingBottom: 8,
              }}
            />
          </div>
        ))}
      </div>

      <div
        style={{
          padding: '28px 36px 60px',
          borderTop: '1px solid rgba(200,185,220,0.1)',
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: 3,
            color: 'rgba(140,120,170,0.3)',
            fontWeight: 300,
            marginBottom: 8,
          }}
        >
          每日配给
        </div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 300,
            fontFamily: serif,
            color: 'rgba(80,60,110,0.65)',
          }}
        >
          {daily}
        </div>
        <div
          style={{
            fontSize: 10,
            color: 'rgba(140,120,170,0.25)',
            marginTop: 6,
            fontWeight: 300,
          }}
        >
          ({salary} − {savings} − {rent}) ÷ {daysInMonth}
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const [page, setPage] = useState<'main' | 'settings'>('main');

  const [finance, setFinance] = useState<FinanceConfig>(loadFinance);
  const [override, setOverride] = useState<SpentOverride | null>(
    loadOverrideIfFresh,
  );

  // Dexie auto-sum: today's expense bills 总和.
  const dexieSpent = useLiveQuery(
    async () => {
      const now = new Date();
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      ).getTime();
      const end = start + 24 * 3600 * 1000;
      const rows = await db.bills
        .where('createdAt')
        .between(start, end, true, false)
        .toArray();
      return rows
        .filter((b) => (b.kind ?? 'expense') === 'expense')
        .reduce((sum, b) => sum + b.amount, 0);
    },
    [],
    0,
  );

  // Manual override beats Dexie auto-sum, but only for today.
  const spent =
    override && override.date === todayStr() ? override.value : dexieSpent;

  const now = new Date();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const pool = Math.max(0, finance.salary - finance.savings - finance.rent);
  const dailyBudget = Math.max(1, Math.round(pool / daysInMonth));

  const mesh = useMemo(() => buildMesh(42), []);
  const ratio = Math.min(spent / Math.max(dailyBudget, 1), 1.15);
  const remaining = Math.max(dailyBudget - spent, 0);
  const isDrowned = ratio >= 0.95;
  const isOver = spent > dailyBudget;

  function handleSave(
    nextFinance: FinanceConfig,
    nextOverride: number | null,
  ) {
    setFinance(nextFinance);
    localStorage.setItem(FIN_KEY, JSON.stringify(nextFinance));
    if (nextOverride === null) {
      setOverride(null);
      localStorage.removeItem(OVERRIDE_KEY);
    } else {
      const o: SpentOverride = { value: nextOverride, date: todayStr() };
      setOverride(o);
      localStorage.setItem(OVERRIDE_KEY, JSON.stringify(o));
    }
  }

  if (page === 'settings') {
    return (
      <SettingsPage
        finance={finance}
        spentBaseline={spent}
        onSave={handleSave}
        onBack={() => setPage('main')}
      />
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: isDrowned
          ? 'linear-gradient(180deg, #d0dff0 0%, #c0d5ea 100%)'
          : 'linear-gradient(180deg, #f5f0f8 0%, #efe8f4 100%)',
        transition: 'background 0.8s ease',
        fontFamily:
          "'Hiragino Sans','PingFang SC','Noto Sans SC',system-ui,sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300&display=swap');
        @keyframes shimmerDot {
          0%, 100% { opacity: 0; }
          3% { opacity: 1; }
          6% { opacity: 0; }
        }
        @keyframes shimmerAccent {
          0%, 100% { opacity: 0; }
          2% { opacity: 1; }
          5% { opacity: 0; }
        }
        @keyframes shimmerDust {
          0%, 100% { opacity: 0; }
          2% { opacity: 0.85; }
          4% { opacity: 0; }
        }
      `}</style>

      <div style={{ position: 'absolute', inset: 0 }}>
        <GeoSea ratio={ratio} mesh={mesh} />
      </div>

      <div
        onClick={() => setPage('settings')}
        style={{
          position: 'absolute',
          top: 48,
          right: 36,
          padding: '8px 12px',
          margin: '-8px -12px',
          fontSize: 42,
          fontWeight: 300,
          fontFamily: "'Cormorant Garamond',serif",
          letterSpacing: -0.5,
          lineHeight: 1,
          color: 'rgba(255,255,255,0.9)',
          textShadow: '0 1px 8px rgba(80,120,180,0.15)',
          cursor: 'pointer',
          userSelect: 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {isOver ? `−${spent - dailyBudget}` : remaining.toFixed(0)}
      </div>
    </div>
  );
}
