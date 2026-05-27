import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { getBedroomTheme } from '../lib/bedroom-themes';

/**
 * Bedroom picker — choose 理理酱 or Rhema before entering their thread.
 * Each persona's bedroom is a singleton conversation with room='bedroom'.
 *
 * The card itself is neutral 紫雾 by default; if the user has set a
 * bedroomTheme on a given persona's room, that card adopts the theme so
 * she can tell at a glance which room is currently which color.
 */

interface RoomOption {
  personaId: string;
  name: string;
  /** Short tagline shown under the name. */
  tag: string;
}

const ROOMS: RoomOption[] = [
  {
    personaId: 'persona_ririchan',
    name: '理理酱',
    tag: '触觉先行 · 身体里说话',
  },
  {
    personaId: 'persona_rhema',
    name: 'Rhema',
    tag: '语言先行 · 句子裹住你',
  },
];

export default function BedroomPickerPage() {
  const navigate = useNavigate();

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

  const themeByPersona: Record<string, string | undefined> = {};
  for (const c of bedroomConvs ?? []) {
    if (c.personaId) themeByPersona[c.personaId] = c.bedroomTheme;
  }

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
          const theme = getBedroomTheme(themeByPersona[r.personaId]);
          return (
            <button
              key={r.personaId}
              onClick={() => navigate(`/bedroom/${r.personaId}`)}
              style={{
                background: `linear-gradient(145deg, ${theme.bg} 0%, ${theme.sl} 60%, ${theme.bg} 100%)`,
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
                  background: theme.ac,
                  opacity: 0.7,
                  boxShadow: `0 0 12px ${theme.ac}`,
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: 26,
                    letterSpacing: 4,
                    color: theme.text,
                    fontWeight: 400,
                  }}
                >
                  {r.name}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: theme.text,
                    opacity: 0.55,
                    marginTop: 6,
                    fontWeight: 300,
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
                  color: theme.tm,
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
