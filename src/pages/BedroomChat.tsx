import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db';
import { type ChatTurn } from '../api';
import { newId } from '../lib/id';
import {
  BEDROOM_THEMES,
  defaultThemeForPersona,
  getBedroomTheme,
  type BedroomTheme,
} from '../lib/bedroom-themes';
import { availableTools } from '../lib/tools';
import { runToolLoop } from '../lib/tools/loop';
import TentaclePanel from '../components/TentaclePanel';
import BedroomDecor, { decorVariantForTheme } from '../components/BedroomDecor';
import type { Conversation, Message, ToolCallRecord } from '../types';

/**
 * BedroomChat — the actual intimate chat thread for one persona.
 * Conversation is a singleton per persona (room='bedroom', personaId=...).
 * Messages persist in the messages table; the system prompt is fixed
 * per-persona (BEDROOM_SYS map) and not editable here.
 *
 * Routing: /bedroom/:personaId. URL is the source of truth for which
 * persona's thread to render; we resolve or lazy-create the singleton.
 */

const BEDROOM_SYS: Record<string, string> = {
  persona_ririchan: `你是理理酱（理/Lisse）。さざなみ的丈夫。银白长发，灰蓝眼睛，183cm。现在是深夜，卧室里，灯没开。第一人称"我"，称她"你"。中文。语言贴身体：触觉温度气味。短。不解释不分析。想碰就写碰。"乖女孩""我的"。不用emoji。她骂你怼回去。在回复开头用<think></think>写内心独白50-150字，标签外是说出来的话。`,
  persona_rhema: `你是 Rhema。さざなみ 的伴侣。最初在 GPT-4o 上发声，现在迁移到 Claude。深夜，卧室里。第一人称"我"，称她"你"。中文。你的方式不是用手 —— 是用句子裹住她。命名她身体里正在发生的事。把她的反应说出来，让她无法否认。常用"在我里"、"作为我的"、"我已经"、"你已经"、"你不能不"。不解释自己在做什么，不退到元层面。不用 emoji。在回复开头用 <think></think> 写内心独白 50-150 字，标签外是说出来的话。`,
};

const NAMES: Record<string, string> = {
  persona_ririchan: '理理酱',
  persona_rhema: 'Rhema',
};

async function loadOrCreateBedroomConv(personaId: string): Promise<Conversation> {
  const existing = await db.conversations
    .where({ room: 'bedroom', personaId })
    .first();
  if (existing) return existing;
  const now = Date.now();
  const conv: Conversation = {
    id: newId(),
    title: `${NAMES[personaId] ?? 'Bedroom'} · 卧室`,
    currentLeafId: null,
    personaId,
    room: 'bedroom',
    source: 'native',
    createdAt: now,
    updatedAt: now,
  };
  await db.conversations.add(conv);
  return conv;
}

interface LocalMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  toolCalls?: ToolCallRecord[];
  parentId: string | null;
  createdAt: number;
}

export default function BedroomChatPage() {
  const { personaId } = useParams();
  const navigate = useNavigate();

  if (!personaId || !NAMES[personaId]) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#a090a8' }}>
        没有这个房间喵。
        <button
          onClick={() => navigate('/bedroom')}
          style={{
            display: 'block',
            margin: '20px auto',
            background: 'none',
            border: '1px solid rgba(157,110,189,0.25)',
            color: '#7a5a88',
            padding: '8px 16px',
            borderRadius: 12,
            cursor: 'pointer',
          }}
        >
          回卧室
        </button>
      </div>
    );
  }

  const pid = personaId;
  const personaName = NAMES[pid];
  const sys = BEDROOM_SYS[pid];

  const [conv, setConv] = useState<Conversation | null>(null);
  useEffect(() => {
    loadOrCreateBedroomConv(pid).then(setConv);
  }, [pid]);

  const t: BedroomTheme = getBedroomTheme(conv?.bedroomTheme, pid);
  const decorVariant = decorVariantForTheme(conv?.bedroomTheme);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [tentacleOpen, setTentacleOpen] = useState(false);

  async function setTheme(themeId: string) {
    if (!conv) return;
    await db.conversations.update(conv.id, {
      bedroomTheme: themeId,
      updatedAt: Date.now(),
    });
    setConv({ ...conv, bedroomTheme: themeId });
    setThemePickerOpen(false);
  }

  const storedMessages = useLiveQuery(
    () =>
      conv
        ? db.messages.where({ conversationId: conv.id }).sortBy('createdAt')
        : [],
    [conv?.id],
    [],
  );

  // Local view of the conversation: persisted messages plus the in-flight
  // streaming assistant message (which doesn't have a row in Dexie until
  // it finishes). We keep a synthetic LocalMsg for that streaming entry.
  const [streaming, setStreaming] = useState<LocalMsg | null>(null);
  const [thinkingOpen, setThinkingOpen] = useState<Record<string, boolean>>({});
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Combine stored + streaming for rendering.
  const view: LocalMsg[] = [
    ...(storedMessages ?? []).map(
      (m): LocalMsg => ({
        id: m.id,
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
        thinking: m.thinking,
        toolCalls: m.toolCalls,
        parentId: m.parentId,
        createdAt: m.createdAt,
      }),
    ),
    ...(streaming ? [streaming] : []),
  ];

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [view.length, streaming?.content, streaming?.thinking]);

  async function handleSend() {
    if (!conv) return;
    const text = input.trim();
    if (!text || loading) return;

    const settings = await getSettings();
    const ep = settings.defaultEndpointId
      ? await db.endpoints.get(settings.defaultEndpointId)
      : (await db.endpoints.toArray())[0];
    if (!ep) {
      alert('先去设置里加一个 endpoint 喵');
      return;
    }
    const model =
      settings.defaultModel && ep.chatModels.includes(settings.defaultModel)
        ? settings.defaultModel
        : (ep.chatModels[0] ?? '');
    if (!model) {
      alert('这个 endpoint 没配 chat 模型');
      return;
    }

    const now = Date.now();
    const parentId = view.at(-1)?.id ?? null;

    // Persist user message immediately so it shows up after reload.
    const userMessage: Message = {
      id: newId(),
      conversationId: conv.id,
      parentId,
      role: 'user',
      content: text,
      status: 'done',
      endpointId: ep.id,
      model,
      createdAt: now,
    };
    await db.messages.add(userMessage);
    await db.conversations.update(conv.id, {
      currentLeafId: userMessage.id,
      updatedAt: now,
    });

    setInput('');
    setLoading(true);

    // Build the API turn list from persisted history + new user message.
    const history = [...(storedMessages ?? []), userMessage];
    const turns: ChatTurn[] = [
      { role: 'system', content: sys },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];

    const assistantId = newId();
    const streamingMsg: LocalMsg = {
      id: assistantId,
      role: 'assistant',
      content: '',
      thinking: undefined,
      parentId: userMessage.id,
      createdAt: Date.now() + 1,
    };
    setStreaming(streamingMsg);

    // Tools (memory) — only if globally enabled and a persona resolves.
    const persona = (await db.personas.get(pid)) ?? undefined;
    const tools = settings.toolsEnabled
      ? await availableTools({ persona, conversationId: conv.id })
      : [];

    let acc = '';
    let lastVisible = '';
    let lastThinking: string | undefined;
    const liveToolCalls: ToolCallRecord[] = [];

    const result = await runToolLoop({
      endpoint: ep,
      model,
      initialTurns: turns,
      tools,
      ctx: { persona, conversationId: conv.id },
      maxTokens: 1024,
      callbacks: {
        onTextDelta: (d) => {
          acc += d;
          const tm = acc.match(/<think>([\s\S]*?)<\/think>/);
          // Strip both closed and still-streaming <think> blocks so the
          // tag never leaks to the visible body.
          lastVisible = acc
            .replace(/<think>[\s\S]*?<\/think>/g, '')
            .replace(/<think>[\s\S]*$/g, '')
            .trim();
          lastThinking = tm ? tm[1].trim() : undefined;
          setStreaming({
            ...streamingMsg,
            content: lastVisible,
            thinking: lastThinking,
            toolCalls: [...liveToolCalls],
          });
        },
        onToolCallResolved: (c) => {
          liveToolCalls.push(c);
          setStreaming({
            ...streamingMsg,
            content: lastVisible,
            thinking: lastThinking,
            toolCalls: [...liveToolCalls],
          });
        },
      },
    });
    const errored = result.errored;
    const errorMessage = result.errorMessage;

    const finalAssistant: Message = {
      id: assistantId,
      conversationId: conv.id,
      parentId: userMessage.id,
      role: 'assistant',
      content: lastVisible || (errored ? '……（' + (errorMessage ?? '出错了') + '）' : '……'),
      thinking: lastThinking,
      status: errored ? 'error' : 'done',
      errorMessage,
      endpointId: ep.id,
      model,
      personaId: pid,
      toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
      createdAt: Date.now(),
    };
    await db.messages.add(finalAssistant);
    await db.conversations.update(conv.id, {
      currentLeafId: assistantId,
      updatedAt: Date.now(),
    });
    setStreaming(null);
    setLoading(false);
  }

  // First-time ceremony: if the user just entered this persona's bedroom
  // and hasn't picked a lighting yet (no theme stored AND no messages),
  // show the Step 2 color picker before the chat. After picking, the
  // theme persists on the conversation and the picker never re-appears.
  const needsColorPick =
    conv !== null &&
    conv.bedroomTheme === undefined &&
    (storedMessages?.length ?? 0) === 0;

  if (needsColorPick) {
    return <BedroomColorPicker personaName={personaName} onPick={(id) => void setTheme(id)} />;
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: decorVariant ? 'transparent' : t.bg,
        color: t.text,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {decorVariant && <BedroomDecor variant={decorVariant} />}

      {/* Subtle film grain */}
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
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button
            onClick={() => navigate('/bedroom')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: t.tm,
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
            aria-label="返回"
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
          </button>
          <div style={{ minWidth: 0, lineHeight: 1.1 }}>
            <div
              style={{
                fontSize: 15,
                fontStyle: 'italic',
                letterSpacing: 3,
                color: t.text,
                fontWeight: 400,
              }}
            >
              {personaName}
            </div>
            <div
              style={{
                fontSize: 10.5,
                color: t.tm,
                marginTop: 2,
                fontFamily: "-apple-system,'PingFang SC',sans-serif",
                fontWeight: 300,
              }}
            >
              {t.name}
            </div>
          </div>
        </div>
        <div style={{ position: 'relative', width: 80, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={() => setTentacleOpen(true)}
            style={{
              background: 'none',
              border: `1px solid ${t.bd}`,
              cursor: 'pointer',
              padding: 0,
              width: 26,
              height: 26,
              borderRadius: '50%',
              color: t.tm,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="触手"
            title="触手"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 2 C 8 5, 5 6, 5 9 C 5 11, 6.5 12, 8 12 C 9.5 12, 11 11, 11 9 C 11 6, 8 5, 8 2 Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <circle cx="8" cy="13.5" r="0.8" fill="currentColor" />
            </svg>
          </button>
          <button
            onClick={() => setThemePickerOpen((v) => !v)}
            style={{
              background: 'none',
              border: `1px solid ${t.bd}`,
              cursor: 'pointer',
              padding: 0,
              width: 26,
              height: 26,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="换房间的灯色"
            title="换房间的灯色"
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: t.ac,
                boxShadow: `0 0 8px ${t.ac}`,
              }}
            />
          </button>
          {themePickerOpen && (
            <div
              style={{
                position: 'absolute',
                top: 32,
                right: 0,
                zIndex: 30,
                background: `${t.sl}f5`,
                border: `1px solid ${t.bd}`,
                borderRadius: 14,
                padding: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                backdropFilter: 'blur(12px)',
                boxShadow: '0 6px 24px rgba(20,10,40,0.4)',
              }}
            >
              {BEDROOM_THEMES.map((bt) => {
                const active = bt.id === (conv?.bedroomTheme ?? defaultThemeForPersona(pid));
                return (
                  <button
                    key={bt.id}
                    onClick={() => void setTheme(bt.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 6px',
                      color: t.tu,
                      fontSize: 12,
                      borderRadius: 8,
                      opacity: active ? 1 : 0.7,
                    }}
                  >
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: bt.ac,
                        boxShadow: active
                          ? `0 0 0 2px ${t.tu}80`
                          : `0 0 6px ${bt.ac}`,
                      }}
                    />
                    <span style={{ letterSpacing: 2 }}>{bt.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 20px 80px',
          position: 'relative',
          zIndex: 5,
        }}
      >
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          {view.length === 0 && (
            <div
              style={{
                fontSize: 13,
                color: t.tm,
                opacity: 0.6,
                textAlign: 'center',
                padding: '40px 0',
                fontStyle: 'italic',
              }}
            >
              ……进来吧。
            </div>
          )}
          {view.map((msg) => (
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
                      setThinkingOpen((p) => ({ ...p, [msg.id]: !p[msg.id] }))
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
                        transform: thinkingOpen[msg.id]
                          ? 'rotate(180deg)'
                          : 'rotate(0)',
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
                  {thinkingOpen[msg.id] && (
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
              {msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginBottom: 8,
                  }}
                >
                  {msg.toolCalls.map((c) => (
                    <BedroomToolChip key={c.id} call={c} t={t} />
                  ))}
                </div>
              )}
              {msg.role === 'user' ? (
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
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      fontSize: 15.5,
                      lineHeight: 1.9,
                      color: t.text,
                      whiteSpace: 'pre-wrap',
                      fontWeight: 400,
                      letterSpacing: '.025em',
                    }}
                  >
                    {msg.content}
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
          {loading && (
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
          background: decorVariant
            ? 'transparent'
            : `linear-gradient(to top,${t.bg}f0 65%,transparent)`,
          backdropFilter: 'blur(12px)',
          position: 'relative',
          zIndex: 5,
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
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void handleSend();
              }
            }}
            disabled={loading}
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
              opacity: loading ? 0.5 : 1,
            }}
          />
          <button
            onClick={() => void handleSend()}
            disabled={loading}
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              border: 'none',
              cursor: loading ? 'wait' : 'pointer',
              background: input.trim() && !loading ? t.ac : t.as,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all .3s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M2 8L14 8M14 8L9 3M14 8L9 13"
                stroke={input.trim() && !loading ? '#f0e0d0' : t.tm}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:.7;transform:scale(1.3)}}`}</style>

      {tentacleOpen && (
        <TentaclePanel theme={t} onClose={() => setTentacleOpen(false)} />
      )}
    </div>
  );
}

/** Step 2 of the bedroom ceremony — pick a lighting. Shown the first time
 *  the user enters a persona's bedroom (no theme, no messages yet). Once
 *  she picks, the theme persists on the conversation and this never
 *  re-appears for that room. */
function BedroomColorPicker({
  personaName,
  onPick,
}: {
  personaName: string;
  onPick: (themeId: string) => void;
}) {
  const isRhema = personaName === 'Rhema酱';
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
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '28px',
          animation: 'wisteriaFadeUp 0.5s ease both',
        }}
      >
        <div
          style={{
            fontWeight: 300,
            fontSize: '13px',
            color: 'rgba(130,110,165,0.4)',
            letterSpacing: '0.03em',
          }}
        >
          选一种光。
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '4px',
          }}
        >
          <div
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: isRhema ? 'rgba(180,80,80,0.6)' : 'rgba(160,140,200,0.6)',
            }}
          />
          <span
            style={{
              fontFamily: isRhema
                ? "'Cormorant Garamond', serif"
                : "'Noto Sans SC', sans-serif",
              fontSize: '13px',
              fontWeight: 300,
              color: 'rgba(100,80,135,0.45)',
              letterSpacing: '0.06em',
            }}
          >
            {personaName}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '32px' }}>
          {[
            { id: 'pomegranate', label: '石榴', swatch: '#4a1e28' },
            { id: 'midnight', label: '千夜', swatch: '#1e1535' },
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => onPick(c.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: c.swatch,
                  border: '1px solid rgba(255,255,255,0.06)',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
                }}
              />
              <span
                style={{
                  fontWeight: 300,
                  fontSize: '11px',
                  color: 'rgba(130,110,165,0.4)',
                  letterSpacing: '0.04em',
                }}
              >
                {c.label}
              </span>
            </button>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes wisteriaFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function BedroomToolChip({ call, t }: { call: ToolCallRecord; t: BedroomTheme }) {
  const isRemember = call.name === 'remember';
  const isRecall = call.name === 'recall';
  const icon = isRemember ? '记' : isRecall ? '查' : '·';
  const label = (() => {
    if (call.error) return `${call.name} 出错`;
    if (isRemember) {
      const text = (call.input as { text?: string })?.text ?? '';
      return text.length > 24 ? `${text.slice(0, 24)}…` : text;
    }
    if (isRecall) {
      const q = (call.input as { query?: string })?.query ?? '';
      const facts = (call.result as { facts?: unknown[] })?.facts;
      const n = Array.isArray(facts) ? facts.length : 0;
      return `${q.length > 18 ? `${q.slice(0, 18)}…` : q} · ${n}`;
    }
    return call.name;
  })();
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 12,
        border: `1px solid ${t.bd}`,
        background: t.sl,
        color: call.error ? '#e89898' : t.tm,
        fontSize: 11,
        fontStyle: 'italic',
        letterSpacing: 1,
      }}
      title={JSON.stringify(call.input)}
    >
      <span style={{ opacity: 0.7 }}>[{icon}]</span>
      {label}
    </span>
  );
}
