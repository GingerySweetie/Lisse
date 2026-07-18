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

function RippleMark({ size = 48 }: { size?: number }) {
  return (
    <svg
      className="uidemo-mark"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden
    >
      {[8, 14, 20].map((r, i) => (
        <circle
          key={r}
          className="uidemo-ring"
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke={RP[300]}
          strokeWidth={i === 0 ? 1.1 : 0.7}
          opacity={0.45 - i * 0.1}
          style={{ animationDelay: `${i * 0.35}s` }}
        />
      ))}
      <circle cx="24" cy="24" r="2.2" fill={RP[400]} opacity={0.55} />
    </svg>
  );
}

function AmbientRings() {
  return (
    <svg className="uidemo-ambient" viewBox="0 0 390 780" aria-hidden>
      {/* upper-right cluster — replaces hanging vines */}
      {[36, 64, 96, 132, 172].map((r, i) => (
        <circle
          key={`a-${r}`}
          className="uidemo-ambient-ring"
          cx="310"
          cy="120"
          r={r}
          fill="none"
          stroke={RP[300]}
          strokeWidth={i === 4 ? 0.45 : 0.7}
          opacity={0.11 - i * 0.015}
          style={{ animationDelay: `${i * 0.5}s` }}
        />
      ))}
      {/* lower-left quieter cluster */}
      {[28, 52, 80].map((r, i) => (
        <circle
          key={`b-${r}`}
          className="uidemo-ambient-ring"
          cx="48"
          cy="620"
          r={r}
          fill="none"
          stroke={RP[400]}
          strokeWidth={0.55}
          opacity={0.08 - i * 0.015}
          style={{ animationDelay: `${1.2 + i * 0.6}s` }}
        />
      ))}
      {/* faint center bloom behind brand */}
      {[40, 70, 105].map((r, i) => (
        <circle
          key={`c-${r}`}
          className="uidemo-ambient-ring"
          cx="195"
          cy="320"
          r={r}
          fill="none"
          stroke={RP[300]}
          strokeWidth={0.5}
          opacity={0.05 - i * 0.008}
          style={{ animationDelay: `${0.8 + i * 0.4}s` }}
        />
      ))}
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
        <h1 className={`uidemo-wordmark ${open ? 'is-dim' : ''}`}>Wisteria</h1>
        <p className={`uidemo-tagline ${open ? 'is-dim' : ''}`}>
          薄花色 · 涟漪皮肤
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
        {[28, 52, 78].map((r, i) => (
          <circle
            key={r}
            className="uidemo-ambient-ring"
            cx="340"
            cy="70"
            r={r}
            fill="none"
            stroke={RP[300]}
            strokeWidth={0.55}
            opacity={0.1 - i * 0.02}
            style={{ animationDelay: `${i * 0.45}s` }}
          />
        ))}
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
    document.title = 'Wisteria · Ripple Demo';
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
            <div className="uidemo-rail-title">Ripple</div>
            <div className="uidemo-rail-sub">涟漪皮肤 Demo</div>
          </div>
        </div>

        <p className="uidemo-rail-copy">
          布局沿用现在的庭院首页：中间品牌、四周房间。垂落紫藤换成一圈圈涟漪。
          色：薄花色 / 群青鼠 / periwinkle gray。
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
          <li>同心圆 / 微光线 / 点击波</li>
          <li>点手机框任意处起涟漪</li>
        </ul>

        <Link to="/home" className="uidemo-exit">
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
