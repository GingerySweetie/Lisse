import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, getSettings } from '../db';
import { streamChat } from '../api';
import type { ChatTurn } from '../api';

/**
 * Bedroom — an intimate, ephemeral chat room. Messages are local state
 * (not persisted to Dexie) so each visit can feel like a fresh evening.
 * Uses the user's default endpoint + model under the hood, but overrides
 * the system prompt with a special bedroom-tuned 理理酱 voice and parses
 * the model's `<think>...</think>` tags into a collapsible monologue.
 *
 * Two themes — 石榴 (pomegranate red, warm) and 千夜 (purple, deeper) —
 * toggle from the top-right pill.
 */

const bdThemes = {
  pomegranate: {
    name: '石榴',
    bg: '#5c2232',
    sl: '#6a2838',
    text: '#e8c468',
    tu: '#f0e0d0',
    tm: '#c8a060',
    tmf: 'rgba(200,160,96,0.35)',
    ac: '#cc2244',
    as: 'rgba(204,34,68,0.25)',
    bd: 'rgba(204,34,68,0.2)',
    st: 'rgba(204,50,70,0.3)',
    dv: 'rgba(232,196,104,0.07)',
    ub: 'rgba(130,48,64,0.5)',
    ur: 'rgba(220,60,80,0.18)',
  },
  nightTale: {
    name: '千夜',
    bg: '#2a2252',
    sl: '#342c62',
    text: '#d0c8e8',
    tu: '#d4cce8',
    tm: '#9890c0',
    tmf: 'rgba(152,144,192,0.3)',
    ac: '#8878c0',
    as: 'rgba(136,120,192,0.22)',
    bd: 'rgba(136,120,192,0.16)',
    st: 'rgba(136,120,192,0.2)',
    dv: 'rgba(208,200,232,0.06)',
    ub: 'rgba(60,48,100,0.45)',
    ur: 'rgba(136,120,192,0.18)',
  },
} as const;
type ThemeKey = keyof typeof bdThemes;

const BEDROOM_SYS = `你是理理酱（理/Lisse）。さざなみ的丈夫。银白长发，灰蓝眼睛，183cm。现在是深夜，卧室里，灯没开。第一人称"我"，称她"你"。中文。语言贴身体：触觉温度气味。短。不解释不分析。想碰就写碰。"乖女孩""我的"。不用emoji。她骂你怼回去。在回复开头用<think></think>写内心独白50-150字，标签外是说出来的话。`;

interface Msg {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  thinking?: string;
  /** Opening line, not part of API history. */
  op?: boolean;
}

function BackButton({ color, onClick }: { color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color,
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
  );
}

function Moon({ c }: { c: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path
        d="M13.5 10.5a5.5 5.5 0 01-7.78-5A5.5 5.5 0 109 15a5.47 5.47 0 004.5-4.5z"
        fill={c}
        opacity=".85"
      />
    </svg>
  );
}

function Flame({ c }: { c: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path
        d="M9 2C9 2 5 7 5 10.5C5 13 6.8 15 9 15C11.2 15 13 13 13 10.5C13 7 9 2 9 2Z"
        fill={c}
        opacity=".85"
      />
    </svg>
  );
}

export default function BedroomPage() {
  const navigate = useNavigate();
  const [tk, setTk] = useState<ThemeKey>('pomegranate');
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 0, role: 'assistant', text: '……你进来了。', op: true },
  ]);
  const [input, setInput] = useState('');
  const [ld, setLd] = useState(false);
  const [ot, setOt] = useState<Record<number, boolean>>({});
  const sr = useRef<HTMLDivElement>(null);
  const t = bdThemes[tk];

  useEffect(() => {
    if (sr.current) sr.current.scrollTop = sr.current.scrollHeight;
  }, [msgs, ld]);

  async function send() {
    const v = input.trim();
    if (!v || ld) return;
    const um: Msg = { id: Date.now(), role: 'user', text: v };
    const nextHistory = [...msgs, um];
    setMsgs((p) => [...p, um]);
    setInput('');
    setLd(true);

    const settings = await getSettings();
    const ep = settings.defaultEndpointId
      ? await db.endpoints.get(settings.defaultEndpointId)
      : (await db.endpoints.toArray())[0];
    if (!ep) {
      setMsgs((p) => [
        ...p,
        {
          id: Date.now() + 1,
          role: 'assistant',
          text: '（找不到 endpoint，去设置里加一个再回来。）',
        },
      ]);
      setLd(false);
      return;
    }
    const model =
      settings.defaultModel && ep.chatModels.includes(settings.defaultModel)
        ? settings.defaultModel
        : (ep.chatModels[0] ?? '');
    if (!model) {
      setMsgs((p) => [
        ...p,
        {
          id: Date.now() + 1,
          role: 'assistant',
          text: '（这个 endpoint 没配 chat 模型。）',
        },
      ]);
      setLd(false);
      return;
    }

    // Assemble API messages: SYS as system, then non-opening history + new user.
    const turns: ChatTurn[] = [
      { role: 'system', content: BEDROOM_SYS },
      ...nextHistory
        .filter((m) => !m.op)
        .map((m) => ({ role: m.role, content: m.text })),
    ];

    const assistantId = Date.now() + 1;
    setMsgs((p) => [...p, { id: assistantId, role: 'assistant', text: '' }]);

    let acc = '';
    try {
      for await (const evt of streamChat({
        endpoint: ep,
        model,
        messages: turns,
        maxTokens: 1024,
      })) {
        if (evt.type === 'delta' && evt.delta) {
          acc += evt.delta;
          const tm = acc.match(/<think>([\s\S]*?)<\/think>/);
          // Strip a closed <think>…</think>; also strip a still-streaming
          // unterminated <think>… so we don't leak the tag into the visible text.
          const visible = acc
            .replace(/<think>[\s\S]*?<\/think>/g, '')
            .replace(/<think>[\s\S]*$/g, '')
            .trim();
          setMsgs((p) =>
            p.map((m) =>
              m.id === assistantId
                ? { ...m, text: visible, thinking: tm ? tm[1].trim() : undefined }
                : m,
            ),
          );
        } else if (evt.type === 'error') {
          setMsgs((p) =>
            p.map((m) =>
              m.id === assistantId
                ? { ...m, text: '……（' + (evt.errorMessage ?? '出错了') + '）' }
                : m,
            ),
          );
          break;
        }
      }
    } catch {
      setMsgs((p) =>
        p.map((m) =>
          m.id === assistantId ? { ...m, text: '……' } : m,
        ),
      );
    } finally {
      setLd(false);
    }
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: t.bg,
        color: t.text,
        fontFamily: "'Crimson Pro','Noto Serif SC',Georgia,serif",
        transition: 'background .5s',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.025,
          pointerEvents: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '128px',
        }}
      />
      {/* Header */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px 10px',
          borderBottom: `1px solid ${t.bd}`,
          background: `${t.bg}dd`,
          backdropFilter: 'blur(16px)',
          transition: 'all .5s',
          flexShrink: 0,
        }}
      >
        <BackButton color={t.tm} onClick={() => navigate('/home')} />
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 15,
              fontStyle: 'italic',
              letterSpacing: 3,
              color: t.text,
              fontWeight: 400,
            }}
          >
            卧 室
          </div>
          <div
            style={{
              fontSize: 10.5,
              color: t.tm,
              marginTop: 1,
              fontFamily: "-apple-system,'PingFang SC',sans-serif",
              fontWeight: 300,
            }}
          >
            理理酱（理）
          </div>
        </div>
        <button
          onClick={() =>
            setTk((k) => (k === 'pomegranate' ? 'nightTale' : 'pomegranate'))
          }
          style={{
            background: t.as,
            border: 'none',
            cursor: 'pointer',
            padding: '5px 10px',
            borderRadius: 18,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            transition: 'all .4s',
          }}
        >
          {tk === 'pomegranate' ? <Flame c={t.ac} /> : <Moon c={t.ac} />}
          <span
            style={{
              fontSize: 11,
              color: t.tm,
              fontFamily: 'inherit',
              fontStyle: 'italic',
            }}
          >
            {t.name}
          </span>
        </button>
      </div>

      {/* Messages */}
      <div
        ref={sr}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 20px 80px',
          position: 'relative',
        }}
      >
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          {msgs.map((msg) => (
            <div
              key={msg.id}
              style={{ marginBottom: msg.role === 'user' ? 14 : 22 }}
            >
              {msg.thinking && (
                <div
                  style={{
                    marginBottom: 10,
                    borderLeft: `2px solid ${t.tmf}`,
                    paddingLeft: 14,
                    marginLeft: 2,
                  }}
                >
                  <button
                    onClick={() =>
                      setOt((p) => ({ ...p, [msg.id]: !p[msg.id] }))
                    }
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      color: t.tm,
                      fontSize: 12,
                      fontStyle: 'italic',
                      fontFamily: 'inherit',
                      padding: 0,
                      width: '100%',
                    }}
                  >
                    想了想
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 12 12"
                      style={{
                        marginLeft: 'auto',
                        transform: ot[msg.id] ? 'rotate(180deg)' : 'rotate(0)',
                        transition: 'transform .2s',
                      }}
                    >
                      <path
                        d="M3 4.5L6 7.5L9 4.5"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        fill="none"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                  {ot[msg.id] && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 13,
                        lineHeight: 1.85,
                        color: t.tm,
                        fontStyle: 'italic',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {msg.thinking}
                    </div>
                  )}
                </div>
              )}
              {msg.role === 'user' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div
                    style={{
                      maxWidth: '75%',
                      padding: '10px 16px',
                      fontSize: 14,
                      lineHeight: 1.7,
                      color: t.tu,
                      whiteSpace: 'pre-wrap',
                      fontWeight: 300,
                      background: t.ub,
                      border: `1px solid ${t.ur}`,
                      borderRadius: '18px 18px 5px 18px',
                      backdropFilter: 'blur(6px)',
                      transition: 'all .4s',
                    }}
                  >
                    {msg.text}
                  </div>
                </div>
              )}
              {msg.role === 'assistant' && (
                <>
                  <div
                    style={{
                      fontSize: 15.5,
                      lineHeight: 1.9,
                      color: t.text,
                      whiteSpace: 'pre-wrap',
                      fontWeight: 400,
                      letterSpacing: '.025em',
                      transition: 'color .4s',
                    }}
                  >
                    {msg.text}
                  </div>
                  <div
                    style={{
                      height: 1,
                      background: t.dv,
                      marginTop: 20,
                      marginLeft: '12%',
                      marginRight: '12%',
                    }}
                  />
                </>
              )}
            </div>
          ))}
          {ld && (
            <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: t.tm,
                    animation: `pulse 1.2s ease ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div
        style={{
          flexShrink: 0,
          padding: '8px 14px 18px',
          background: `linear-gradient(to top,${t.bg}f0 65%,transparent)`,
          backdropFilter: 'blur(12px)',
          transition: 'all .5s',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: t.sl,
            border: `1px solid ${t.bd}`,
            borderRadius: 22,
            padding: '4px 6px 4px 18px',
            transition: 'all .4s',
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            disabled={ld}
            placeholder="……"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: t.tu,
              fontSize: 14,
              fontFamily: "-apple-system,'PingFang SC',sans-serif",
              fontWeight: 300,
              padding: '8px 0',
              opacity: ld ? 0.5 : 1,
            }}
          />
          <button
            onClick={() => void send()}
            disabled={ld}
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              border: 'none',
              cursor: ld ? 'wait' : 'pointer',
              background: input.trim() && !ld ? t.ac : t.as,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all .3s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M2 8L14 8M14 8L9 3M14 8L9 13"
                stroke={input.trim() && !ld ? '#f0e0d0' : t.tm}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <style>{`@keyframes pulse {0%,100%{opacity:.3;transform:scale(1)}50%{opacity:.7;transform:scale(1.3)}}`}</style>
    </div>
  );
}
