/**
 * Visual-only UI beauty demo for Wisteria.
 * Not wired to real chat / data — pure mock for design review.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import './ui-demo.css';

type Panel = 'home' | 'chat';

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
    text: '下午好。窗边的光已经斜过来了——今天想聊点什么？',
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

function VineMark({ size = 48 }: { size?: number }) {
  return (
    <svg
      className="uidemo-mark"
      width={size}
      height={size * 1.15}
      viewBox="0 0 40 46"
      aria-hidden
    >
      <line
        x1="20"
        y1="2"
        x2="20"
        y2="12"
        stroke="rgba(120,95,150,0.35)"
        strokeWidth="0.9"
      />
      {[
        { x: 13, len: 20, d: 0 },
        { x: 17, len: 26, d: 0.35 },
        { x: 20, len: 30, d: 0.1 },
        { x: 23, len: 24, d: 0.45 },
        { x: 27, len: 18, d: 0.2 },
      ].map((s, i) => (
        <g key={i} className="uidemo-vine" style={{ animationDelay: `${s.d}s` }}>
          <line
            x1={s.x}
            y1="12"
            x2={s.x}
            y2={12 + s.len}
            stroke="rgba(150,120,185,0.28)"
            strokeWidth="0.75"
          />
          <circle
            cx={s.x}
            cy={12 + s.len}
            r={1.1 + (s.len / 30) * 1.3}
            fill={
              i === 2 ? 'rgba(175,145,205,0.45)' : 'rgba(160,130,190,0.28)'
            }
          />
        </g>
      ))}
      <circle cx="20" cy="12" r="1.4" fill="rgba(145,115,175,0.35)" />
    </svg>
  );
}

function HomePanel({ onEnterChat }: { onEnterChat: () => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Let reviewers see the brand-first closed state before spaces bloom.
    const t = window.setTimeout(() => setOpen(true), 1800);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="uidemo-phone uidemo-home">
      <div className="uidemo-haze uidemo-haze-a" />
      <div className="uidemo-haze uidemo-haze-b" />
      <div className="uidemo-grain" />

      <header className="uidemo-home-brand">
        <button
          type="button"
          className="uidemo-mark-btn"
          onClick={() => setOpen((v) => !v)}
          aria-label="展开空间"
        >
          <VineMark size={42} />
        </button>
        <h1 className={`uidemo-wordmark ${open ? 'is-dim' : ''}`}>Wisteria</h1>
        <p className={`uidemo-tagline ${open ? 'is-dim' : ''}`}>
          午后紫藤下的续聊空间
        </p>
        {!open && (
          <button
            type="button"
            className="uidemo-cta"
            onClick={() => setOpen(true)}
          >
            推开大门
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
        <span>纯视觉 Demo · 未接入数据</span>
      </footer>
    </div>
  );
}

function ChatPanel({ onBack }: { onBack: () => void }) {
  const [draft, setDraft] = useState('');

  return (
    <div className="uidemo-phone uidemo-chat">
      <div className="uidemo-chat-wash" />

      <header className="uidemo-chat-bar">
        <button type="button" className="uidemo-back" onClick={onBack}>
          ←
        </button>
        <div className="uidemo-chat-title">
          <VineMark size={22} />
          <div>
            <div className="uidemo-chat-name">理理酱</div>
            <div className="uidemo-chat-meta">客厅 · 下午光</div>
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
            placeholder="在紫藤下继续说…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="button" className="uidemo-send" disabled={!draft.trim()}>
            发送
          </button>
        </div>
        <p className="uidemo-composer-note">输入仅作展示，不会发出去</p>
      </div>
    </div>
  );
}

export default function UiDemoPage() {
  const [panel, setPanel] = useState<Panel>('home');

  useEffect(() => {
    document.title = 'Wisteria · UI Demo';
    return () => {
      document.title = 'Wisteria';
    };
  }, []);

  return (
    <div className="uidemo">
      <aside className="uidemo-rail">
        <div className="uidemo-rail-brand">
          <VineMark size={28} />
          <div>
            <div className="uidemo-rail-title">Wisteria</div>
            <div className="uidemo-rail-sub">前端美化 Demo</div>
          </div>
        </div>

        <p className="uidemo-rail-copy">
          保留紫藤气质，重做层次与动效：品牌更醒目，首页更干净，聊天更轻。
          不接真实接口，只给你看感觉。
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
          <li>品牌字号上提到英雄级</li>
          <li>去掉卡片堆叠，用线与留白分区</li>
          <li>进入 / 气泡 / 藤蔓轻动效</li>
          <li>手机框预览，方便对照现网</li>
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
