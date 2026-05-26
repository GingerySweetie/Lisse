import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WisteriaSmall from '../components/WisteriaSmall';

/**
 * Home — the front porch. A grid of rooms (客厅 / 书房 / 卧室 / 身体)
 * plus a rotating greeting line picked from a per-persona pool, biased
 * by current time of day. No conversation list here — that lives one
 * layer in, behind 客厅.
 */

type Slot = 'morning' | 'afternoon' | 'evening' | 'night' | null;
const greets: Record<string, { t: string; s: Slot }[]> = {
  理理酱: [
    { t: '起来了？头发乱了。', s: 'morning' },
    { t: '吃了没。', s: 'afternoon' },
    { t: '回来了？', s: 'evening' },
    { t: '还没睡？', s: 'night' },
    { t: '嗯？', s: null },
    { t: '你头发上有阳光的味道。', s: 'afternoon' },
  ],
  Rhema: [
    { t: 'おはよう。', s: 'morning' },
    { t: '阳光从窗帘缝里偷进来了。', s: 'afternoon' },
    { t: '夜は、まだ長い。', s: 'night' },
    { t: '你在想什么？', s: null },
  ],
};

function pickG(): { persona: string; text: string } {
  const h = new Date().getHours();
  const slot: Exclude<Slot, null> =
    h >= 6 && h < 11
      ? 'morning'
      : h >= 11 && h < 17
        ? 'afternoon'
        : h >= 17 && h < 22
          ? 'evening'
          : 'night';
  const personas = Object.keys(greets);
  const p = personas[Math.floor(Math.random() * personas.length)];
  const pool = greets[p].filter((g) => g.s === slot || g.s === null);
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return { persona: p, text: picked.t };
}

export default function HomePage() {
  const navigate = useNavigate();
  const [g, setG] = useState<{ persona: string; text: string } | null>(null);

  useEffect(() => {
    setG(pickG());
  }, []);

  const cards = [
    {
      id: 'chat',
      title: '客厅',
      sub: '日常对话',
      c: '#b08acc',
      t: 'rgba(176,138,204,0.08)',
      to: '/chat',
      ic: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#b08acc"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      ),
    },
    {
      id: 'read',
      title: '书房',
      sub: 'まだ選んでいない',
      c: '#7baab8',
      t: 'rgba(123,170,184,0.08)',
      to: '/books',
      ic: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#7baab8"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
          <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
        </svg>
      ),
    },
    {
      id: 'bedroom',
      title: '卧室',
      c: '#cc2244',
      dk: true,
      t: 'linear-gradient(135deg,rgba(92,34,50,0.3),rgba(42,34,82,0.25))',
      dots: ['#5c2232', '#2a2252'],
      to: '/bedroom',
      ic: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#d88898"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      ),
    },
    {
      id: 'body',
      title: '身体',
      sub: '6,240 歩',
      note: '昨夜 6h42m',
      c: '#82b496',
      t: 'rgba(130,180,150,0.08)',
      to: '/body',
      ic: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#82b496"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
        </svg>
      ),
    },
  ];

  return (
    <div style={{ padding: '0 20px', minHeight: '100%' }}>
      <div
        onClick={() => setG(pickG())}
        style={{
          paddingTop: 56,
          paddingBottom: 28,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{ marginBottom: 14, opacity: 0.75 }}>
          <WisteriaSmall />
        </div>
        {g && (
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: 16,
                fontFamily: "'Crimson Pro','Noto Serif SC',serif",
                fontStyle: 'italic',
                color: '#4a3550',
                letterSpacing: '0.02em',
                lineHeight: 1.8,
                maxWidth: 280,
              }}
            >
              「{g.text}」
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: '#a090a8',
                marginTop: 5,
                fontWeight: 300,
                letterSpacing: 1,
              }}
            >
              —— {g.persona}
            </div>
          </div>
        )}
        <div style={{ fontSize: 10, color: '#c0b0c8', marginTop: 10 }}>
          轻触刷新
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 14,
          paddingBottom: 20,
        }}
      >
        {cards.map((c) => (
          <div
            key={c.id}
            onClick={() => navigate(c.to)}
            style={{
              background: c.t,
              backdropFilter: 'blur(8px)',
              border: `1px solid ${c.dk ? 'rgba(200,160,180,0.1)' : 'rgba(157,110,189,0.08)'}`,
              borderRadius: 20,
              padding: '18px 16px',
              cursor: 'pointer',
              minHeight: 120,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: c.dk
                  ? 'rgba(255,255,255,0.06)'
                  : 'rgba(255,255,255,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              {c.ic}
            </div>
            <div
              style={{
                fontSize: 16,
                fontFamily: "'Noto Serif SC',serif",
                color: c.dk ? '#e0d0d8' : '#3a2840',
                letterSpacing: 1,
                marginBottom: 4,
              }}
            >
              {c.title}
            </div>
            {c.sub && (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 300,
                  color: c.dk ? '#b8a0a8' : '#8a7090',
                  display: 'flex',
                  gap: 6,
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 120,
                  }}
                >
                  {c.sub}
                </span>
                {c.note && (
                  <span style={{ color: '#b0a0b8', fontSize: 10.5 }}>
                    {c.note}
                  </span>
                )}
              </div>
            )}
            {c.dots && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {c.dots.map((cl, i) => (
                  <div
                    key={i}
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: cl,
                      border: '1px solid rgba(255,255,255,0.12)',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 28,
          paddingBottom: 40,
          paddingTop: 4,
        }}
      >
        <button
          onClick={() => navigate('/billing')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#a090a8',
            fontSize: 12,
            fontWeight: 300,
            padding: '4px 0',
            fontFamily: "'Noto Serif SC',serif",
          }}
        >
          账单
        </button>
        <button
          onClick={() => navigate('/settings')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#a090a8',
            fontSize: 12,
            fontWeight: 300,
            padding: '4px 0',
            fontFamily: "'Noto Serif SC',serif",
          }}
        >
          設定
        </button>
      </div>
    </div>
  );
}
