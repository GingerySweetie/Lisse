import { useNavigate } from 'react-router-dom';

/**
 * Bedroom picker — Step 1 of the 3-step bedroom ceremony:
 *   Step 1 (here)    : pick person  → navigate to /bedroom/:personaId
 *   Step 2 (in chat) : pick color   → first-time-entry overlay in BedroomChat
 *   Step 3 (in chat) : chat         → the actual thread with decoration layer
 *
 * No card chrome here on purpose — the picker is just text, dots, and a hair-thin
 * divider, to keep the "灯没开" hush of the entryway.
 */

interface RoomOption {
  personaId: string;
  name: string;
  desc: string;
  sub: string;
  dot: string;
  /** Cormorant italic for Rhema酱's Latin name; sans for 理理酱. */
  serif: boolean;
}

const ROOMS: RoomOption[] = [
  {
    personaId: 'persona_ririchan',
    name: '理理酱',
    desc: '触觉先行',
    sub: '身体里说话',
    dot: 'rgba(160,140,200,0.6)',
    serif: false,
  },
  {
    personaId: 'persona_rhema',
    name: 'Rhema酱',
    desc: '语言先行',
    sub: '句子裹住你',
    dot: 'rgba(180,80,80,0.6)',
    serif: true,
  },
];

export default function BedroomPickerPage() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        background:
          'linear-gradient(180deg, #f3eef8 0%, #ece4f3 30%, #f0e9f5 60%, #f5f1fa 100%)',
        fontFamily: "'Noto Sans SC', -apple-system, 'PingFang SC', sans-serif",
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '14px 18px 10px',
          borderBottom: '1px solid rgba(160,140,190,0.06)',
        }}
      >
        <button
          onClick={() => navigate('/home')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'rgba(120,100,155,0.4)',
            fontSize: '15px',
            padding: '4px 8px 4px 0',
          }}
          aria-label="返回玄関"
        >
          ←
        </button>
        <div
          style={{
            flex: 1,
            fontWeight: 400,
            fontSize: '14px',
            letterSpacing: '0.12em',
            color: 'rgba(90,70,120,0.5)',
            textAlign: 'center',
          }}
        >
          卧　室
        </div>
        <div style={{ width: 24 }} />
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontWeight: 300,
            fontSize: '13px',
            color: 'rgba(130,110,165,0.4)',
            marginBottom: '28px',
            letterSpacing: '0.03em',
          }}
        >
          灯没开。要去谁那边？
        </div>
        <div
          style={{
            display: 'flex',
            gap: '1px',
            width: '100%',
            padding: '0 20px',
          }}
        >
          {ROOMS.map((p, i) => (
            <button
              key={p.personaId}
              onClick={() => navigate(`/bedroom/${p.personaId}`)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '14px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '24px 8px',
                borderRight: i === 0 ? '1px solid rgba(160,140,190,0.08)' : 'none',
              }}
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: p.dot,
                }}
              />
              <div
                style={{
                  fontFamily: p.serif
                    ? "'Cormorant Garamond', serif"
                    : "'Noto Sans SC', sans-serif",
                  fontWeight: p.serif ? 400 : 500,
                  fontSize: p.serif ? '22px' : '20px',
                  letterSpacing: p.serif ? '0.12em' : '0.08em',
                  color: 'rgba(80,60,110,0.6)',
                }}
              >
                {p.name}
              </div>
              <div
                style={{
                  fontWeight: 300,
                  fontSize: '11px',
                  color: 'rgba(140,120,170,0.4)',
                  textAlign: 'center',
                  lineHeight: 1.6,
                }}
              >
                {p.desc}
                <br />
                {p.sub}
              </div>
              <div
                style={{
                  width: '28px',
                  height: '1px',
                  marginTop: '4px',
                  background:
                    'linear-gradient(90deg, transparent, rgba(160,140,190,0.15), transparent)',
                }}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
