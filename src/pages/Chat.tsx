import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { getActiveBranchFromMessages } from '../lib/branch';
import MessageBubble from '../components/MessageBubble';
import HandoffReturnShelf from '../components/HandoffReturnShelf';
import ChatInput from '../components/ChatInput';
import { getSelectedJobIds } from '../lib/workshop/handoff-store';
import { stripClwdTaskTags } from '../lib/workshop/handoff-protocol';
import EndpointPicker from '../components/EndpointPicker';
import PersonaPicker from '../components/PersonaPicker';
import PersonaSecret from '../components/PersonaSecret';
import StylePicker from '../components/StylePicker';
import StyleInjectPicker from '../components/StyleInjectPicker';
import ExportMenu from '../components/ExportMenu';
import AccentPicker from '../components/AccentPicker';
import WallpaperPicker from '../components/WallpaperPicker';
import SkinPicker from '../components/SkinPicker';
import TentaclePanel from '../components/TentaclePanel';
import BedroomDecor, { decorVariantForTheme } from '../components/BedroomDecor';
import { WisteriaDecor, LeafButton } from '../components/WisteriaDecor';
import LeafMenu from '../components/LeafMenu';
import WisteriaMark from '../components/WisteriaMark';
import { emitClawd } from '../lib/clawd/bus';
import { beginChatStream, endChatStream } from '../lib/stream-activity';
import { getBedroomTheme } from '../lib/bedroom-themes';
import { setStatusBarColor, resetStatusBar } from '../lib/status-bar';
import { afterkiss, useAfterKiss } from '../lib/afterkiss';
import type { Attachment, Conversation, Message } from '../types';

export default function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();

  const conversation = useLiveQuery(
    () => (conversationId ? db.conversations.get(conversationId) : undefined),
    [conversationId],
  );

  // No default `[]` — that made "still loading" look identical to "empty DB"
  // and briefly painted a blank chat (panic → destructive recover/replace).
  const allMessages = useLiveQuery(
    () =>
      conversationId
        ? db.messages.where({ conversationId }).sortBy('createdAt')
        : Promise.resolve([] as Message[]),
    [conversationId],
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
    // settings.defaultStyleId is the single source of truth.
    // We used to fall back to conversation.styleId, but that pinned the
    // first style she ever used in this conversation forever — changing
    // the global default on /styles wouldn't visibly do anything in chat.
    setStyleId(settings.defaultStyleId);
  }, [settings]);

  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Last streamed body per assistant id, kept until Dexie paints `content`.
  // Clearing streamingText at speaker handoff otherwise collapses the bubble
  // for a frame → scrollTop clamps → overflow-anchoring yanks the prior turn
  // (user msg + first model) above the viewport, unreachable by scroll.
  const streamBodyByIdRef = useRef<Map<string, string>>(new Map());

  function appendStreamingText(
    assistantId: string,
    delta: string,
    transform?: (s: string) => string,
  ) {
    setStreamingId(assistantId);
    setStreamingText((prev) => {
      const next = transform ? transform(prev + delta) : prev + delta;
      streamBodyByIdRef.current.set(assistantId, next);
      return next;
    });
  }

  function streamingOverride(m: Message): string | undefined {
    if (m.id === streamingId) return streamingText;
    if (!m.content) return streamBodyByIdRef.current.get(m.id);
    return undefined;
  }

  const [branch, setBranch] = useState<Message[]>([]);
  useEffect(() => {
    // Drop another conversation's paint immediately on switch (avoid showing
    // A while B is loading). Same-conversation loading keeps the prior branch
    // so a slow messages query never flashes "empty / data wiped".
    if (!conversationId) {
      setBranch([]);
      return;
    }
    setBranch((prev) =>
      prev.length > 0 && prev[0]?.conversationId === conversationId
        ? prev
        : [],
    );
  }, [conversationId]);
  useEffect(() => {
    if (!conversationId) return;
    if (!conversation || conversation.id !== conversationId) return;
    if (!conversation.currentLeafId) {
      setBranch([]);
      return;
    }
    // Messages live-query still resolving: keep same-conversation paint.
    if (allMessages === undefined) return;
    // Leaf not in this array yet (or orphan) — wait for a tick that has it.
    // Brand-new chats use null currentLeafId, so an empty [] here is rare;
    // only clear when the leaf is confirmed missing after a non-empty load.
    if (!allMessages.some((m) => m.id === conversation.currentLeafId)) {
      if (allMessages.length > 0) setBranch([]);
      return;
    }
    setBranch(getActiveBranchFromMessages(conversation, allMessages));
  }, [conversationId, conversation, allMessages]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Claude-app-style message anchoring ──────────────────────────────
  // When a new user message is sent, pin it to the TOP of the stream area
  // (right under the date separator) and let the reply grow below it.
  // The view is never yanked around during streaming. A dynamic tail
  // spacer guarantees the anchor position is always scroll-reachable even
  // while the reply is still short.
  const [tailPad, setTailPad] = useState(0);
  const tailPadRef = useRef(0);
  const lastUserIdRef = useRef<string | null>(null);
  const anchoredIdRef = useRef<string | null>(null);
  const pendingAnchorRef = useRef<string | null>(null);
  const freshLoadRef = useRef(true);

  // Reset anchoring when switching conversations. Must be a layout effect
  // declared BEFORE the anchor effect so it runs first on conv change.
  useLayoutEffect(() => {
    lastUserIdRef.current = null;
    anchoredIdRef.current = null;
    pendingAnchorRef.current = null;
    freshLoadRef.current = true;
    streamBodyByIdRef.current.clear();
    if (tailPadRef.current !== 0) {
      tailPadRef.current = 0;
      setTailPad(0);
    }
  }, [conversationId]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || branch.length === 0) return;

    // Drop fallbacks once the live query has painted persisted content.
    for (const m of branch) {
      if (m.content) streamBodyByIdRef.current.delete(m.id);
    }

    const lastUser = [...branch].reverse().find((m) => m.role === 'user');
    const lastUserId = lastUser?.id ?? null;
    const isNewUserMsg =
      lastUserId !== null && lastUserId !== lastUserIdRef.current;
    lastUserIdRef.current = lastUserId;

    if (freshLoadRef.current) {
      // First paint of an opened conversation: land at the bottom, like a
      // normal chat app. Anchoring only kicks in for messages sent live.
      freshLoadRef.current = false;
      el.scrollTop = el.scrollHeight;
      return;
    }

    if (isNewUserMsg) {
      anchoredIdRef.current = lastUserId;
      pendingAnchorRef.current = lastUserId;
    }
    const anchorId = anchoredIdRef.current;
    if (!anchorId) return;

    const anchorEl = el.querySelector<HTMLElement>(
      `[data-mid="${CSS.escape(anchorId)}"]`,
    );
    if (!anchorEl) {
      // Anchored message left the active branch (sibling switch etc.) —
      // drop the spacer and stop anchoring.
      anchoredIdRef.current = null;
      pendingAnchorRef.current = null;
      if (tailPadRef.current !== 0) {
        tailPadRef.current = 0;
        setTailPad(0);
      }
      return;
    }

    // Anchor offset within the scroll content.
    const anchorTop =
      anchorEl.getBoundingClientRect().top -
      el.getBoundingClientRect().top +
      el.scrollTop;

    // Tail spacer so that scrollTop = anchorTop is reachable:
    // needs scrollHeight - clientHeight >= anchorTop.
    const contentH = el.scrollHeight - tailPadRef.current;
    const pad = Math.max(0, Math.round(anchorTop + el.clientHeight - contentH));
    if (Math.abs(pad - tailPadRef.current) > 1) {
      tailPadRef.current = pad;
      setTailPad(pad);
      // Wait for the spacer to render before jumping (effect re-runs via
      // the tailPad dep) so the target position actually exists.
      return;
    }

    if (pendingAnchorRef.current === anchorId) {
      pendingAnchorRef.current = null;
      el.scrollTop = Math.max(0, anchorTop - 4);
    }
    // While streaming we deliberately do NOT touch scrollTop — the pinned
    // bubble stays put and the reply fills in below it.
  }, [branch, streamingText, streamingThinking, tailPad]);

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

  async function handleSend(
    text: string,
    attachments: Attachment[],
    opts?: { deepThink?: boolean },
  ) {
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
    beginChatStream();
    setStreamingText('');
    setStreamingThinking('');
    emitClawd({ type: 'user-send', personaId });
    let clawdStreamStarted = false;
    let clawdAcc = '';

    const handoffIds = settings?.workshopHandoffEnabled
      ? await getSelectedJobIds(conv.id)
      : undefined;

    try {
      await sendMessage({
        conversation: conv,
        endpoint: ep,
        model,
        userText: text,
        attachments,
        persona: selectedPersona(),
        style: selectedStyle(),
        groupOthers: groupOthers(),
        handoffIds,
        deepThink: opts?.deepThink,
        signal: controller.signal,
        onDelta: (delta, assistantId) => {
          if (!clawdStreamStarted) {
            clawdStreamStarted = true;
            emitClawd({ type: 'stream-start', personaId });
          }
          clawdAcc += delta;
          appendStreamingText(assistantId, delta, stripClwdTaskTags);
        },
        onThinking: (delta, assistantId) => {
          if (!clawdStreamStarted) {
            clawdStreamStarted = true;
            emitClawd({ type: 'stream-start', personaId });
          }
          setStreamingId(assistantId);
          setStreamingThinking((prev) => prev + delta);
        },
      });

      if (clawdStreamStarted || clawdAcc) {
        emitClawd({
          type: 'stream-end',
          personaId,
          text: stripClwdTaskTags(clawdAcc),
        });
      }
      setStreamingId(null);
      setStreamingText('');
      setStreamingThinking('');

      // In group mode, automatically trigger every other persona to respond in turn.
      if (isGroup(conv.personaIds) && personas) {
        const allIds = conv.personaIds ?? [];
        const otherPersonas = personas.filter(
          (p) => allIds.includes(p.id) && p.id !== personaId,
        );
        for (const speaker of otherPersonas) {
          if (controller.signal.aborted) break;
          const override = conv.personaModels?.[speaker.id];
          const epToUse = override
            ? (endpoints?.find((e) => e.id === override.endpointId) ?? ep)
            : ep;
          const modelToUse = override?.model ?? model;
          const speakerOthers = personas.filter(
            (p) => allIds.includes(p.id) && p.id !== speaker.id,
          );
          setStreamingText('');
          setStreamingThinking('');
          clawdStreamStarted = false;
          clawdAcc = '';
          await letPersonaSpeak({
            conversation: conv,
            endpoint: epToUse,
            model: modelToUse,
            persona: speaker,
            style: selectedStyle(),
            groupOthers: speakerOthers.length > 0 ? speakerOthers : undefined,
            signal: controller.signal,
            onDelta: (delta, assistantId) => {
              if (!clawdStreamStarted) {
                clawdStreamStarted = true;
                emitClawd({ type: 'stream-start', personaId: speaker.id });
              }
              clawdAcc += delta;
              appendStreamingText(assistantId, delta);
            },
            onThinking: (delta, assistantId) => {
              if (!clawdStreamStarted) {
                clawdStreamStarted = true;
                emitClawd({ type: 'stream-start', personaId: speaker.id });
              }
              setStreamingId(assistantId);
              setStreamingThinking((prev) => prev + delta);
            },
          });
          if (clawdStreamStarted || clawdAcc) {
            emitClawd({
              type: 'stream-end',
              personaId: speaker.id,
              text: clawdAcc,
            });
          }
          setStreamingId(null);
          setStreamingText('');
          setStreamingThinking('');
        }
      }

      await saveSettings({
        defaultEndpointId: ep.id,
        defaultModel: model,
        defaultPersonaId: personaId,
        defaultStyleId: styleId,
      });
    } catch (e) {
      console.error('[send] 发送失败:', e);
      const { formatStorageError } = await import('../lib/storage-guards');
      alert(formatStorageError(e));
    } finally {
      endChatStream();
      setStreamingId(null);
      setStreamingText('');
      setStreamingThinking('');
      // Only clear abortRef if it still points to OUR controller — handleEdit
      // may have already installed a new controller while we were awaiting.
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
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
    beginChatStream();
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
          appendStreamingText(assistantId, delta);
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
      endChatStream();
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
    beginChatStream();
    setStreamingText('');
    setStreamingThinking('');
    try {
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
          appendStreamingText(assistantId, delta);
        },
        onThinking: (delta, assistantId) => {
          setStreamingId(assistantId);
          setStreamingThinking((prev) => prev + delta);
        },
      });
    } catch (e) {
      console.error('[regenerate] 重生成失败:', e);
    } finally {
      endChatStream();
      setStreamingId(null);
      setStreamingText('');
      setStreamingThinking('');
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
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
  const [tentacleOpen, setTentacleOpen] = useState(false);
  const toyState = useAfterKiss();

  const persona = selectedPersona();
  const wallpaper = settings?.chatWallpaper ?? null;
  const skinId = conversation?.chatSkin ?? null;
  const skin = skinId ? getBedroomTheme(skinId) : null;
  const decorVariant = decorVariantForTheme(skinId ?? undefined);
  const toyOn = !!settings?.toyControlEnabled;

  useEffect(() => {
    if (!skinId) {
      void resetStatusBar();
      return undefined;
    }
    const t = getBedroomTheme(skinId);
    void setStatusBarColor(t.bg);
    return () => {
      void resetStatusBar();
    };
  }, [skinId]);

  return (
    <div
      className={`wis-chat-page${skin ? ' has-skin' : ''}`}
      style={
        skin
          ? {
              background: skin.bg,
              ['--skin-bg' as string]: skin.bg,
              ['--skin-sl' as string]: skin.sl,
              ['--skin-text' as string]: skin.text,
              ['--skin-ac' as string]: skin.ac,
              ['--skin-bd' as string]: skin.bd,
              ['--skin-tm' as string]: skin.tm,
            }
          : undefined
      }
    >
      {skin && decorVariant ? (
        <BedroomDecor variant={decorVariant} />
      ) : (
        <WisteriaDecor />
      )}
      <LeafButton onClick={() => setLeafOpen(true)} />

      <div className="wis-chat-frame">
        <header
          className="wis-chat-header"
          style={
            skin
              ? {
                  background: `${skin.sl}cc`,
                  borderBottom: `1px solid ${skin.bd}`,
                }
              : undefined
          }
        >
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
                color: skin ? skin.tu : 'hsla(268, 30%, 32%, 0.85)',
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
                color: skin ? skin.tu : 'hsla(268, 30%, 32%, 0.85)',
                letterSpacing: '0.1em',
                fontFamily: "'Noto Serif SC', Georgia, serif",
              }}
            >
              新聊天
            </span>
          )}
          <div style={{ width: 28 }} />
        </header>

        {/* Wallpaper applies only to this body (date sep + message stream).
            Header and composer stay outside so their frosted chrome is unchanged.
            Chat skin paints the page behind; wallpaper still overlays the body. */}
        <div
          className={`wis-chat-body${wallpaper ? ' has-wallpaper' : ''}`}
          style={
            wallpaper
              ? {
                  backgroundImage: `url(${wallpaper})`,
                }
              : undefined
          }
        >
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
          >
          {hasNoEndpoints ? (
            <EmptyEndpoints />
          ) : isEmpty ? (
            <EmptyChat />
          ) : (
            <ul className="chat-content-column chat-message-list">
              {branch.map((m, idx) => {
                // Choices widget is clickable only on assistant messages where
                // no user reply exists yet in the active branch.
                const isChoicesClickable =
                  m.role === 'assistant' &&
                  !busy &&
                  !branch.slice(idx + 1).some((mm) => mm.role === 'user');
                // While streaming with 玩具 started, show live channel levels
                // until the turn persists toyIntensity.
                const msgForBubble =
                  toyOn && m.id === streamingId
                    ? {
                        ...m,
                        toyIntensity: {
                          thrust: toyState.thrust,
                          vibe: toyState.vibe,
                          clit: toyState.clit,
                        },
                      }
                    : m;
                return (
                  <li key={m.id} data-mid={m.id}>
                    <MessageBubble
                      message={msgForBubble}
                      accentColor={conversation?.accentColor ?? null}
                      streamingText={streamingOverride(m)}
                      streamingThinking={
                        m.id === streamingId ? streamingThinking : undefined
                      }
                      isChoicesClickable={isChoicesClickable}
                      onEdit={(t) => handleEdit(m, t)}
                      onRegenerate={() => handleRegenerate(m)}
                      onSwitchSibling={handleSwitchSibling}
                      onSend={(text) => handleSend(text, [])}
                      disabled={busy}
                    />
                  </li>
                );
              })}
            </ul>
          )}
          {tailPad > 0 && <div style={{ height: tailPad }} aria-hidden="true" />}
          </div>
        </div>

        {conversationId && settings?.workshopHandoffEnabled && (
          <HandoffReturnShelf conversationId={conversationId} disabled={busy} />
        )}
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
                .map((m) => m.content.slice(0, 2000))
                .filter(Boolean)
                .join('\n')}
            />
          </MenuRow>
          <MenuRow label="风格">
            <StylePicker
              styleId={styleId}
              onChange={async (id) => {
                setStyleId(id);
                // Single source of truth: writing here updates everywhere
                // (Styles page UseStyle dropdown, every other chat tab).
                await saveSettings({ defaultStyleId: id });
              }}
            />
          </MenuRow>
          <MenuRow label="注入">
            <StyleInjectPicker
              compact
              value={settings?.styleUserInject ?? 'off'}
              onChange={(next) => void saveSettings({ styleUserInject: next })}
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
          <MenuRow label="皮肤">
            <SkinPicker
              value={skinId}
              onChange={async (next) => {
                if (!conversation) return;
                await db.conversations.update(conversation.id, {
                  chatSkin: next ?? undefined,
                  updatedAt: Date.now(),
                });
              }}
            />
          </MenuRow>
          <MenuRow label="壁纸">
            <WallpaperPicker
              value={wallpaper}
              onChange={async (next) => {
                await saveSettings({ chatWallpaper: next });
              }}
            />
          </MenuRow>
          <MenuRow label="玩具">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={async () => {
                  await saveSettings({ toyControlEnabled: !toyOn });
                }}
                style={{
                  fontSize: 11,
                  letterSpacing: '0.04em',
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: toyOn
                    ? '1px solid hsla(340, 45%, 55%, 0.55)'
                    : '1px solid hsla(270, 25%, 78%, 0.55)',
                  background: toyOn
                    ? 'hsla(340, 40%, 92%, 0.95)'
                    : 'hsla(270, 30%, 96%, 0.9)',
                  color: toyOn
                    ? 'hsla(340, 40%, 38%, 0.95)'
                    : 'hsla(268, 22%, 40%, 0.85)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-serif)',
                }}
                title={
                  toyOn
                    ? '已启动：模型可调力度，消息尾部显示示意'
                    : '启动后模型可控制力度'
                }
              >
                {toyOn ? '已启动' : '启动'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLeafOpen(false);
                  setTentacleOpen(true);
                }}
                style={{
                  fontSize: 11,
                  letterSpacing: '0.04em',
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: '1px solid hsla(270, 25%, 78%, 0.55)',
                  background: 'hsla(270, 30%, 96%, 0.9)',
                  color: 'hsla(268, 22%, 40%, 0.85)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-serif)',
                }}
                title="手动控制面板"
              >
                控制
                {toyState.connected ? ' · 已连' : ''}
              </button>
              {toyOn && toyState.connected && (
                <button
                  type="button"
                  onClick={() => void afterkiss.emergencyStop()}
                  style={{
                    fontSize: 11,
                    letterSpacing: '0.04em',
                    padding: '4px 10px',
                    borderRadius: 999,
                    border: '1px solid hsla(0, 55%, 55%, 0.55)',
                    background: 'hsla(0, 55%, 94%, 0.95)',
                    color: 'hsla(0, 45%, 38%, 0.95)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-serif)',
                  }}
                  title="急停"
                >
                  急停
                </button>
              )}
            </div>
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

      {tentacleOpen && (
        <TentaclePanel
          theme={skin ?? getBedroomTheme('wisteria')}
          onClose={() => setTentacleOpen(false)}
        />
      )}

      {showSecret && persona && (
        <PersonaSecret
          persona={persona}
          contextText={branch
            .slice(-4)
            .map((m) => m.content.slice(0, 2000))
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
