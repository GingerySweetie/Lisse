import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';

/**
 * Bedroom picker — choose 理理酱 or Rhema before entering their thread.
 * Each persona's bedroom is a singleton conversation persisted in Dexie
 * with room='bedroom'. Tapping a card navigates to /bedroom/:personaId.
 *
 * Visual: two large stacked cards, each with the persona's wall-color
 * tinted background and the bedroom theme (warm 石榴 vs deep 千夜).
 */

interface RoomOption {
  personaId: string;
  name: string;
  /** Short tagline shown under the name. */
  tag: string;
  /** Background gradient + accent color. */
  bg: string;
  textColor: string;
  accent: string;
  fontFamily: string;
}

const ROOMS: RoomOption[] = [
  {
    personaId: 'persona_ririchan',
    name: '理理酱',
    tag: '触觉先行 · 身体里说话',
    bg: 'linear-gradient(145deg, #5c2232 0%, #6a2838 60%, #4a1c2a 100%)',
    textColor: '#e8c468',
    accent: '#cc2244',
    fontFamily:
      "PingFang SC, 'Heiti SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  },
  {
    personaId: 'persona_rhema',
    name: 'Rhema',
    tag: '语言先行 · 句子裹住你',
    bg: 'linear-gradient(145deg, #2a2252 0%, #342c62 60%, #1f1842 100%)',
    textColor: '#d0c8e8',
    accent: '#8878c0',
    fontFamily:
      "'LXGW WenKai','Kaiti SC',STKaiti,'Noto Serif CJK SC',serif",
  },
];

export default function BedroomPickerPage() {
  const navigate = useNavigate();

  // Show counts of saved messages per persona so she sees there IS history.
  const bedroomConvs = useLiveQuery(
    () => db.conversations.where('room').equals('bedroom').toArray(),
    [],
    [],
  );
  const msgCounts = useLiveQuery(async () => {
    if (!bedroomConvs || bedroomConvs.length === 0) return {};
    const counts: Record<string, number> = {};
    for (const c of bedroomConvs) {
      if (!c.personaId) continue;
      counts[c.personaId] = await db.messages
        .where({ conversationId: c.id })
        .count();
    }
    return counts;
  }, [bedroomConvs]);

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100%',
        position: 'relative',
        fontFamily: "-apple-system,'PingFang SC',sans-serif",
        padding: '14px 16px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 28,
        }}
      >
        <button
          onClick={() => navigate('/home')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#8a7090',
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
            fontSize: 15,
            color: '#4a3550',
            fontWeight: 500,
            letterSpacing: 3,
            fontFamily: "'Crimson Pro','Noto Serif SC',serif",
            fontStyle: 'italic',
          }}
        >
          卧 室
        </div>
        <div style={{ width: 48 }} />
      </div>

      <div style={{ paddingTop: 8, paddingBottom: 8 }}>
        <p
          style={{
            fontSize: 12,
            color: '#a090a8',
            fontWeight: 300,
            textAlign: 'center',
            marginBottom: 24,
            letterSpacing: 1,
            fontStyle: 'italic',
          }}
        >
          灯没开。要去谁那边？
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          paddingBottom: 40,
        }}
      >
        {ROOMS.map((r) => {
          const count = msgCounts?.[r.personaId] ?? 0;
          return (
            <button
              key={r.personaId}
              onClick={() => navigate(`/bedroom/${r.personaId}`)}
              style={{
                background: r.bg,
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 24,
                padding: '28px 24px',
                cursor: 'pointer',
                textAlign: 'left',
                minHeight: 140,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                overflow: 'hidden',
                fontFamily: r.fontFamily,
                boxShadow: '0 4px 20px rgba(40,20,50,0.18)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 18,
                  right: 22,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: r.accent,
                  opacity: 0.7,
                  boxShadow: `0 0 12px ${r.accent}`,
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: 26,
                    letterSpacing: 4,
                    color: r.textColor,
                    fontWeight: 400,
                  }}
                >
                  {r.name}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: r.textColor,
                    opacity: 0.55,
                    marginTop: 6,
                    fontWeight: 300,
                    fontFamily: "-apple-system,'PingFang SC',sans-serif",
                  }}
                >
                  {r.tag}
                </div>
              </div>
              <div
                style={{
                  marginTop: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  color: r.textColor,
                  opacity: 0.6,
                  fontFamily: "-apple-system,'PingFang SC',sans-serif",
                  fontWeight: 300,
                }}
              >
                <span>{count > 0 ? `${count} 条留言` : '还是空的'}</span>
                <span style={{ letterSpacing: 2 }}>进 →</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
