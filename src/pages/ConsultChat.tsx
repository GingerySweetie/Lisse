import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { FolderOpen, ImageIcon } from 'lucide-react';
import { type ChatTurn } from '../api';
import ArtifactCard from '../components/ArtifactCard';
import ConsultBackdrop from '../components/ConsultBackdrop';
import WallpaperPicker from '../components/WallpaperPicker';
import { db, getSettings, saveSettings } from '../db';
import { parseArtifacts } from '../lib/artifacts';
import { CONSULT, CONSULT_SYS } from '../lib/consult-theme';
import { newId } from '../lib/id';
import { setStatusBarColor, resetStatusBar } from '../lib/status-bar';
import { availableTools } from '../lib/tools';
import { runToolLoop } from '../lib/tools/loop';
import type { Artifact, Conversation, Message, ToolCallRecord } from '../types';

/**
 * Psychoanalysis consultation session — singleton conversation (room='consult').
 * Light purple/white "curtains closed" atmosphere; artifacts can be saved
 * into custom collections from each ArtifactCard.
 */

async function loadOrCreateConsultConv(): Promise<Conversation> {
  const existing = await db.conversations.where({ room: 'consult' }).first();
  if (existing) return existing;
  const now = Date.now();
  const conv: Conversation = {
    id: newId(),
    title: '精神分析 · 咨询室',
    currentLeafId: null,
    room: 'consult',
    source: 'native',
    accentColor: CONSULT.accent,
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
  artifacts?: Artifact[];
  toolCalls?: ToolCallRecord[];
  parentId: string | null;
  createdAt: number;
}

export default function ConsultChatPage() {
  const navigate = useNavigate();
  const [conv, setConv] = useState<Conversation | null>(null);

  useEffect(() => {
    loadOrCreateConsultConv().then(setConv);
  }, []);

  useEffect(() => {
    void setStatusBarColor('#faf8fc', true);
    return () => {
      void resetStatusBar();
    };
  }, []);

  const storedMessages = useLiveQuery(
    () =>
      conv
        ? db.messages.where({ conversationId: conv.id }).sortBy('createdAt')
        : [],
    [conv?.id],
    [],
  );

  const [streaming, setStreaming] = useState<LocalMsg | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const settings = useLiveQuery(() => getSettings(), [], null);
  const wallpaper = settings?.consultWallpaper ?? null;

  const view: LocalMsg[] = [
    ...(storedMessages ?? []).map(
      (m): LocalMsg => ({
        id: m.id,
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
        thinking: m.thinking,
        artifacts: m.artifacts,
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
  }, [view.length, streaming?.content]);

  async function handleSend() {
    if (!conv) return;
    const text = input.trim();
    if (!text || loading) return;

    const settings = await getSettings();
    const ep = settings.defaultEndpointId
      ? await db.endpoints.get(settings.defaultEndpointId)
      : (await db.endpoints.toArray())[0];
    if (!ep) {
      alert('先去设置里加一个 endpoint');
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

    const history = [...(storedMessages ?? []), userMessage];
    const turns: ChatTurn[] = [
      { role: 'system', content: CONSULT_SYS },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];

    const assistantId = newId();
    const streamingMsg: LocalMsg = {
      id: assistantId,
      role: 'assistant',
      content: '',
      parentId: userMessage.id,
      createdAt: Date.now() + 1,
    };
    setStreaming(streamingMsg);

    const tools = settings.toolsEnabled
      ? await availableTools({ conversationId: conv.id })
      : [];

    let acc = '';
    let lastVisible = '';
    const liveToolCalls: ToolCallRecord[] = [];

    const result = await runToolLoop({
      endpoint: ep,
      model,
      initialTurns: turns,
      tools,
      ctx: { conversationId: conv.id },
      maxTokens: 4096,
      callbacks: {
        onTextDelta: (d) => {
          acc += d;
          // Strip file/choice tags while streaming so raw markup doesn't flash.
          lastVisible = acc
            .replace(/\[file\s+name=[^\]]+\][\s\S]*?\[\/file\]/g, '')
            .replace(/\[file\s+name=[^\]]+\][\s\S]*$/g, '')
            .replace(/\[choices\][\s\S]*?\[\/choices\]/g, '')
            .replace(/\[choices\][\s\S]*$/g, '')
            .trim();
          setStreaming({
            ...streamingMsg,
            content: lastVisible,
            toolCalls: [...liveToolCalls],
          });
        },
        onToolCallResolved: (c) => {
          liveToolCalls.push(c);
          setStreaming({
            ...streamingMsg,
            content: lastVisible,
            toolCalls: [...liveToolCalls],
          });
        },
      },
    });

    const { cleanText, artifacts, choices } = parseArtifacts(acc || lastVisible);
    const errored = result.errored;
    const errorMessage = result.errorMessage;

    const finalAssistant: Message = {
      id: assistantId,
      conversationId: conv.id,
      parentId: userMessage.id,
      role: 'assistant',
      content:
        cleanText ||
        (errored ? '……（' + (errorMessage ?? '出错了') + '）' : '……'),
      artifacts: artifacts.length > 0 ? artifacts : undefined,
      choices: choices.length > 0 ? choices : undefined,
      status: errored ? 'error' : 'done',
      errorMessage,
      endpointId: ep.id,
      model,
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

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: CONSULT.bg,
        color: CONSULT.text,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: CONSULT.fontBody,
      }}
    >
      <ConsultBackdrop />

      {/* Header */}
      <header
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px 10px',
          paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
          borderBottom: `1px solid ${CONSULT.border}`,
          background: 'rgba(250, 248, 252, 0.78)',
          backdropFilter: 'blur(14px)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => navigate('/consult')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: CONSULT.muted,
              padding: 4,
              display: 'flex',
            }}
            aria-label="返回咨询室"
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
          <div style={{ lineHeight: 1.15 }}>
            <div
              style={{
                fontFamily: CONSULT.fontDisplay,
                fontSize: 17,
                letterSpacing: '0.18em',
                color: CONSULT.accent,
              }}
            >
              咨询室
            </div>
            <div
              style={{
                fontSize: 10.5,
                color: CONSULT.faint,
                marginTop: 2,
                letterSpacing: '0.04em',
              }}
            >
              {wallpaper ? '自定义壁纸 · 会谈中' : '窗帘拉着 · 会谈中'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
          <button
            type="button"
            onClick={() => setWallpaperOpen((v) => !v)}
            style={{
              background: wallpaperOpen || wallpaper ? CONSULT.accentSoft : 'transparent',
              border: `1px solid ${CONSULT.border}`,
              cursor: 'pointer',
              width: 32,
              height: 32,
              borderRadius: 8,
              color: CONSULT.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="更换壁纸"
            title="更换壁纸"
          >
            <ImageIcon size={15} />
          </button>
          <button
            type="button"
            onClick={() => navigate('/consult/collections')}
            style={{
              background: CONSULT.accentSoft,
              border: `1px solid ${CONSULT.border}`,
              cursor: 'pointer',
              width: 32,
              height: 32,
              borderRadius: 8,
              color: CONSULT.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="产物合集"
            title="产物合集"
          >
            <FolderOpen size={15} />
          </button>
          {wallpaperOpen && (
            <div
              style={{
                position: 'absolute',
                top: 38,
                right: 0,
                zIndex: 40,
                background: 'rgba(255,255,255,0.96)',
                border: `1px solid ${CONSULT.border}`,
                borderRadius: 12,
                padding: 10,
                boxShadow: CONSULT.shadow,
                backdropFilter: 'blur(12px)',
              }}
            >
              <WallpaperPicker
                value={wallpaper}
                onChange={(next) => {
                  void saveSettings({ consultWallpaper: next });
                  if (next) setWallpaperOpen(false);
                }}
              />
            </div>
          )}
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '28px 20px 88px',
          position: 'relative',
          zIndex: 5,
        }}
      >
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          {view.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '56px 12px 24px',
                animation: 'consultMsgIn 0.8s ease both',
              }}
            >
              <div
                style={{
                  fontFamily: CONSULT.fontDisplay,
                  fontSize: 22,
                  letterSpacing: '0.14em',
                  color: CONSULT.accent,
                  marginBottom: 12,
                }}
              >
                ……
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: CONSULT.muted,
                  lineHeight: 1.8,
                  fontWeight: 300,
                }}
              >
                窗帘拉着。你想从哪里开始？
              </p>
            </div>
          )}

          {view.map((msg) => (
            <div
              key={msg.id}
              style={{
                marginBottom: msg.role === 'user' ? 16 : 26,
                animation: 'consultMsgIn 0.45s ease both',
              }}
            >
              {msg.role === 'user' ? (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div
                    style={{
                      maxWidth: '78%',
                      padding: '10px 16px',
                      fontSize: 14,
                      lineHeight: 1.75,
                      color: CONSULT.text,
                      whiteSpace: 'pre-wrap',
                      fontWeight: 300,
                      background: CONSULT.userBubble,
                      border: `1px solid ${CONSULT.userBorder}`,
                      borderRadius: '16px 16px 4px 16px',
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      fontSize: 15,
                      lineHeight: 1.9,
                      color: CONSULT.text,
                      whiteSpace: 'pre-wrap',
                      fontWeight: 350,
                      letterSpacing: '0.02em',
                    }}
                  >
                    {msg.content}
                  </div>
                  {msg.artifacts && msg.artifacts.length > 0 && (
                    <div className="artifact-list" style={{ marginTop: 12 }}>
                      {msg.artifacts.map((a) => (
                        <ArtifactCard
                          key={a.id}
                          artifact={a}
                          sourceConversationId={conv?.id}
                          sourceMessageId={msg.id}
                        />
                      ))}
                    </div>
                  )}
                  <div
                    style={{
                      height: 1,
                      background: CONSULT.border,
                      marginTop: 20,
                      marginLeft: '18%',
                      marginRight: '18%',
                    }}
                  />
                </>
              )}
            </div>
          ))}

          {loading && (
            <div style={{ marginTop: 8, display: 'flex', gap: 5 }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: CONSULT.accent,
                    opacity: 0.45,
                    animation: `consultPulse 1.2s ease ${i * 0.2}s infinite`,
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
          padding: '8px 14px',
          paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
          background:
            'linear-gradient(to top, rgba(250,248,252,0.95) 60%, transparent)',
          position: 'relative',
          zIndex: 5,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: CONSULT.inputBg,
            border: `1px solid ${CONSULT.borderStrong}`,
            borderRadius: 20,
            padding: '4px 6px 4px 18px',
            boxShadow: CONSULT.shadow,
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
            placeholder="说些什么……"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: CONSULT.text,
              fontSize: 14,
              fontFamily: CONSULT.fontBody,
              fontWeight: 300,
              padding: '8px 0',
              opacity: loading ? 0.5 : 1,
            }}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={loading}
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              border: 'none',
              cursor: loading ? 'wait' : 'pointer',
              background:
                input.trim() && !loading ? CONSULT.accent : CONSULT.accentSoft,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.25s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M2 8L14 8M14 8L9 3M14 8L9 13"
                stroke={input.trim() && !loading ? '#faf8fc' : CONSULT.muted}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes consultPulse {
          0%, 100% { opacity: 0.25; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.25); }
        }
        @keyframes consultMsgIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
