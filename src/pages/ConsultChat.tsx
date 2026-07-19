import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { type ChatTurn } from '../api';
import ArtifactCard from '../components/ArtifactCard';
import ChatInput from '../components/ChatInput';
import ConsultBackdrop from '../components/ConsultBackdrop';
import ConsultSettingsLine from '../components/ConsultSettingsLine';
import { db, getSettings } from '../db';
import { parseArtifacts } from '../lib/artifacts';
import { CONSULT, CONSULT_SYS } from '../lib/consult-theme';
import { newId } from '../lib/id';
import { setStatusBarColor, resetStatusBar } from '../lib/status-bar';
import { availableTools } from '../lib/tools';
import { runToolLoop } from '../lib/tools/loop';
import type {
  Artifact,
  Attachment,
  Conversation,
  Message,
  ToolCallRecord,
} from '../types';

/**
 * Consult session — immersive curtains, ChatInput at the bottom,
 * hidden settings behind the top-right purple hairline.
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
  artifacts?: Artifact[];
  attachments?: Attachment[];
  toolCalls?: ToolCallRecord[];
  parentId: string | null;
  createdAt: number;
}

export default function ConsultChatPage() {
  const [conv, setConv] = useState<Conversation | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadOrCreateConsultConv().then(setConv);
  }, []);

  useEffect(() => {
    void setStatusBarColor('#ffffff', true);
    return () => {
      void resetStatusBar();
      abortRef.current?.abort();
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
  const [loading, setLoading] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const view: LocalMsg[] = [
    ...(storedMessages ?? []).map(
      (m): LocalMsg => ({
        id: m.id,
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
        artifacts: m.artifacts,
        attachments: m.attachments,
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

  async function handleSend(text: string, attachments: Attachment[]) {
    if (!conv || loading) return;
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;

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
      content: trimmed,
      attachments: attachments.length > 0 ? attachments : undefined,
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

    setLoading(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const history = [...(storedMessages ?? []), userMessage];
    const turns: ChatTurn[] = [
      { role: 'system', content: CONSULT_SYS },
      ...history.map((m) => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments,
      })),
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

    try {
      const result = await runToolLoop({
        endpoint: ep,
        model,
        initialTurns: turns,
        tools,
        ctx: { conversationId: conv.id },
        maxTokens: 4096,
        signal: controller.signal,
        callbacks: {
          onTextDelta: (d) => {
            acc += d;
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

      if (controller.signal.aborted) {
        setStreaming(null);
        setLoading(false);
        return;
      }

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
    } catch (e) {
      if (!controller.signal.aborted) {
        console.error('[consult] send failed', e);
      }
    } finally {
      setStreaming(null);
      setLoading(false);
    }
  }

  function handleAbort() {
    abortRef.current?.abort();
    setStreaming(null);
    setLoading(false);
  }

  return (
    <div
      className="consult-session"
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
      <ConsultSettingsLine />

      {/* Messages — no header chrome */}
      <div
        ref={scrollerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '48px 20px 16px',
          paddingTop: 'calc(48px + env(safe-area-inset-top, 0px))',
          position: 'relative',
          zIndex: 5,
        }}
      >
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          {view.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '20vh 12px 24px',
                opacity: 0.45,
                fontSize: 13,
                color: CONSULT.muted,
                letterSpacing: '0.06em',
                fontWeight: 300,
              }}
            >
              ……
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
                </>
              )}
            </div>
          ))}

          {loading && !streaming?.content && (
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

      {/* Reuse normal chat composer (text + file/image send) */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          background:
            'linear-gradient(to top, rgba(255,255,255,0.72) 55%, transparent)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <ChatInput
          onSend={(text, attachments) => void handleSend(text, attachments)}
          onAbort={handleAbort}
          busy={loading}
          disabled={!conv}
          placeholder="说些什么……"
        />
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
