import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db, getSettings, saveSettings } from '../db';
import {
  sendMessage,
  createConversation,
  editUserMessage,
  regenerateAssistant,
  switchSibling,
  letPersonaSpeak,
} from '../lib/chat';
import { isGroup } from '../lib/group';
import { getActiveBranch } from '../lib/branch';
import MessageBubble from '../components/MessageBubble';
import ChatInput from '../components/ChatInput';
import EndpointPicker from '../components/EndpointPicker';
import PersonaPicker from '../components/PersonaPicker';
import PersonaSecret from '../components/PersonaSecret';
import StylePicker from '../components/StylePicker';
import ExportMenu from '../components/ExportMenu';
import AccentPicker from '../components/AccentPicker';
import { WisteriaDecor, LeafButton } from '../components/WisteriaDecor';
import LeafMenu from '../components/LeafMenu';
import WisteriaMark from '../components/WisteriaMark';
import type { Attachment, Conversation, Message } from '../types';

export default function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();

  const conversation = useLiveQuery(
    () => (conversationId ? db.conversations.get(conversationId) : undefined),
    [conversationId],
  );

  const allMessages = useLiveQuery(
    () =>
      conversationId
        ? db.messages.where({ conversationId }).sortBy('createdAt')
        : [],
    [conversationId],
    [],
  );

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
    // Per-persona override (group chats): if the current persona has its
    // own endpoint+model in conversation.personaModels, use that.
    const override =
      personaId && conversation?.personaModels?.[personaId]
        ? conversation.personaModels[personaId]
        : null;
    if (override) {
      const ep = endpoints.find((e) => e.id === override.endpointId);
      if (ep) {
        setEndpointId(ep.id);
        setModel(
          ep.chatModels.includes(override.model)
            ? override.model
            : ep.chatModels[0] ?? null,
        );
        return;
      }
    }
    const fromConv = conversation?.defaultEndpointId
      ? endpoints.find((e) => e.id === conversation.defaultEndpointId)
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
      conversation?.defaultModel && ep.chatModels.includes(conversation.defaultModel)
        ? conversation.defaultModel
        : settings.defaultModel && ep.chatModels.includes(settings.defaultModel)
          ? settings.defaultModel
          : ep.chatModels[0] ?? null;
    setEndpointId(ep.id);
    setModel(m);
  }, [endpoints, settings, conversation, personaId]);

  useEffect(() => {
    if (!settings) return;
    const fromConv = conversation?.personaId ?? null;
    setPersonaId(fromConv ?? settings.defaultPersonaId);
  }, [settings, conversation]);

  useEffect(() => {
    if (!settings) return;
    // Style is per-persona: each persona remembers its own writing style.
    // The global settings.defaultStyleId is only the fallback used when no
    // persona is selected (无人格).
    const persona = personaId ? personas?.find((p) => p.id === personaId) : null;
    if (personaId && !persona) return; // personas not loaded yet — keep current
    setStyleId(persona ? persona.styleId ?? null : settings.defaultStyleId);
  }, [settings, personaId, personas]);

  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [branch, setBranch] = useState<Message[]>([]);
  useEffect(() => {
    if (!conversation || !allMessages) {
      setBranch([]);
      return;
    }
    if (!conversation.currentLeafId) {
      setBranch([]);
      return;
    }
    getActiveBranch(conversation).then(setBranch);
  }, [conversation, allMessages]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [branch.length, streamingText]);

  function selectedPersona() {
    if (!personaId) return undefined;
    return personas?.find((p) => p.id === personaId);
  }

  function selectedStyle() {
    if (!styleId) return undefined;
    return styles?.find((s) => s.id === styleId);
  }

  function selectedEndpoint() {
    return endpoints?.find((e) => e.id === endpointId);
  }

  /** Other personas in the group (excluding the current responder). */
  function groupOthers() {
    const ids = conversation?.personaIds ?? [];
    if (ids.length < 2 || !personas) return undefined;
    return personas.filter((p) => ids.includes(p.id) && p.id !== personaId);
  }

  async function handleChangeGroup(nextIds: string[]) {
    if (!conversation) return;
    // Less than 2 personas: drop group mode entirely.
    const personaIds = nextIds.length >= 2 ? nextIds : undefined;
    // If the current responder is no longer in the group, switch to the
    // first member.
    let nextPersonaId = personaId;
    if (personaIds && (!nextPersonaId || !personaIds.includes(nextPersonaId))) {
      nextPersonaId = personaIds[0];
      setPersonaId(nextPersonaId);
    } else if (!personaIds && nextIds.length === 1) {
      // Single-persona convo from a previous group.
      nextPersonaId = nextIds[0];
      setPersonaId(nextPersonaId);
    }
    await db.conversations.update(conversation.id, {
      personaIds,
      personaId: nextPersonaId ?? undefined,
      updatedAt: Date.now(),
    });
  }

  async function handleLetSpeak(speaker: import('../types').Persona) {
    if (!conversation) return;
    // Group chat: prefer the speaker's per-persona model override.
    const override = conversation.personaModels?.[speaker.id];
    const epToUse = override
      ? endpoints?.find((e) => e.id === override.endpointId)
      : selectedEndpoint();
    const modelToUse = override?.model ?? model;
    if (!epToUse || !modelToUse) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreamingText('');
    setStreamingThinking('');
    const others = (personas ?? []).filter(
      (p) => (conversation.personaIds ?? []).includes(p.id) && p.id !== speaker.id,
    );
    await letPersonaSpeak({
      conversation,
      endpoint: epToUse,
      model: modelToUse,
      persona: speaker,
      style: selectedStyle(),
      groupOthers: others.length > 0 ? others : undefined,
      signal: controller.signal,
      onDelta: (delta, assistantId) => {
        setStreamingId(assistantId);
        setStreamingText((prev) => prev + delta);
      },
      onThinking: (delta, assistantId) => {
        setStreamingId(assistantId);
        setStreamingThinking((prev) => prev + delta);
      },
    });
    setStreamingId(null);
    setStreamingText('');
    setStreamingThinking('');
    abortRef.current = null;
  }

  async function handleSend(text: string, attachments: Attachment[]) {
    if (!endpointId || !model) return;
    const ep = selectedEndpoint();
    if (!ep) return;

    let conv: Conversation | undefined = conversation;
    if (!conv) {
      conv = await createConversation({
        endpointId: ep.id,
        model,
        personaId: personaId ?? undefined,
        styleId: styleId ?? undefined,
      });
      navigate(`/chat/${conv.id}`, { replace: true });
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreamingText('');
    setStreamingThinking('');

    await sendMessage({
      conversation: conv,
      endpoint: ep,
      model,
      userText: text,
      attachments,
      persona: selectedPersona(),
      style: selectedStyle(),
      groupOthers: groupOthers(),
      signal: controller.signal,
      onDelta: (delta, assistantId) => {
        setStreamingId(assistantId);
        setStreamingText((prev) => prev + delta);
      },
      onThinking: (delta, assistantId) => {
        setStreamingId(assistantId);
        setStreamingThinking((prev) => prev + delta);
      },
    });

    await saveSettings({
      defaultEndpointId: ep.id,
      defaultModel: model,
      defaultPersonaId: personaId,
      // Per-persona styles are persisted as the user picks them; only the
      // persona-less default belongs in global settings.
      ...(personaId ? {} : { defaultStyleId: styleId }),
    });

    setStreamingId(null);
    setStreamingText('');
    setStreamingThinking('');
    abortRef.current = null;
  }

  function handleAbort() {
    abortRef.current?.abort();
  }

  function handlePicker(epId: string, m: string) {
    setEndpointId(epId);
    setModel(m);
  }

  async function handleEdit(message: Message, newText: string) {
    if (!conversation || !endpointId || !model) {
      console.warn('[edit] 缺少 endpoint / model, 跳过');
      return;
    }
    const ep = selectedEndpoint();
    if (!ep) {
      console.warn('[edit] selectedEndpoint() 返回空, 跳过');
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreamingText('');
    setStreamingThinking('');
    try {
      await editUserMessage({
        conversation,
        message,
        newText,
        endpoint: ep,
        model,
        persona: selectedPersona(),
        style: selectedStyle(),
        groupOthers: groupOthers(),
        signal: controller.signal,
        onDelta: (delta, assistantId) => {
          setStreamingId(assistantId);
          setStreamingText((prev) => prev + delta);
        },
        onThinking: (delta, assistantId) => {
          setStreamingId(assistantId);
          setStreamingThinking((prev) => prev + delta);
        },
      });
    } catch (e) {
      // editUserMessage / streamAssistant 内部本来会把 assistant
      // status 标 'error', 但如果在到达 streamAssistant 之前就炸
      // (事务失败 / prefix 构建失败), 我们至少在 console 留痕,
      // 避免「保存并重发」点完没动静.
      console.error('[edit] 重发失败:', e);
    } finally {
      setStreamingId(null);
      setStreamingText('');
      setStreamingThinking('');
      abortRef.current = null;
    }
  }

  async function handleRegenerate(message: Message) {
    if (!conversation || !endpointId || !model) return;
    const ep = selectedEndpoint();
    if (!ep) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreamingText('');
    setStreamingThinking('');
    await regenerateAssistant({
      conversation,
      message,
      endpoint: ep,
      model,
      persona: selectedPersona(),
      style: selectedStyle(),
      groupOthers: groupOthers(),
      signal: controller.signal,
      onDelta: (delta, assistantId) => {
        setStreamingId(assistantId);
        setStreamingText((prev) => prev + delta);
      },
      onThinking: (delta, assistantId) => {
        setStreamingId(assistantId);
        setStreamingThinking((prev) => prev + delta);
      },
    });
    setStreamingId(null);
    setStreamingText('');
    setStreamingThinking('');
    abortRef.current = null;
  }

  async function handleSwitchSibling(newActiveId: string) {
    if (!conversation) return;
    await switchSibling({
      conversationId: conversation.id,
      newActiveMessageId: newActiveId,
    });
  }

  const hasNoEndpoints = endpoints !== undefined && endpoints.length === 0;
  const isEmpty = branch.length === 0;
  const busy = streamingId !== null;

  // Leaf-icon function menu: pickers / accent / export all live behind
  // it. Defaults closed.
  const [leafOpen, setLeafOpen] = useState(false);

  const persona = selectedPersona();

  return (
    <div className="wis-chat-page">
      <WisteriaDecor />
      <LeafButton onClick={() => setLeafOpen(true)} />

      <div className="wis-chat-frame">
        <header className="wis-chat-header">
          {persona ? (
            <button
              type="button"
              onClick={() => setShowSecret(true)}
              style={{
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
                padding: 0,
                fontSize: 15,
                color: 'hsla(268, 30%, 32%, 0.85)',
                letterSpacing: '0.1em',
                fontWeight: 400,
                fontFamily: "'Noto Serif SC', Georgia, serif",
              }}
            >
              {persona.name}
            </button>
          ) : (
            <span
              style={{
                fontSize: 15,
                color: 'hsla(268, 30%, 32%, 0.85)',
                letterSpacing: '0.1em',
                fontFamily: "'Noto Serif SC', Georgia, serif",
              }}
            >
              新聊天
            </span>
          )}
          <div style={{ width: 28 }} />
        </header>

        {!isEmpty && (
          <div className="wis-date-sep">
            <div className="wis-date-sep-line" />
            <span className="wis-date-sep-text">
              {new Date()
                .toLocaleDateString('zh-CN', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                })
                .replace(/\//g, '.')}
            </span>
            <div className="wis-date-sep-line" />
          </div>
        )}

        <div
          ref={scrollRef}
          className="wis-chat-stream"
          style={{ flex: 1, overflowY: 'auto' }}
        >
        {hasNoEndpoints ? (
          <EmptyEndpoints />
        ) : isEmpty ? (
          <EmptyChat />
        ) : (
          <ul className="mx-auto flex max-w-3xl flex-col gap-3">
            {branch.map((m) => (
              <li key={m.id}>
                <MessageBubble
                  message={m}
                  accentColor={conversation?.accentColor ?? null}
                  isGroup={isGroup(conversation?.personaIds)}
                  groupMembers={
                    isGroup(conversation?.personaIds) && personas
                      ? personas.filter((p) =>
                          (conversation?.personaIds ?? []).includes(p.id),
                        )
                      : undefined
                  }
                  onLetSpeak={(p) => handleLetSpeak(p)}
                  streamingText={
                    m.id === streamingId ? streamingText : undefined
                  }
                  streamingThinking={
                    m.id === streamingId ? streamingThinking : undefined
                  }
                  onEdit={(t) => handleEdit(m, t)}
                  onRegenerate={() => handleRegenerate(m)}
                  onSwitchSibling={handleSwitchSibling}
                  disabled={busy}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

        <ChatInput
          onSend={handleSend}
          onAbort={handleAbort}
          busy={busy}
          disabled={hasNoEndpoints || !endpointId || !model}
        />
      </div>

      <LeafMenu open={leafOpen} onClose={() => setLeafOpen(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <MenuRow label="人格">
            <PersonaPicker
              personaId={personaId}
              onChange={setPersonaId}
              groupPersonaIds={conversation?.personaIds}
              onChangeGroup={handleChangeGroup}
              contextText={branch
                .slice(-4)
                .map((m) => m.content)
                .filter(Boolean)
                .join('\n')}
            />
          </MenuRow>
          <MenuRow label="风格">
            <StylePicker
              styleId={styleId}
              onChange={async (id) => {
                setStyleId(id);
                if (personaId) {
                  // Per-persona style: pin it to the current persona so it
                  // sticks when you switch back to them later.
                  await db.personas.update(personaId, {
                    styleId: id ?? undefined,
                    updatedAt: Date.now(),
                  });
                } else {
                  // 无人格: fall back to the global default style.
                  await saveSettings({ defaultStyleId: id });
                }
              }}
            />
          </MenuRow>
          <MenuRow label="模型">
            <EndpointPicker
              endpointId={endpointId}
              model={model}
              onChange={handlePicker}
            />
          </MenuRow>
          <MenuRow label="颜色">
            <AccentPicker
              value={conversation?.accentColor ?? null}
              onChange={async (next) => {
                if (!conversation) return;
                await db.conversations.update(conversation.id, {
                  accentColor: next ?? undefined,
                  updatedAt: Date.now(),
                });
              }}
            />
          </MenuRow>
          <MenuRow label="导出">
            <ExportMenu
              conversation={conversation ?? undefined}
              persona={persona}
              disabled={!conversation || branch.length === 0}
            />
          </MenuRow>
        </div>
      </LeafMenu>

      {showSecret && persona && (
        <PersonaSecret
          persona={persona}
          contextText={branch
            .slice(-4)
            .map((m) => m.content)
            .filter(Boolean)
            .join('\n')}
          onClose={() => setShowSecret(false)}
        />
      )}
    </div>
  );
}

function MenuRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '6px 4px',
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: 'hsla(268, 22%, 48%, 0.7)',
          letterSpacing: '0.08em',
          width: 36,
          flexShrink: 0,
          fontFamily: 'var(--font-serif)',
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function EmptyEndpoints() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-lavender-200 bg-white/70 p-8 text-center text-ink-700 shadow-sm">
      <h3 className="text-lg font-semibold text-ink-900">先添加一个 endpoint 喵</h3>
      <p className="mt-2 text-sm text-ink-500">
        Lisse 不绑定任何官方 API，<br />
        你需要把自己的 AIHubMix / SiliconFlow / 官方 / 本地 endpoint 填进去。
      </p>
      <Link
        to="/settings"
        className="mt-4 inline-flex rounded-lg bg-lavender-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-300"
      >
        去设置
      </Link>
    </div>
  );
}

function EmptyChat() {
  return (
    <div className="mx-auto mt-20 flex max-w-md flex-col items-center text-center">
      <div className="empty-state-flower">
        <WisteriaMark size={80} />
      </div>
      <p className="empty-state-text mt-4 tracking-[0.2em]">語を紡いで</p>
    </div>
  );
}
