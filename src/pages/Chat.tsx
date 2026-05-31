import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
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
import WisteriaMark from '../components/WisteriaMark';
import { estimateConversationCostUSD, formatUSD } from '../lib/pricing';
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
    const fromConv = conversation?.styleId ?? null;
    setStyleId(fromConv ?? settings.defaultStyleId);
  }, [settings, conversation]);

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
      defaultStyleId: styleId,
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
    if (!conversation || !endpointId || !model) return;
    const ep = selectedEndpoint();
    if (!ep) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreamingText('');
    setStreamingThinking('');
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
    setStreamingId(null);
    setStreamingText('');
    setStreamingThinking('');
    abortRef.current = null;
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

  // Header expansion: collapsed by default — accent/export/pickers all
  // live in the expanded row now, so default keeps the title clean.
  const [headerExpanded, setHeaderExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const saved = sessionStorage.getItem('lisse:headerExpanded');
    if (saved !== null) return saved === '1';
    return false;
  });
  useEffect(() => {
    sessionStorage.setItem('lisse:headerExpanded', headerExpanded ? '1' : '0');
  }, [headerExpanded]);

  const persona = selectedPersona();
  const style = selectedStyle();
  const endpointName = endpoints?.find((e) => e.id === endpointId)?.name;

  // Running cost estimate (USD) over all assistant messages in this conversation.
  const conversationCost = useMemo(() => {
    if (!allMessages || allMessages.length === 0) return 0;
    return estimateConversationCostUSD(allMessages);
  }, [allMessages]);

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-lavender-100/70 bg-white/40 backdrop-blur-md">
        {/* Row 1: persona name + model meta + collapse + export */}
        <div className="flex items-center gap-2 px-3 py-2 pl-14 md:px-6 md:pl-6">
          <div className="min-w-0 flex-1">
            {persona ? (
              <button
                type="button"
                onClick={() => setShowSecret(true)}
                className="group flex items-center gap-2"
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ background: persona.color }}
                >
                  {persona.avatar}
                </span>
                <span
                  className="text-lg font-normal tracking-wide transition group-hover:opacity-80"
                  style={{ fontFamily: 'var(--font-serif)', color: persona.color }}
                >
                  {persona.name}
                </span>
              </button>
            ) : (
              <h2
                className="truncate text-lg font-normal tracking-wide text-ink-900"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                新聊天
              </h2>
            )}
            <div className="truncate text-[11px] font-light tracking-wide text-ink-500">
              {model && <span>{model}</span>}
              {endpointName && (
                <span className="opacity-60"> ({endpointName})</span>
              )}
              {style && style.id !== 'style_default' && (
                <>
                  <span className="mx-1.5 opacity-40">·</span>
                  <span className="opacity-80">{style.name}</span>
                </>
              )}
              {conversationCost > 0 && (
                <>
                  <span className="mx-1.5 opacity-40">·</span>
                  <span
                    className="font-mono opacity-80"
                    title="本对话累计估算成本（按官方牌价）"
                  >
                    {formatUSD(conversationCost)}
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setHeaderExpanded((v) => !v)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-500 transition hover:bg-lavender-50 hover:text-ink-700"
            aria-label={headerExpanded ? '收起' : '展开'}
            title={headerExpanded ? '收起' : '展开'}
          >
            {headerExpanded ? (
              <ChevronUp size={15} />
            ) : (
              <ChevronDown size={15} />
            )}
          </button>
        </div>
        {/* Row 2: pickers + accent + export (collapsible). Default collapsed. */}
        {headerExpanded && (
          <div className="flex flex-wrap items-center gap-2 border-t border-lavender-100/70 px-3 py-2 md:px-6">
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
            <StylePicker styleId={styleId} onChange={setStyleId} />
            <EndpointPicker
              endpointId={endpointId}
              model={model}
              onChange={handlePicker}
            />
            <div className="ml-auto flex items-center gap-1">
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
              <ExportMenu
                conversation={conversation ?? undefined}
                persona={persona}
                disabled={!conversation || branch.length === 0}
              />
            </div>
          </div>
        )}
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 md:px-6"
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
                  authorPersona={
                    m.personaId
                      ? personas?.find((p) => p.id === m.personaId)
                      : persona
                  }
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
      <div className="opacity-85">
        <WisteriaMark size={80} />
      </div>
      <p
        className="mt-4 text-[13px] font-light tracking-[0.2em]"
        style={{
          fontFamily: 'var(--font-serif)',
          color: '#9a859e',
        }}
      >
        語を紡いで
      </p>
    </div>
  );
}
