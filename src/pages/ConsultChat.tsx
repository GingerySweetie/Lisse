import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { type ChatTurn } from '../api';
import { thinkingOptsFromEndpoint } from '../api/thinking';
import ChatInput from '../components/ChatInput';
import ConsultBackdrop from '../components/ConsultBackdrop';
import ConsultConversationList from '../components/ConsultConversationList';
import ConsultSettingsLine from '../components/ConsultSettingsLine';
import MessageBubble from '../components/MessageBubble';
import { db, getSettings, saveSettings } from '../db';
import { parseArtifacts } from '../lib/artifacts';
import {
  createConsultConversation,
  deriveConsultTitle,
  ensureActiveConsultConversation,
  isDefaultConsultTitle,
  setActiveConsultConversationId,
} from '../lib/consult-conversations';
import { CONSULT, resolveConsultSystemPrompt } from '../lib/consult-theme';
import { newId } from '../lib/id';
import { setStatusBarColor, resetStatusBar } from '../lib/status-bar';
import { availableTools } from '../lib/tools';
import { runToolLoop } from '../lib/tools/loop';
import type { Attachment, Message, ToolCallRecord } from '../types';

/**
 * Consult session — immersive curtains, ChatInput at the bottom,
 * hidden settings behind the top-right purple hairline.
 * Reuses MessageBubble for markdown / cache hit / thinking chain.
 */

export default function ConsultChatPage() {
  const [convId, setConvId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    ensureActiveConsultConversation().then((c) => setConvId(c.id));
  }, []);

  useEffect(() => {
    void setStatusBarColor('#ffffff', true);
    return () => {
      void resetStatusBar();
      abortRef.current?.abort();
    };
  }, []);

  const conv =
    useLiveQuery(
      () => (convId ? db.conversations.get(convId) : undefined),
      [convId],
      undefined,
    ) ?? null;

  const settings = useLiveQuery(() => getSettings(), [], null);
  const endpoints = useLiveQuery(() => db.endpoints.toArray(), [], []);
  const personas = useLiveQuery(() => db.personas.toArray(), [], []);
  const styles = useLiveQuery(() => db.writingStyles.toArray(), [], []);

  const [endpointId, setEndpointId] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [styleId, setStyleId] = useState<string | null>(null);

  useEffect(() => {
    if (!endpoints || !settings) return;
    const fromConv = conv?.defaultEndpointId
      ? endpoints.find((e) => e.id === conv.defaultEndpointId)
      : undefined;
    const fromSettings = settings.defaultEndpointId
      ? endpoints.find((e) => e.id === settings.defaultEndpointId)
      : undefined;
    const ep = fromConv ?? fromSettings ?? endpoints[0];
    if (!ep) {
      setEndpointId(null);
      setModel(null);
      return;
    }
    const m =
      conv?.defaultModel && ep.chatModels.includes(conv.defaultModel)
        ? conv.defaultModel
        : settings.defaultModel && ep.chatModels.includes(settings.defaultModel)
          ? settings.defaultModel
          : (ep.chatModels[0] ?? null);
    setEndpointId(ep.id);
    setModel(m);
  }, [endpoints, settings, conv]);

  useEffect(() => {
    if (!settings) return;
    setPersonaId(conv?.personaId ?? settings.defaultPersonaId);
  }, [settings, conv]);

  useEffect(() => {
    if (!settings) return;
    // Consult: prefer this session's style, then global default.
    setStyleId(conv?.styleId ?? settings.defaultStyleId);
  }, [settings, conv?.styleId]);

  const storedMessages = useLiveQuery(
    () =>
      conv
        ? db.messages.where({ conversationId: conv.id }).sortBy('createdAt')
        : [],
    [conv?.id],
    [],
  );

  const [streamingMsg, setStreamingMsg] = useState<Message | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  function clearStreaming() {
    setStreamingMsg(null);
    setStreamingText('');
    setStreamingThinking('');
  }

  function switchConversation(id: string) {
    abortRef.current?.abort();
    clearStreaming();
    setLoading(false);
    setActiveConsultConversationId(id);
    setConvId(id);
  }

  async function handleNewConversation() {
    const fresh = await createConsultConversation({ copyFrom: conv });
    switchConversation(fresh.id);
  }

  const persona = personaId
    ? personas?.find((p) => p.id === personaId)
    : undefined;
  const style = styleId ? styles?.find((s) => s.id === styleId) : undefined;

  const view: Message[] = [
    ...(storedMessages ?? []),
    ...(streamingMsg &&
    !(storedMessages ?? []).some((m) => m.id === streamingMsg.id)
      ? [streamingMsg]
      : []),
  ];

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [view.length, streamingText, streamingThinking]);

  async function handleSend(text: string, attachments: Attachment[]) {
    if (!conv || loading) return;
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;

    const liveSettings = settings ?? (await getSettings());
    const ep = endpointId
      ? await db.endpoints.get(endpointId)
      : liveSettings.defaultEndpointId
        ? await db.endpoints.get(liveSettings.defaultEndpointId)
        : (await db.endpoints.toArray())[0];
    if (!ep) {
      alert('先去设置里加一个 endpoint');
      return;
    }
    const sendModel =
      (model && ep.chatModels.includes(model) ? model : null) ??
      (liveSettings.defaultModel &&
      ep.chatModels.includes(liveSettings.defaultModel)
        ? liveSettings.defaultModel
        : null) ??
      ep.chatModels[0] ??
      '';
    if (!sendModel) {
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
      model: sendModel,
      createdAt: now,
    };
    await db.messages.add(userMessage);
    const titlePatch =
      isDefaultConsultTitle(conv.title) && trimmed
        ? { title: deriveConsultTitle(trimmed) }
        : {};
    await db.conversations.update(conv.id, {
      currentLeafId: userMessage.id,
      defaultEndpointId: ep.id,
      defaultModel: sendModel,
      personaId: personaId ?? undefined,
      styleId: styleId ?? conv.styleId ?? liveSettings.defaultStyleId ?? undefined,
      updatedAt: now,
      ...titlePatch,
    });

    setLoading(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const history = [...(storedMessages ?? []), userMessage];
    // Resolve style fresh each send so picker / settings changes always apply.
    const activeStyleId =
      styleId ?? conv.styleId ?? liveSettings.defaultStyleId ?? null;
    const activeStyle = activeStyleId
      ? ((await db.writingStyles.get(activeStyleId)) ??
        styles?.find((s) => s.id === activeStyleId))
      : undefined;

    const roomPrompt = resolveConsultSystemPrompt(
      liveSettings.consultSystemPrompt,
    );
    const systemTurns: ChatTurn[] = [{ role: 'system', content: roomPrompt }];
    if (persona?.systemPrompt?.trim()) {
      systemTurns.push({
        role: 'system',
        content:
          `# 伴侣人格（咨询室里的「你」）\n` +
          `以下是你作为具体伴侣／医生的身份与习惯；与房间用途冲突时，以创伤看见与同意边界为先。\n\n` +
          persona.systemPrompt.trim(),
      });
    }
    // Writing style must win on tone every consult turn (room/persona cannot
    // dilute delivery). Mirror normal chat's BP2 + per-turn style_reminder.
    if (activeStyle?.prompt?.trim()) {
      systemTurns.push({
        role: 'system',
        content:
          `# 写作风格\n` +
          `【最高优先级 · 每轮强制】以下条款覆盖房间提示词与人设中任何关于语气、口吻、` +
          `说话方式、用词习惯、句式节奏的描述；必须严格遵守，不得稀释或覆盖。\n\n` +
          activeStyle.prompt.trim(),
      });
    }
    const turns: ChatTurn[] = [
      ...systemTurns,
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        attachments: m.attachments,
      })),
    ];
    if (activeStyle?.prompt?.trim()) {
      const last = turns[turns.length - 1];
      const nudge =
        '<style_reminder>按系统「# 写作风格」作答；本房间每一轮都必须遵守。</style_reminder>';
      if (last?.role === 'user') {
        turns[turns.length - 1] = {
          ...last,
          content: `${last.content}\n\n${nudge}`,
        };
      } else {
        turns.push({ role: 'user', content: nudge });
      }
    }

    const assistantId = newId();
    const draftAssistant: Message = {
      id: assistantId,
      conversationId: conv.id,
      parentId: userMessage.id,
      role: 'assistant',
      content: '',
      status: 'streaming',
      endpointId: ep.id,
      model: sendModel,
      createdAt: Date.now() + 1,
    };
    setStreamingMsg(draftAssistant);
    setStreamingText('');
    setStreamingThinking('');

    const tools = liveSettings.toolsEnabled
      ? await availableTools({ conversationId: conv.id })
      : [];

    let acc = '';
    let lastVisible = '';
    let thinkingAcc = '';
    const liveToolCalls: ToolCallRecord[] = [];
    const thinking = thinkingOptsFromEndpoint(ep);

    try {
      const result = await runToolLoop({
        endpoint: ep,
        model: sendModel,
        initialTurns: turns,
        tools,
        ctx: { conversationId: conv.id },
        maxTokens: 4096,
        signal: controller.signal,
        thinking,
        callbacks: {
          onTextDelta: (d) => {
            acc += d;
            lastVisible = acc
              .replace(/\[file\s+name=[^\]]+\][\s\S]*?\[\/file\]/g, '')
              .replace(/\[file\s+name=[^\]]+\][\s\S]*$/g, '')
              .replace(/\[choices\][\s\S]*?\[\/choices\]/g, '')
              .replace(/\[choices\][\s\S]*$/g, '')
              .trim();
            setStreamingText(lastVisible);
            setStreamingMsg((prev) =>
              prev
                ? {
                    ...prev,
                    content: lastVisible,
                    toolCalls:
                      liveToolCalls.length > 0 ? [...liveToolCalls] : undefined,
                  }
                : prev,
            );
          },
          onThinkingDelta: (d) => {
            thinkingAcc += d;
            setStreamingThinking(thinkingAcc);
            setStreamingMsg((prev) =>
              prev ? { ...prev, thinking: thinkingAcc } : prev,
            );
          },
          onToolCallResolved: (c) => {
            liveToolCalls.push(c);
            setStreamingMsg((prev) =>
              prev
                ? {
                    ...prev,
                    content: lastVisible,
                    toolCalls: [...liveToolCalls],
                  }
                : prev,
            );
          },
        },
      });

      if (controller.signal.aborted) {
        clearStreaming();
        setLoading(false);
        return;
      }

      const { cleanText, artifacts, choices } = parseArtifacts(
        acc || lastVisible,
      );
      const errored = result.errored;
      const errorMessage = result.errorMessage;
      const thinkingText = (result.thinking || thinkingAcc).trim();

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
        model: sendModel,
        toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
        thinking: thinkingText || undefined,
        usage: result.usage,
        createdAt: Date.now(),
      };
      await db.messages.add(finalAssistant);
      await db.conversations.update(conv.id, {
        currentLeafId: assistantId,
        updatedAt: Date.now(),
      });
      await saveSettings({
        defaultEndpointId: ep.id,
        defaultModel: sendModel,
        defaultPersonaId: personaId,
        defaultStyleId: activeStyleId ?? styleId,
      });
    } catch (e) {
      if (!controller.signal.aborted) {
        console.error('[consult] send failed', e);
      }
    } finally {
      clearStreaming();
      setLoading(false);
    }
  }

  function handleAbort() {
    abortRef.current?.abort();
    clearStreaming();
    setLoading(false);
  }

  const lastId = view.at(-1)?.id;
  const accent = conv?.accentColor ?? '#CDD2EB';

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
      <ConsultSettingsLine
        conversation={conv}
        personaId={personaId}
        styleId={styleId}
        endpointId={endpointId}
        model={model}
        persona={persona}
        contextText={view
          .slice(-4)
          .map((m) => m.content)
          .filter(Boolean)
          .join('\n')}
        exportDisabled={view.length === 0}
        onPersonaChange={setPersonaId}
        onStyleChange={setStyleId}
        onEndpointChange={(epId, m) => {
          setEndpointId(epId);
          setModel(m);
        }}
        onNewConversation={() => void handleNewConversation()}
        onOpenConversationList={() => setListOpen(true)}
      />

      {listOpen && (
        <ConsultConversationList
          activeId={convId}
          onClose={() => setListOpen(false)}
          onSelect={switchConversation}
          onDeletedActive={(nextId) => {
            if (nextId) switchConversation(nextId);
            else
              void ensureActiveConsultConversation().then((c) =>
                switchConversation(c.id),
              );
          }}
        />
      )}

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

          {view.map((msg) => {
            const isStreamingRow =
              msg.id === streamingMsg?.id && msg.status === 'streaming';
            return (
              <div
                key={msg.id}
                className="consult-msg-row"
                style={{
                  marginBottom: msg.role === 'user' ? 14 : 20,
                  animation: 'consultMsgIn 0.45s ease both',
                }}
              >
                <MessageBubble
                  message={msg}
                  streamingText={isStreamingRow ? streamingText : undefined}
                  streamingThinking={
                    isStreamingRow ? streamingThinking : undefined
                  }
                  disabled={loading}
                  accentColor={accent}
                  isChoicesClickable={
                    msg.role === 'assistant' &&
                    msg.id === lastId &&
                    !loading &&
                    Boolean(msg.choices?.length)
                  }
                  onSend={(choice) => void handleSend(choice, [])}
                />
              </div>
            );
          })}

          {loading && !streamingText && !streamingThinking && (
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
          disabled={!conv || !endpointId || !model}
          placeholder="可以从一段记忆、身体感觉，或今天想被看见的地方开始……"
          hideMoodTags
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
        .consult-session .wis-composer-field {
          background: ${CONSULT.inputBg};
          border-color: ${CONSULT.inputBorder};
        }
        .consult-session .wis-composer-field:focus {
          border-color: ${CONSULT.inputBorderFocus};
        }
        .consult-session .wis-send-btn {
          border-color: ${CONSULT.inputBorder};
          background: ${CONSULT.uiFill};
        }
        .consult-session .wis-send-btn:hover {
          background: rgba(192, 198, 227, 0.35);
        }
        /* User bubbles: keep #CDD2EB but 80% transparent (alpha 0.2),
           overriding MessageBubble's denser accent fill. */
        .consult-session .wis-user-bubble {
          background: ${CONSULT.userBubble} !important;
          box-shadow: inset 0 0 0 1px ${CONSULT.userBorder} !important;
        }
        /* Tighter paragraph rhythm than default chat — short analytic lines
           shouldn't read as huge blank bands between sentences. */
        .consult-session .prose-msg p,
        .consult-session .wis-ai-body p {
          margin: 0.28em 0;
        }
        .consult-session .prose-msg p:first-child,
        .consult-session .wis-ai-body p:first-child {
          margin-top: 0;
        }
        .consult-session .prose-msg p:last-child,
        .consult-session .wis-ai-body p:last-child {
          margin-bottom: 0;
        }
        .consult-session .wis-ai-body {
          line-height: 1.65;
        }
      `}</style>
    </div>
  );
}
