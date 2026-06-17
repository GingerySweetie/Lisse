import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';

/**
 * Billing — 极简日配额视图. 几何海面 = 今日花费 / 每日配给 比例.
 * 自动入账走通知监听 / 屏幕识别. 这里只显示「今日还剩多少」一个数.
 * 左下角隐形 tap zone 进设置改预算.
 */

const COLS = 10;
const ROWS = 15;
const W = 400;
const H = 700;
const JITTER = 0.55;

const BUDGET_KEY = 'wisteria-daily-budget';

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
  brightness: number;
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

    // depth: 0 at bottom-left, 1 at top-right
    const depth = (cx / W + (1 - cy / H)) / 2 + (rand() - 0.5) * 0.12;

    // fine sparkle points inside triangle
    const sparkles: Sparkle[] = Array.from(
      { length: 16 + Math.floor(rand() * 10) },
      () => {
        const a = rand(),
          b = rand();
        const s = a + b > 1 ? { a: 1 - a, b: 1 - b } : { a, b };
        return {
          x: vs[0].x + s.a * (vs[1].x - vs[0].x) + s.b * (vs[2].x - vs[0].x),
          y: vs[0].y + s.a * (vs[1].y - vs[0].y) + s.b * (vs[2].y - vs[0].y),
          delay: rand() * 16,
          dur: 0.8 + rand() * 3.7,
          size: 0.3 + rand() * 0.8,
          brightness: 1,
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
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      {mesh.map((tri) => {
        const isSea = tri.depth > waterLine;
        const edgeDist = Math.abs(tri.depth - waterLine);
        const nearEdge = edgeDist < 0.06;

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

        const stroke =
          nearEdge && !isDrowned
            ? 'rgba(200,210,235,0.5)'
            : isSea
              ? 'rgba(190,215,240,0.15)'
              : 'rgba(220,210,235,0.12)';

        return (
          <polygon
            key={tri.id}
            points={tri.points}
            fill={fill}
            stroke={stroke}
            strokeWidth={nearEdge ? 1 : 0.4}
            style={{ transition: 'fill 0.7s ease, stroke 0.5s ease' }}
          />
        );
      })}

      {/* fine sparkles on beach */}
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
                animation: `shimmerDot ${sp.dur}s ${sp.delay}s ease-in-out infinite`,
              }}
            />
          )),
        )}

      {/* extra bright sparkle accents */}
      {!isDrowned &&
        mesh
          .filter((tri) => tri.depth < waterLine - 0.03)
          .slice(0, 50)
          .map((tri) => (
            <circle
              key={`bright-${tri.id}`}
              cx={tri.cx + tri.hueShift}
              cy={tri.cy + tri.lightShift * 2}
              r={0.8}
              fill="white"
              opacity={0}
              style={{
                animation: `shimmerSharp 4.8s ${tri.sparkles[0].delay}s ease-in-out infinite`,
              }}
            />
          ))}

      {/* ultra-fine dust layer */}
      {!isDrowned &&
        mesh
          .filter((tri) => tri.depth < waterLine)
          .flatMap((tri) =>
            tri.sparkles
              .filter((_, i) => i % 2 === 0)
              .map((sp, si) => (
                <circle
                  key={`dust-${tri.id}-${si}`}
                  cx={sp.x + si * 1.5}
                  cy={sp.y - si * 0.8}
                  r={0.2 + sp.size * 0.25}
                  fill="white"
                  opacity={0}
                  style={{
                    animation: `shimmerDust ${0.4 + sp.dur * 0.5}s ${sp.delay * 1.2}s ease-in-out infinite`,
                  }}
                />
              )),
          )}
    </svg>
  );
}

function SettingsMesh({ seed }: { seed: number }) {
  const mesh = useMemo(() => buildMesh(seed), [seed]);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      {mesh.map((tri) => {
        const h = 275 + tri.hueShift * 0.4;
        const s = 18 + tri.depth * 10;
        const l = 89 + tri.lightShift * 0.3 + tri.depth * 3;
        return (
          <polygon
            key={tri.id}
            points={tri.points}
            fill={`hsl(${h}, ${s}%, ${Math.min(96, l)}%)`}
            stroke="rgba(220,210,235,0.1)"
            strokeWidth={0.4}
          />
        );
      })}
      {mesh.flatMap((tri) =>
        tri.sparkles.slice(0, 6).map((sp, si) => (
          <circle
            key={`ss-${tri.id}-${si}`}
            cx={sp.x}
            cy={sp.y}
            r={sp.size * 0.8}
            fill="white"
            opacity={0}
            style={{
              animation: `shimmerDot ${sp.dur * 1.3}s ${sp.delay}s ease-in-out infinite`,
            }}
          />
        )),
      )}
    </svg>
  );
}

function SettingsPage({
  budget,
  setBudget,
  onBack,
}: {
  budget: number;
  setBudget: (n: number) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState(String(budget));

  const save = () => {
    setBudget(Math.max(1, Number(draft) || 80));
    onBack();
  };

  const serifFont = "'Cormorant Garamond',serif";
  const sansFont =
    "'Hiragino Sans','PingFang SC','Noto Sans SC',system-ui,sans-serif";

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 420,
        margin: '0 auto',
        height: '100vh',
        overflow: 'hidden',
        fontFamily: sansFont,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300&display=swap');
        @keyframes shimmerDot {
          0%, 100% { opacity: 0; }
          3% { opacity: 1; }
          6% { opacity: 0; }
        }
        .settings-input:focus {
          border-color: rgba(180,165,210,0.4) !important;
          background: rgba(255,255,255,0.55) !important;
        }
      `}</style>

      {/* geo background */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <SettingsMesh seed={77} />
      </div>

      {/* content overlay */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '0 28px',
        }}
      >
        {/* back */}
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(130,110,170,0.5)',
            fontSize: 18,
            cursor: 'pointer',
            padding: '48px 0 0',
            alignSelf: 'flex-start',
            fontWeight: 200,
          }}
        >
          ‹
        </button>

        {/* form area */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 20,
            marginTop: -40,
          }}
        >
          {/* daily budget */}
          <div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: 3,
                color: 'rgba(120,100,150,0.45)',
                fontWeight: 300,
                marginBottom: 10,
                paddingLeft: 4,
              }}
            >
              每日配给
            </div>
            <div
              style={{
                position: 'relative',
                background: 'rgba(255,255,255,0.35)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderRadius: 16,
                border: '1px solid rgba(210,200,230,0.25)',
                padding: '18px 20px',
                display: 'flex',
                alignItems: 'baseline',
                gap: 6,
              }}
            >
              <span
                style={{
                  fontFamily: serifFont,
                  fontSize: 14,
                  fontWeight: 300,
                  color: 'rgba(120,100,150,0.4)',
                }}
              >
                ¥
              </span>
              <input
                type="number"
                className="settings-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                style={{
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  fontSize: 32,
                  fontWeight: 300,
                  fontFamily: serifFont,
                  color: 'rgba(80,60,110,0.8)',
                  width: '100%',
                  letterSpacing: -0.5,
                }}
              />
            </div>
          </div>
        </div>

        {/* save */}
        <div style={{ paddingBottom: 56 }}>
          <button
            onClick={save}
            style={{
              width: '100%',
              padding: '16px 0',
              background: 'rgba(255,255,255,0.3)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(210,200,230,0.2)',
              borderRadius: 16,
              color: 'rgba(100,80,140,0.6)',
              fontSize: 12,
              fontWeight: 300,
              letterSpacing: 4,
              cursor: 'pointer',
              fontFamily: sansFont,
              transition: 'all 0.3s ease',
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const [page, setPage] = useState<'main' | 'settings'>('main');

  // dailyBudget 持久化到 localStorage. 默认 ¥80.
  const [budget, setBudgetState] = useState<number>(() => {
    const raw = localStorage.getItem(BUDGET_KEY);
    const n = raw ? Number(raw) : 80;
    return Number.isFinite(n) && n > 0 ? n : 80;
  });
  const setBudget = (n: number) => {
    setBudgetState(n);
    localStorage.setItem(BUDGET_KEY, String(n));
  };

  // 今日已花 = today's expense bills 总和. createdAt 落在今天 0:00..24:00 内.
  const spent = useLiveQuery(
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

  const mesh = useMemo(() => buildMesh(42), []);

  const ratio = Math.min(spent / Math.max(budget, 1), 1.15);
  const remaining = Math.max(budget - spent, 0);
  const isDrowned = ratio >= 0.95;
  const isOver = spent > budget;

  if (page === 'settings') {
    return (
      <SettingsPage
        budget={budget}
        setBudget={setBudget}
        onBack={() => setPage('main')}
      />
    );
  }

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 420,
        margin: '0 auto',
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
        @keyframes shimmerSharp {
          0%, 100% { opacity: 0; transform: scale(0.6); }
          3% { opacity: 1; transform: scale(2); }
          7% { opacity: 0; transform: scale(0.6); }
        }
        @keyframes shimmerDust {
          0%, 100% { opacity: 0; }
          2% { opacity: 1; }
          5% { opacity: 0; }
        }
        @keyframes breathe {
          0%, 100% { opacity: 0.75; }
          50% { opacity: 1; }
        }
        @keyframes drift {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>

      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '88vh',
          maxHeight: 720,
          borderRadius: 22,
          overflow: 'hidden',
          boxShadow: '0 4px 32px rgba(140,120,180,0.12)',
          background: isDrowned
            ? 'linear-gradient(180deg, #d0dff0 0%, #c0d5ea 100%)'
            : 'linear-gradient(180deg, #f5f0f8 0%, #efe8f4 100%)',
          transition: 'background 0.8s ease',
        }}
      >
        {/* geo mesh layer */}
        <div style={{ position: 'absolute', inset: 0 }}>
          <GeoSea ratio={ratio} mesh={mesh} />
        </div>

        {/* number only */}
        <div
          style={{
            position: 'absolute',
            top: 48,
            right: 36,
            pointerEvents: 'none',
            fontSize: 42,
            fontWeight: 300,
            fontFamily: "'Cormorant Garamond',serif",
            letterSpacing: -0.5,
            lineHeight: 1,
            color: 'rgba(255,255,255,0.9)',
            textShadow: '0 1px 8px rgba(80,120,180,0.15)',
            transition: 'color 0.8s ease',
          }}
        >
          {isOver ? `-${spent - budget}` : remaining.toFixed(0)}
        </div>

        {/* settings tap zone — invisible */}
        <div
          onClick={() => setPage('settings')}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: 80,
            height: 44,
            cursor: 'pointer',
          }}
        />
      </div>
    </div>
  );
}
