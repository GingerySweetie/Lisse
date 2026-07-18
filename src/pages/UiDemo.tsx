/**
 * Visual-only Ripple skin demo.
 * Layout mirrors current /home courtyard; vines → concentric ripples.
 * Palette: 薄花色 / 群青鼠 / periwinkle gray (from design notes).
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { Link } from 'react-router-dom';
import './ui-demo.css';

type Panel = 'home' | 'chat';

const RP = {
  50: '#f0f2f8',
  100: '#e4e7f1',
  200: '#cdd2e5',
  300: '#a8aecb',
  400: '#8a91b5',
  500: '#6b72a0',
  600: '#555c88',
  700: '#414769',
  900: '#1c1f35',
} as const;

const SPACES = [
  { id: 'chat', label: '客厅', hint: '对话与群聊', top: '32%', left: '14%' },
  { id: 'books', label: '书房', hint: '阅读与摘记', top: '42%', left: '68%' },
  { id: 'bedroom', label: '卧室', hint: '私密陪伴', top: '56%', left: '12%' },
  { id: 'body', label: '身体', hint: '节律与健康', top: '66%', left: '70%' },
  { id: 'billing', label: '账单', hint: '消费痕迹', top: '82%', left: '48%' },
] as const;

const MOCK_MESSAGES = [
  {
    role: 'assistant' as const,
    name: '理理酱',
    text: '下午好。暮光落在水面上——今天想聊点什么？',
  },
  {
    role: 'user' as const,
    text: '帮我把昨天那篇笔记整理成三段摘要。',
  },
  {
    role: 'assistant' as const,
    name: '理理酱',
    text: '好。我按主题收束成三节：动机、过程、下一步。需要更短的版本也可以说一声。',
  },
];

type ClickRipple = { id: number; x: number; y: number };

/** Front-ish view of water: wide ellipses, not top-down circles. */
const SQUASH = 0.3;

/**
 * Hand-lettered Ripple wordmark (from the user's sketch — NOT Moon type).
 * R hook · i/p left-open cups · raindrops under i & 2nd p · tall l · broken e.
 */
function HandWordmark({
  height = 52,
  className = '',
}: {
  height?: number;
  className?: string;
}) {
  // viewBox matches the pixel recreation layout (scaled down)
  const vbW = 280;
  const vbH = 120;
  return (
    <svg
      className={`uidemo-moon-wordmark ${className}`.trim()}
      width={(height / vbH) * vbW}
      height={height}
      viewBox={`0 0 ${vbW} ${vbH}`}
      role="img"
      aria-label="Ripple"
    >
      <title>Ripple</title>
      <defs>
        <filter
          id="uidemo-hand-grain"
          x="-15%"
          y="-15%"
          width="130%"
          height="130%"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="1.1"
            numOctaves="2"
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="0.55"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>

      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#uidemo-hand-grain)"
      >
        {/* R — left horizontal + left-open big hook + top down tip */}
        <path
          strokeWidth="3.4"
          d="M 8,78 H 42 A 26,26 0 0 0 42,26 V 40"
        />

        {/* i — left-open cup + raindrop */}
        <path strokeWidth="2.9" d="M 88,36 A 14,14 0 0 1 88,64" />
        <path strokeWidth="2.6" d="M 88,74 V 96" />

        {/* p — left-open cup (no raindrop) */}
        <path strokeWidth="2.9" d="M 122,36 A 14,14 0 0 1 122,64" />

        {/* p — left-open cup + raindrop */}
        <path strokeWidth="2.9" d="M 156,36 A 14,14 0 0 1 156,64" />
        <path strokeWidth="2.6" d="M 156,74 V 96" />

        {/* l — tall vertical */}
        <path strokeWidth="2.9" d="M 190,14 V 78" />

        {/* e — incomplete ripple: short upper + lower arcs, clear 断连 */}
        <path
          strokeWidth="2.8"
          d="M 214,38 A 16,16 0 0 1 242,38"
        />
        <path
          strokeWidth="2.8"
          d="M 242,62 A 16,16 0 0 1 214,62"
        />
      </g>
    </svg>
  );
}

function RippleMark({ size = 48 }: { size?: number }) {
  return (
    <svg
      className="uidemo-mark"
      width={size}
      height={size * 0.55}
      viewBox="0 0 48 26"
      aria-hidden
    >
      {[8, 14, 20].map((rx, i) => (
        <ellipse
          key={rx}
          className="uidemo-ring"
          cx="24"
          cy="13"
          rx={rx}
          ry={rx * SQUASH}
          fill="none"
          stroke={RP[300]}
          strokeWidth={i === 0 ? 1.1 : 0.7}
          opacity={0.5 - i * 0.1}
          style={{ animationDelay: `${i * 0.35}s` }}
        />
      ))}
      <ellipse
        cx="24"
        cy="13"
        rx="2.4"
        ry={2.4 * SQUASH}
        fill={RP[400]}
        opacity={0.55}
      />
    </svg>
  );
}

function FlatRings({
  cx,
  cy,
  radii,
  color,
  baseOpacity,
  delay = 0,
  stroke = 0.65,
}: {
  cx: number;
  cy: number;
  radii: number[];
  color: string;
  baseOpacity: number;
  delay?: number;
  stroke?: number;
}) {
  return (
    <>
      {radii.map((rx, i) => (
        <ellipse
          key={`${cx}-${cy}-${rx}`}
          className="uidemo-ambient-ring"
          cx={cx}
          cy={cy}
          rx={rx}
          ry={rx * SQUASH}
          fill="none"
          stroke={color}
          strokeWidth={i === radii.length - 1 ? stroke * 0.7 : stroke}
          opacity={baseOpacity - i * 0.012}
          style={{ animationDelay: `${delay + i * 0.45}s` }}
        />
      ))}
    </>
  );
}

function AmbientRings() {
  return (
    <svg className="uidemo-ambient" viewBox="0 0 390 780" aria-hidden>
      {/* foreshortened ripples — looking across the water, not down */}
      <FlatRings
        cx={280}
        cy={150}
        radii={[50, 90, 135, 185, 240]}
        color={RP[300]}
        baseOpacity={0.13}
        stroke={0.7}
      />
      <FlatRings
        cx={70}
        cy={640}
        radii={[40, 75, 115]}
        color={RP[400]}
        baseOpacity={0.09}
        delay={1.1}
        stroke={0.55}
      />
      <FlatRings
        cx={195}
        cy={330}
        radii={[55, 100, 150]}
        color={RP[300]}
        baseOpacity={0.06}
        delay={0.7}
        stroke={0.5}
      />
    </svg>
  );
}

function ShimmerLine({ top }: { top: string }) {
  return <div className="uidemo-shimmer" style={{ top }} />;
}

function ClickRipples({ items }: { items: ClickRipple[] }) {
  return (
    <>
      {items.map((r) => (
        <div
          key={r.id}
          className="uidemo-click-ripple"
          style={{ left: r.x, top: r.y }}
        >
          <span />
          <span />
          <span />
        </div>
      ))}
    </>
  );
}

function useClickRipples(hostRef: RefObject<HTMLElement | null>) {
  const [items, setItems] = useState<ClickRipple[]>([]);
  const seq = useRef(0);

  const spawn = useCallback(
    (clientX: number, clientY: number) => {
      const host = hostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const id = ++seq.current;
      setItems((prev) => [
        ...prev,
        { id, x: clientX - rect.left, y: clientY - rect.top },
      ]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((p) => p.id !== id));
      }, 1900);
    },
    [hostRef],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    function onPointer(e: PointerEvent) {
      spawn(e.clientX, e.clientY);
    }
    host.addEventListener('pointerdown', onPointer);
    return () => host.removeEventListener('pointerdown', onPointer);
  }, [hostRef, spawn]);

  return items;
}

function HomePanel({ onEnterChat }: { onEnterChat: () => void }) {
  const [open, setOpen] = useState(false);
  const phoneRef = useRef<HTMLDivElement>(null);
  const ripples = useClickRipples(phoneRef);

  useEffect(() => {
    const t = window.setTimeout(() => setOpen(true), 1600);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div ref={phoneRef} className="uidemo-phone uidemo-home">
      <AmbientRings />
      <ShimmerLine top="48%" />
      <div className="uidemo-grain" />
      <ClickRipples items={ripples} />

      <header className="uidemo-home-brand">
        <button
          type="button"
          className="uidemo-mark-btn"
          onClick={() => setOpen((v) => !v)}
          aria-label="展开空间"
        >
          <RippleMark size={44} />
        </button>
        <h1 className={`uidemo-wordmark ${open ? 'is-dim' : ''}`}>
          <HandWordmark height={58} />
        </h1>
        <p className={`uidemo-tagline ${open ? 'is-dim' : ''}`}>
          Ripple
        </p>
        {!open && (
          <button
            type="button"
            className="uidemo-cta"
            onClick={() => setOpen(true)}
          >
            推开水面
          </button>
        )}
      </header>

      <div className={`uidemo-spaces ${open ? 'is-open' : ''}`}>
        {SPACES.map((sp, i) => (
          <button
            key={sp.id}
            type="button"
            className="uidemo-space"
            style={
              {
                top: sp.top,
                left: sp.left,
                '--d': `${0.05 + i * 0.07}s`,
              } as CSSProperties
            }
            onClick={() => {
              if (sp.id === 'chat') onEnterChat();
            }}
          >
            <span className="uidemo-space-label">{sp.label}</span>
            <span className="uidemo-space-hint">{sp.hint}</span>
            <span className="uidemo-space-line" />
          </button>
        ))}
      </div>

      <footer className="uidemo-home-foot">
        <span>Ripple · 纯视觉 Demo</span>
      </footer>
    </div>
  );
}

function ChatPanel({ onBack }: { onBack: () => void }) {
  const [draft, setDraft] = useState('');
  const phoneRef = useRef<HTMLDivElement>(null);
  const ripples = useClickRipples(phoneRef);

  return (
    <div ref={phoneRef} className="uidemo-phone uidemo-chat">
      <svg className="uidemo-ambient" viewBox="0 0 390 780" aria-hidden>
        <FlatRings
          cx={300}
          cy={90}
          radii={[40, 75, 115]}
          color={RP[300]}
          baseOpacity={0.11}
          stroke={0.55}
        />
      </svg>
      <ShimmerLine top="42%" />
      <div className="uidemo-grain" />
      <ClickRipples items={ripples} />

      <header className="uidemo-chat-bar">
        <button type="button" className="uidemo-back" onClick={onBack}>
          ←
        </button>
        <div className="uidemo-chat-title">
          <RippleMark size={22} />
          <div>
            <div className="uidemo-chat-name">理理酱</div>
            <div className="uidemo-chat-meta">客厅 · 薄花色</div>
          </div>
        </div>
        <div className="uidemo-chat-tools">
          <span>模型</span>
          <span>风格</span>
        </div>
      </header>

      <div className="uidemo-thread">
        {MOCK_MESSAGES.map((m, i) => (
          <article
            key={i}
            className={`uidemo-bubble ${m.role === 'user' ? 'is-user' : 'is-ai'}`}
            style={{ animationDelay: `${0.12 + i * 0.1}s` }}
          >
            {m.role === 'assistant' && (
              <div className="uidemo-bubble-name">{m.name}</div>
            )}
            <p>{m.text}</p>
          </article>
        ))}
      </div>

      <div className="uidemo-composer">
        <div className="uidemo-composer-shell">
          <textarea
            rows={1}
            placeholder="在水面上继续说…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="button" className="uidemo-send" disabled={!draft.trim()}>
            发送
          </button>
        </div>
        <p className="uidemo-composer-note">点一下屏幕会起涟漪 · 不会真发</p>
      </div>
    </div>
  );
}

export default function UiDemoPage() {
  const [panel, setPanel] = useState<Panel>('home');

  useEffect(() => {
    document.title = 'Ripple · Demo';
    return () => {
      document.title = 'Wisteria';
    };
  }, []);

  return (
    <div className="uidemo">
      <aside className="uidemo-rail">
        <div className="uidemo-rail-brand">
          <RippleMark size={28} />
          <div>
            <div className="uidemo-rail-title">
              <HandWordmark height={28} />
            </div>
            <div className="uidemo-rail-sub">Ripple · 手写字标</div>
          </div>
        </div>

        <p className="uidemo-rail-copy">
          布局沿用庭院首页。垂落紫藤换成正视扁涟漪。
          品牌字按你的手写 Ripple 复刻（不是穆恩字母）。
        </p>

        <nav className="uidemo-tabs" aria-label="Demo 面板">
          <button
            type="button"
            className={panel === 'home' ? 'is-active' : ''}
            onClick={() => setPanel('home')}
          >
            首页
          </button>
          <button
            type="button"
            className={panel === 'chat' ? 'is-active' : ''}
            onClick={() => setPanel('chat')}
          >
            聊天
          </button>
        </nav>

        <ul className="uidemo-notes">
          <li>--rp-300 薄花色 · 装饰圈</li>
          <li>--rp-500 群青鼠 · 强调</li>
          <li>扁椭圆涟漪（正视，非俯视）</li>
          <li>点手机框任意处起涟漪</li>
        </ul>

        <Link to="/draw" className="uidemo-exit">
          手写板（画字母给我读）→
        </Link>
        <Link to="/home" className="uidemo-exit" style={{ marginTop: '0.5rem' }}>
          返回现有首页 →
        </Link>
      </aside>

      <main className="uidemo-stage">
        {panel === 'home' ? (
          <HomePanel onEnterChat={() => setPanel('chat')} />
        ) : (
          <ChatPanel onBack={() => setPanel('home')} />
        )}
      </main>
    </div>
  );
}
