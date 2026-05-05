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
} from '../lib/chat';
import { getActiveBranch } from '../lib/branch';
import MessageBubble from '../components/MessageBubble';
import ChatInput from '../components/ChatInput';
import EndpointPicker from '../components/EndpointPicker';
import PersonaPicker from '../components/PersonaPicker';
import ExportMenu from '../components/ExportMenu';
import type { Conversation, Message } from '../types';

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

  const [endpointId, setEndpointId] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [personaId, setPersonaId] = useState<string | null>(null);

  useEffect(() => {
    if (!endpoints || !settings) return;
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
  }, [endpoints, settings, conversation]);

  useEffect(() => {
    if (!settings) return;
    const fromConv = conversation?.personaId ?? null;
    setPersonaId(fromConv ?? settings.defaultPersonaId);
  }, [settings, conversation]);

  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
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

  function selectedEndpoint() {
    return endpoints?.find((e) => e.id === endpointId);
  }

  async function handleSend(text: string) {
    if (!endpointId || !model) return;
    const ep = selectedEndpoint();
    if (!ep) return;

    let conv: Conversation | undefined = conversation;
    if (!conv) {
      conv = await createConversation({
        endpointId: ep.id,
        model,
        personaId: personaId ?? undefined,
      });
      navigate(`/chat/${conv.id}`, { replace: true });
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreamingText('');

    await sendMessage({
      conversation: conv,
      endpoint: ep,
      model,
      userText: text,
      persona: selectedPersona(),
      signal: controller.signal,
      onDelta: (delta, assistantId) => {
        setStreamingId(assistantId);
        setStreamingText((prev) => prev + delta);
      },
    });

    await saveSettings({
      defaultEndpointId: ep.id,
      defaultModel: model,
      defaultPersonaId: personaId,
    });

    setStreamingId(null);
    setStreamingText('');
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
    await editUserMessage({
      conversation,
      message,
      newText,
      endpoint: ep,
      model,
      persona: selectedPersona(),
      signal: controller.signal,
      onDelta: (delta, assistantId) => {
        setStreamingId(assistantId);
        setStreamingText((prev) => prev + delta);
      },
    });
    setStreamingId(null);
    setStreamingText('');
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
    await regenerateAssistant({
      conversation,
      message,
      endpoint: ep,
      model,
      persona: selectedPersona(),
      signal: controller.signal,
      onDelta: (delta, assistantId) => {
        setStreamingId(assistantId);
        setStreamingText((prev) => prev + delta);
      },
    });
    setStreamingId(null);
    setStreamingText('');
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

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex flex-col gap-2 border-b border-lavender-200 bg-white/60 px-3 py-3 pl-14 backdrop-blur md:flex-row md:items-center md:justify-between md:px-6 md:pl-6">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-ink-900">
            {conversation?.title ?? '新对话'}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PersonaPicker personaId={personaId} onChange={setPersonaId} />
          <EndpointPicker
            endpointId={endpointId}
            model={model}
            onChange={handlePicker}
          />
          <ExportMenu
            conversation={conversation ?? undefined}
            persona={selectedPersona()}
            disabled={!conversation || branch.length === 0}
          />
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 md:px-6">
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
                  streamingText={
                    m.id === streamingId ? streamingText : undefined
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
        className="mt-4 inline-flex rounded-lg bg-mint-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-mint-300"
      >
        去设置
      </Link>
    </div>
  );
}

function EmptyChat() {
  return (
    <div className="mx-auto mt-20 max-w-md text-center text-ink-500">
      <div className="text-4xl">💬</div>
      <p className="mt-3 text-sm">说点什么开始这场对话吧。</p>
    </div>
  );
}
