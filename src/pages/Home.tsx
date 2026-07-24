import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DataLossRecoverBanner from '../components/DataLossRecoverBanner';
import GroupChatSetup from '../components/GroupChatSetup';

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300&family=Noto+Sans+SC:wght@300;400&display=swap';

/* ─── Wisteria mark ─── */
function WisteriaMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 40 44">
      <line x1="20" y1="0" x2="20" y2="12" stroke="rgba(140,120,170,0.3)" strokeWidth="0.8" />
      {[
        { x: 14, len: 18, d: 0 },
        { x: 17, len: 24, d: 0.3 },
        { x: 20, len: 28, d: 0.1 },
        { x: 23, len: 22, d: 0.4 },
        { x: 26, len: 16, d: 0.2 },
      ].map((s, i) => (
        <g key={i}>
          <line
            x1={s.x}
            y1="12"
            x2={s.x}
            y2={12 + s.len}
            stroke="rgba(160,135,190,0.25)"
            strokeWidth="0.7"
          >
            <animate
              attributeName="x2"
              values={`${s.x};${s.x + 0.5};${s.x}`}
              dur="4s"
              begin={`${s.d}s`}
              repeatCount="indefinite"
            />
          </line>
          <circle
            cx={s.x}
            cy={12 + s.len}
            r={1 + (s.len / 28) * 1.2}
            fill={i === 2 ? 'rgba(185,160,210,0.35)' : 'rgba(170,145,200,0.2)'}
          />
        </g>
      ))}
      <circle cx="20" cy="12" r="1.2" fill="rgba(155,130,185,0.25)" />
    </svg>
  );
}

/* ─── Background vines ─── */
interface Vine {
  xR: number;
  lenR: number;
  spd: number;
  ph: number;
  w: number;
  h: number;
  s: number;
  l: number;
  a: number;
  bud: boolean;
  budP: number;
  budR: number;
  gold: boolean;
}

function useVines(ref: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const W = () => c.clientWidth;
    const H = () => c.clientHeight;
    const ls: Vine[] = [];
    for (let i = 0; i < 22; i++) {
      const r1 = Math.random();
      const r2 = Math.random();
      const g = Math.sqrt(-2 * Math.log(r1)) * Math.cos(2 * Math.PI * r2);
      const f = Math.random();
      let h: number, s: number, l: number, a: number;
      if (f < 0.4) {
        h = 270 + (Math.random() - 0.5) * 15;
        s = 35 + Math.random() * 20;
        l = 60 + Math.random() * 15;
        a = 0.15 + Math.random() * 0.12;
      } else if (f < 0.6) {
        h = 245 + Math.random() * 15;
        s = 30 + Math.random() * 20;
        l = 62 + Math.random() * 15;
        a = 0.1 + Math.random() * 0.1;
      } else if (f < 0.8) {
        h = 310 + (Math.random() - 0.5) * 20;
        s = 25 + Math.random() * 20;
        l = 65 + Math.random() * 12;
        a = 0.1 + Math.random() * 0.08;
      } else if (f < 0.93) {
        h = 280 + Math.random() * 15;
        s = 20 + Math.random() * 15;
        l = 70 + Math.random() * 10;
        a = 0.12 + Math.random() * 0.1;
      } else {
        h = 38 + Math.random() * 15;
        s = 35 + Math.random() * 20;
        l = 60 + Math.random() * 15;
        a = 0.12 + Math.random() * 0.08;
      }
      ls.push({
        xR: Math.max(0.06, Math.min(0.94, 0.5 + g * 0.25)),
        lenR: 0.1 + Math.random() * 0.5,
        spd: 0.002 + Math.random() * 0.003,
        ph: Math.random() * Math.PI * 2,
        w: 0.3 + Math.random() * 0.7,
        h,
        s,
        l,
        a,
        bud: Math.random() > 0.5,
        budP: 0.4 + Math.random() * 0.45,
        budR: 1 + Math.random() * 2.8,
        gold: f >= 0.93,
      });
    }
    let t = 0;
    let id = 0;
    const draw = () => {
      t += 0.005;
      const w = W();
      const ht = H();
      ctx.clearRect(0, 0, w, ht);
      const cx = w * 0.5;
      const gg = ctx.createLinearGradient(cx, 0, cx, ht * 0.4);
      gg.addColorStop(0, 'rgba(160,140,190,0.05)');
      gg.addColorStop(1, 'rgba(160,140,190,0)');
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, ht * 0.4);
      ctx.strokeStyle = gg;
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ls.forEach((v) => {
        const x = v.xR * w;
        const len = v.lenR * ht;
        const sw = Math.sin(t * v.spd * 200 + v.ph) * 1.8;
        const gr = ctx.createLinearGradient(x, 0, x, len);
        gr.addColorStop(0, `hsla(${v.h},${v.s}%,${v.l}%,${v.a})`);
        gr.addColorStop(0.7, `hsla(${v.h},${v.s}%,${v.l}%,${v.a})`);
        gr.addColorStop(1, `hsla(${v.h},${v.s}%,${v.l}%,0)`);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.quadraticCurveTo(x + sw, len * 0.5, x + sw * 0.6, len);
        ctx.strokeStyle = gr;
        ctx.lineWidth = v.w;
        ctx.stroke();
        if (v.bud) {
          const by = len * v.budP;
          const bx = x + sw * v.budP;
          const p = 1 + Math.sin(t * 1.2 + v.ph) * 0.1;
          ctx.beginPath();
          ctx.arc(bx, by, v.budR * p, 0, Math.PI * 2);
          ctx.fillStyle = v.gold
            ? `hsla(40,45%,65%,${v.a * 1.2})`
            : `hsla(${v.h + 5},${v.s + 8}%,${v.l - 5}%,${v.a * 1.5})`;
          ctx.fill();
        }
      });
      id = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', resize);
    };
  }, [ref]);
}

/* ─── Icons ─── */
type IconFn = (c: string) => React.ReactNode;

const ico: Record<string, IconFn> = {
  chat: (c) => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  book: (c) => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
  moon: (c) => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
  heart: (c) => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  wallet: (c) => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M16 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
      <path d="M2 10h20" />
    </svg>
  ),
  consult: (c) => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 20V8l8-4 8 4v12" />
      <path d="M9 20v-6h6v6" />
      <path d="M4 12h16" />
    </svg>
  ),
};

interface SpaceDef {
  id: 'chat' | 'books' | 'consult' | 'body' | 'billing';
  top: string;
  left: string;
  lineW: string;
  label: string;
  icon: keyof typeof ico;
  color: string;
  delay: number;
  dots?: string[];
}

const spaces: SpaceDef[] = [
  {
    id: 'chat',
    top: '35%',
    left: '18%',
    lineW: '26%',
    label: '客厅',
    icon: 'chat',
    color: 'rgba(130,108,170,0.5)',
    delay: 0,
  },
  {
    id: 'books',
    top: '45%',
    left: '75%',
    lineW: '22%',
    label: '书房',
    icon: 'book',
    color: 'rgba(100,118,160,0.5)',
    delay: 0.06,
  },
  {
    id: 'consult',
    top: '60%',
    left: '16%',
    lineW: '24%',
    label: '咨询室',
    icon: 'consult',
    color: 'rgba(92,61,122,0.55)',
    delay: 0.12,
  },
  {
    id: 'body',
    top: '65%',
    left: '75%',
    lineW: '24%',
    label: '身体',
    icon: 'heart',
    color: 'rgba(90,140,128,0.45)',
    delay: 0.18,
  },
  {
    id: 'billing',
    top: '87%',
    left: '52%',
    lineW: '26%',
    label: '账单',
    icon: 'wallet',
    color: 'rgba(140,120,100,0.45)',
    delay: 0.24,
  },
];

const decoLines = [{ top: '83%', left: '36%', lineW: '22%' }];

function SpaceEntry({
  sp,
  open,
  onActivate,
}: {
  sp: SpaceDef;
  open: boolean;
  onActivate: () => void;
}) {
  const iconFn = ico[sp.icon];
  return (
    <button
      onClick={onActivate}
      style={{
        position: 'absolute',
        top: sp.top,
        left: sp.left,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '6px',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '0',
        opacity: open ? 1 : 0,
        transform: open ? 'translateY(0)' : 'translateY(-6px)',
        transition: `opacity 0.5s ease ${sp.delay}s, transform 0.5s ease ${sp.delay}s`,
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
        <span style={{ display: 'flex' }}>{iconFn(sp.color)}</span>
        <span
          style={{
            fontFamily: "'Noto Sans SC', sans-serif",
            fontWeight: 400,
            fontSize: '13px',
            color: 'rgba(90,70,125,0.6)',
            letterSpacing: '0.04em',
          }}
        >
          {sp.label}
        </span>
        {sp.dots && (
          <span style={{ display: 'flex', gap: '3px', marginLeft: '4px' }}>
            {sp.dots.map((d, i) => (
              <span
                key={i}
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: d,
                  display: 'inline-block',
                }}
              />
            ))}
          </span>
        )}
      </div>
      <div
        style={{
          width: sp.lineW,
          height: '1px',
          background:
            'linear-gradient(90deg, rgba(160,140,190,0.18), rgba(160,140,190,0.08))',
          minWidth: '60px',
        }}
      />
    </button>
  );
}

function DecoLine({
  line,
  open,
  delay,
}: {
  line: { top: string; left: string; lineW: string };
  open: boolean;
  delay: number;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: line.top,
        left: line.left,
        width: line.lineW,
        height: '1px',
        background:
          'linear-gradient(90deg, rgba(160,140,190,0.08), rgba(160,140,190,0.03))',
        opacity: open ? 1 : 0,
        transition: `opacity 0.6s ease ${delay}s`,
      }}
    />
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONTS_URL;
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  useVines(canvasRef);

  function handleSpace(sp: SpaceDef) {
    if (sp.id === 'chat') {
      setGroupOpen(true);
      return;
    }
    const target =
      sp.id === 'books'
        ? '/books'
        : sp.id === 'consult'
          ? '/consult'
          : sp.id === 'body'
            ? '/body'
            : '/billing';
    navigate(target);
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background:
          'linear-gradient(180deg, #f3eef8 0%, #ece4f3 25%, #f0e9f5 50%, #f5f1fa 75%, #f8f5fc 100%)',
        overflow: 'hidden',
        maxWidth: '430px',
        margin: '0 auto',
      }}
    >
      <DataLossRecoverBanner variant="fixed" />
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: -30,
          left: '35%',
          width: '55%',
          height: '160px',
          background:
            'radial-gradient(ellipse at center, rgba(255,225,195,0.10) 0%, rgba(215,190,235,0.04) 50%, transparent 75%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: '44%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          zIndex: 3,
        }}
      >
        <button
          onClick={() => open && setOpen(false)}
          style={{
            background: 'none',
            border: 'none',
            cursor: open ? 'pointer' : 'default',
            padding: 0,
            display: 'flex',
          }}
        >
          <WisteriaMark size={34} />
        </button>
        <div style={{ height: '14px' }} />
        <button
          onClick={() => !open && setOpen(true)}
          style={{
            background: 'none',
            border: 'none',
            cursor: open ? 'default' : 'pointer',
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: '28px',
            fontWeight: 300,
            letterSpacing: '0.2em',
            color: 'rgba(100,75,130,0.55)',
            padding: '4px 8px',
            opacity: open ? 0 : 1,
            transform: open ? 'translateY(-4px)' : 'translateY(0)',
            transition: 'opacity 0.4s ease, transform 0.4s ease',
            pointerEvents: open ? 'none' : 'auto',
          }}
        >
          Wisteria
        </button>
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '9px',
            letterSpacing: '0.25em',
            color: 'rgba(155,130,185,0.2)',
            marginTop: '3px',
            opacity: open ? 0 : 1,
            transition: 'opacity 0.4s ease',
          }}
        >
          紫藤
        </div>
      </div>

      {spaces.map((sp) => (
        <SpaceEntry key={sp.id} sp={sp} open={open} onActivate={() => handleSpace(sp)} />
      ))}

      {decoLines.map((line, i) => (
        <DecoLine key={i} line={line} open={open} delay={0.25 + i * 0.06} />
      ))}

      <div
        style={{
          position: 'absolute',
          bottom: '10%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '36px',
          height: '1px',
          background:
            'linear-gradient(90deg, transparent, rgba(150,125,180,0.12), transparent)',
        }}
      />

      <style>{`
        button:active { opacity: 0.7; }
      `}</style>

      {groupOpen && (
        <GroupChatSetup
          onClose={() => setGroupOpen(false)}
          onCreated={(conv) => {
            setGroupOpen(false);
            navigate(`/chat/${conv.id}`);
          }}
        />
      )}
    </div>
  );
}
