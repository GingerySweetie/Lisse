import { db, getSettings } from '../db';
import { extractReadSoFar, getMarginNotesForContext } from './books';
import type {
  Attachment,
  Conversation,
  Endpoint,
  Message,
  Persona,
  ToolCallRecord,
  WritingStyle,
} from '../types';
import { newId } from './id';
import { getActiveBranch } from './branch';
import { type ChatTurn } from '../api';
import {
  retrieveFacts,
  formatFactsBlock,
  getPinnedFacts,
  formatPinnedFactsBlock,
  extractAndStoreFacts,
} from './memory';
import { availableTools, type Tool } from './tools';
import { runToolLoop } from './tools/loop';
import { buildGroupTurns, groupAwarenessSnippet } from './group';
import { formatStatusBlock } from './behavior';
import { formatHealthContextBlock } from './health-context';

export interface SendOptions {
  conversation: Conversation;
  endpoint: Endpoint;
  model: string;
  userText: string;
  persona?: Persona;
  style?: WritingStyle;
  /** Group mode: the OTHER personas in the conversation (excluding `persona`). */
  groupOthers?: Persona[];
  /** User-attached images/files for this turn. */
  attachments?: Attachment[];
  /** Reading anchor (for book/共读 conversations). */
  bookAnchor?: Message['bookAnchor'];
  /** Called on every visible-text chunk. */
  onDelta?: (delta: string, assistantMessageId: string) => void;
  /** Called on every thinking-text chunk (Anthropic extended thinking). */
  onThinking?: (delta: string, assistantMessageId: string) => void;
  signal?: AbortSignal;
}

export interface SendResult {
  userMessage: Message;
  assistantMessage: Message;
}

export async function sendMessage(opts: SendOptions): Promise<SendResult> {
  const {
    conversation,
    endpoint,
    model,
    userText,
    persona,
    style,
    groupOthers,
    attachments,
    bookAnchor,
    onDelta,
    onThinking,
    signal,
  } = opts;
  const now = Date.now();

  const branch = await getActiveBranch(conversation);
  const parentId = branch.at(-1)?.id ?? null;

  const userMessage: Message = {
    id: newId(),
    conversationId: conversation.id,
    parentId,
    role: 'user',
    content: userText,
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
    bookAnchor,
    status: 'done',
    endpointId: endpoint.id,
    model,
    createdAt: now,
  };
  const assistantMessage: Message = {
    id: newId(),
    conversationId: conversation.id,
    parentId: userMessage.id,
    role: 'assistant',
    content: '',
    status: 'streaming',
    endpointId: endpoint.id,
    model,
    // Tag the message with the persona that's about to author it, so
    // group conversations can attribute each turn correctly.
    personaId: persona?.id,
    createdAt: now + 1,
  };

  await db.transaction('rw', db.messages, db.conversations, async () => {
    await db.messages.bulkAdd([userMessage, assistantMessage]);
    if (parentId) {
      await db.messages.update(parentId, { activeChildId: userMessage.id });
    }
    await db.messages.update(userMessage.id, {
      activeChildId: assistantMessage.id,
    });
    await db.conversations.update(conversation.id, {
      currentLeafId: assistantMessage.id,
      updatedAt: now,
      ...(branch.length === 0 && { title: deriveTitle(userText) }),
      defaultEndpointId: endpoint.id,
      defaultModel: model,
      ...(persona && { personaId: persona.id }),
      ...(style && { styleId: style.id }),
    });
  });

  await streamAssistant({
    assistantMessageId: assistantMessage.id,
    endpoint,
    model,
    persona,
    style,
    groupOthers,
    branch: [...branch, userMessage],
    onDelta,
    onThinking,
    signal,
  });

  const final = await db.messages.get(assistantMessage.id);
  scheduleFactExtraction({
    persona,
    conversationId: conversation.id,
    userMessage,
    assistantMessage: final ?? assistantMessage,
  });
  return { userMessage, assistantMessage: final ?? assistantMessage };
}

/** Fire-and-forget extraction; never throws into the chat path. Skipped
 *  when the model used the remember tool this turn — it already decided
 *  what to keep, so the auto-extractor would double up. */
function scheduleFactExtraction(args: {
  persona?: Persona;
  conversationId: string;
  userMessage: Message;
  assistantMessage: Message;
}) {
  if (!args.persona) return;
  if (args.assistantMessage.status !== 'done') return;
  if (!args.assistantMessage.content.trim()) return;
  const usedRemember = (args.assistantMessage.toolCalls ?? []).some(
    (c) => c.name === 'remember',
  );
  if (usedRemember) return;
  void extractAndStoreFacts({
    persona: args.persona,
    conversationId: args.conversationId,
    userMessage: args.userMessage,
    assistantMessage: args.assistantMessage,
  }).catch(() => {
    // already swallowed inside extractAndStoreFacts; double-safety here.
  });
}

/**
 * Edit an existing user message: creates a new sibling user message with updated text,
 * then re-streams an assistant response on the new branch.
 */
export async function editUserMessage(opts: {
  conversation: Conversation;
  message: Message;
  newText: string;
  endpoint: Endpoint;
  model: string;
  persona?: Persona;
  style?: WritingStyle;
  groupOthers?: Persona[];
  onDelta?: (delta: string, assistantMessageId: string) => void;
  onThinking?: (delta: string, assistantMessageId: string) => void;
  signal?: AbortSignal;
}): Promise<{ newUser: Message; newAssistant: Message }> {
  const {
    conversation,
    message,
    newText,
    endpoint,
    model,
    persona,
    style,
    groupOthers,
    onDelta,
    onThinking,
    signal,
  } = opts;
  if (message.role !== 'user') {
    throw new Error('editUserMessage: must be called on a user message');
  }
  const now = Date.now();

  const newUser: Message = {
    id: newId(),
    conversationId: conversation.id,
    parentId: message.parentId,
    role: 'user',
    content: newText,
    status: 'done',
    endpointId: endpoint.id,
    model,
    createdAt: now,
  };
  const newAssistant: Message = {
    id: newId(),
    conversationId: conversation.id,
    parentId: newUser.id,
    role: 'assistant',
    content: '',
    status: 'streaming',
    endpointId: endpoint.id,
    model,
    personaId: persona?.id,
    createdAt: now + 1,
  };

  await db.transaction('rw', db.messages, db.conversations, async () => {
    await db.messages.bulkAdd([newUser, newAssistant]);
    await db.messages.update(newUser.id, { activeChildId: newAssistant.id });
    if (message.parentId) {
      await db.messages.update(message.parentId, { activeChildId: newUser.id });
    }
    await db.conversations.update(conversation.id, {
      currentLeafId: newAssistant.id,
      updatedAt: now,
    });
  });

  // Build prefix: walk from root to the message's parent (inclusive), then append new user.
  // Wrap in try/catch so any failure here marks the assistant message as 'error'
  // rather than leaving it stuck in 'streaming' forever.
  let prefix: Message[];
  try {
    prefix = await getPrefixThrough(message.parentId);
  } catch (e) {
    await db.messages.update(newAssistant.id, {
      status: 'error',
      errorMessage: e instanceof Error ? e.message : '上下文构建失败',
    });
    throw e;
  }

  await streamAssistant({
    assistantMessageId: newAssistant.id,
    endpoint,
    model,
    persona,
    style,
    groupOthers,
    branch: [...prefix, newUser],
    onDelta,
    onThinking,
    signal,
  });

  const finalAssistant = await db.messages.get(newAssistant.id);
  scheduleFactExtraction({
    persona,
    conversationId: conversation.id,
    userMessage: newUser,
    assistantMessage: finalAssistant ?? newAssistant,
  });
  return { newUser, newAssistant };
}

/**
 * Regenerate an assistant message: creates a new sibling assistant under the same parent
 * user message, re-streams using same context.
 */
export async function regenerateAssistant(opts: {
  conversation: Conversation;
  message: Message;
  endpoint: Endpoint;
  model: string;
  persona?: Persona;
  style?: WritingStyle;
  groupOthers?: Persona[];
  onDelta?: (delta: string, assistantMessageId: string) => void;
  onThinking?: (delta: string, assistantMessageId: string) => void;
  signal?: AbortSignal;
}): Promise<Message> {
  const {
    conversation,
    message,
    endpoint,
    model,
    persona,
    style,
    groupOthers,
    onDelta,
    onThinking,
    signal,
  } = opts;
  if (message.role !== 'assistant') {
    throw new Error('regenerateAssistant: must be called on an assistant message');
  }
  const now = Date.now();

  const newAssistant: Message = {
    id: newId(),
    conversationId: conversation.id,
    parentId: message.parentId,
    role: 'assistant',
    content: '',
    status: 'streaming',
    endpointId: endpoint.id,
    model,
    // In group mode the regenerator may belong to a different persona
    // than the original; tag with the current responder.
    personaId: persona?.id ?? message.personaId,
    createdAt: now,
  };

  await db.transaction('rw', db.messages, db.conversations, async () => {
    await db.messages.add(newAssistant);
    if (message.parentId) {
      await db.messages.update(message.parentId, { activeChildId: newAssistant.id });
    }
    await db.conversations.update(conversation.id, {
      currentLeafId: newAssistant.id,
      updatedAt: now,
    });
  });

  const prefix = await getPrefixThrough(message.parentId);
  await streamAssistant({
    assistantMessageId: newAssistant.id,
    endpoint,
    model,
    persona,
    style,
    groupOthers,
    branch: prefix,
    onDelta,
    onThinking,
    signal,
  });

  const userParent = prefix.find((m) => m.id === message.parentId);
  const finalAssistant = await db.messages.get(newAssistant.id);
  if (userParent) {
    scheduleFactExtraction({
      persona,
      conversationId: conversation.id,
      userMessage: userParent,
      assistantMessage: finalAssistant ?? newAssistant,
    });
  }
  return newAssistant;
}

async function streamAssistant(args: {
  assistantMessageId: string;
  endpoint: Endpoint;
  model: string;
  persona?: Persona;
  style?: WritingStyle;
  /** In a group conversation, the OTHER personas (not the responder). */
  groupOthers?: Persona[];
  /** Full message chain leading up to (and including) the user turn whose response we're generating. */
  branch: Message[];
  onDelta?: (delta: string, assistantMessageId: string) => void;
  onThinking?: (delta: string, assistantMessageId: string) => void;
  signal?: AbortSignal;
}) {
  const {
    assistantMessageId,
    endpoint,
    model,
    persona,
    style,
    groupOthers,
    branch,
    onDelta,
    onThinking,
    signal,
  } = args;

  // Reading-session context: if this conversation is linked to a book and
  // the latest user message has a bookAnchor, build a spoiler-safe "currently
  // reading" block. The AI sees:
  //   1. Book title / author / reading progress (percent & char position)
  //   2. Already-read window: the last ~3 000 chars UP TO the current position —
  //      the AI is grounded in the real text but cannot see beyond the bookmark.
  //   3. The user's highlighted selection (if any) for focused commentary.
  //   4. The user's margin notes (bookmarks with notes) within the read portion.
  //   5. An explicit spoiler-safety instruction.
  let bookBlock = '';
  if (branch.length > 0) {
    const lastWithAnchor = [...branch]
      .reverse()
      .find((m) => m.role === 'user' && m.bookAnchor);
    const convId = branch[0]?.conversationId;
    if (convId) {
      const conv = await db.conversations.get(convId);
      if (conv?.bookId) {
        const book = await db.books.get(conv.bookId);
        if (book) {
          const a = lastWithAnchor?.bookAnchor;
          const readPos = a?.position ?? book.lastPosition ?? 0;
          const percent = Math.round((readPos / Math.max(1, book.totalChars)) * 100);

          const lines: string[] = [];
          lines.push('# 共读语境');
          lines.push(
            `你正在和她一起读《${book.title}》${book.author ? `（${book.author}）` : ''}。`,
          );
          lines.push(
            `她目前读到大约 ${percent}% 处（第 ${readPos.toLocaleString('zh')} 字 / 共 ${book.totalChars.toLocaleString('zh')} 字）。`,
          );

          // 1. Already-read window — spoiler-safe: only up to readPos.
          const readSoFar = extractReadSoFar(book.content, readPos, 3000);
          if (readSoFar) {
            lines.push(
              '\n【她已读过的正文片段（最多 3 000 字，截至当前位置）】\n' + readSoFar,
            );
          }

          // 2. Highlighted selection — what the user is specifically looking at.
          if (a?.selection) {
            lines.push(`\n【她划出的重点段落】\n> ${a.selection.replace(/\n/g, '\n> ')}`);
          }

          // 3. Margin notes — bookmarks with notes within the read portion.
          try {
            const notes = await getMarginNotesForContext(book.id, readPos, 8);
            const withNotes = notes.filter((bm) => bm.note);
            if (withNotes.length > 0) {
              lines.push('\n【她的批注 / 边注（已读部分）】');
              for (const bm of withNotes) {
                const bmPct = Math.round((bm.position / Math.max(1, book.totalChars)) * 100);
                lines.push(`- 约 ${bmPct}% 处：「${bm.note}」`);
              }
            }
          } catch { /* ignore — bookmarks optional */ }

          lines.push(
            '\n她接下来发来的不是泛泛聊天，是对刚才那段的吐槽 / 评论 / 提问。' +
            '请围绕这段原文回应，可以同意 / 反驳 / 延伸 / 接梗。' +
            '你可以引用已读部分的原文细节，但不要逐句复读。' +
            `\n⚠️ 防剧透：她只读到 ${percent}% 处，请不要主动提及或暗示后续情节。`,
          );
          bookBlock = lines.join('\n');
        }
      }
    }
  }

  // Memory is split in two by cache stability:
  //
  //   • PINNED facts (long-term memory) — change only when the user pins /
  //     unpins. Deterministically ordered → byte-stable across turns → they
  //     live in a CACHED system layer (the tutorial puts 长期记忆 in BP1).
  //   • Query-scored facts — semantic search keyed off the current user
  //     message, different every turn → volatile zone after BP4.
  //
  // Fetching pinned facts does NOT depend on lastUser: the layer must be
  // present on every request of the conversation (appearing/disappearing
  // between requests would shift the prefix and bust the message cache).
  let pinnedMemoryBlock = '';
  if (persona) {
    try {
      pinnedMemoryBlock = formatPinnedFactsBlock(await getPinnedFacts(persona.id));
    } catch {
      pinnedMemoryBlock = '';
    }
  }

  let memoryBlock = '';
  const lastUser = [...branch].reverse().find((m) => m.role === 'user');
  if (persona && lastUser?.content) {
    try {
      const facts = await retrieveFacts(persona.id, lastUser.content);
      // Pinned facts already live in the cached system layer above.
      memoryBlock = formatFactsBlock(facts.filter((f) => !f.pinned));
    } catch {
      memoryBlock = '';
    }
  }

  const turns: ChatTurn[] = [];

  // ─── Layered system prompt caching (BP1–BP3) ────────────────────────
  // Anthropic cache is prefix-matched byte-for-byte. ANY byte that changes
  // between turns invalidates the cache from that point forward.
  //
  // Rule: ONLY truly stable content goes in system blocks (gets cache_control).
  //       Everything that can change per-turn goes into gateway_volatile_context
  //       which is injected AFTER BP4 (the rolling messages breakpoint) so it
  //       never touches the cached prefix.
  //
  // BP1: persona system prompt — almost never changes
  // BP2: writing style — changes only when the user switches style, stays
  //      byte-identical across every turn of the same conversation.
  // BP3: pinned long-term memory — changes only on pin/unpin, deterministic
  //      ordering keeps it byte-stable (tutorial: 长期记忆 lives in BP1).
  // 4th+ system layers (group awareness) are merged untagged — still cached,
  //      because the rolling message breakpoint (BP4) covers everything
  //      before it anyway; the system tags only matter as fallback
  //      boundaries when messages change.
  //
  // WHY style is in system (not the tail):
  //   The tail approach puts the *full* style text in the uncached zone every
  //   turn.  On a fresh two-turn conversation that adds ~1 000 uncached tokens
  //   and drops the hit rate from ~90 % to ~78–80 %.  The tutorial puts
  //   "语言规则" in BP1 for exactly this reason — cached style = stable prefix.
  //   We keep a short FIXED one-liner in the tail for recency; because that
  //   line never changes, it costs zero cache (same bytes every request).
  //
  // bookBlock, memoryBlock, healthBlock, statusBlock are ALL per-turn volatile:
  //   • bookBlock   — selection/excerpt changes every reading message
  //   • memoryBlock — retrieved via semantic search on the current user query
  //   • healthBlock — step count / heart rate / sync timestamp change throughout the day
  //   • statusBlock — includes current clock time (changes every minute!)
  // These are collected into gateway_volatile_context below and prepended to the
  // last user message (after BP4), so they never bust any cached prefix.

  // BP1: persona (stable — almost never changes)
  if (persona && persona.systemPrompt.trim()) {
    turns.push({ role: 'system', content: persona.systemPrompt });
  }
  // BP2: writing style — stable per conversation, only changes when the user
  // explicitly switches style.  Large style prompts (hundreds–thousands of
  // tokens) belong HERE so they are cached, not repeated uncached every turn.
  if (style && style.prompt.trim()) {
    turns.push({ role: 'system', content: `# 写作风格\n${style.prompt.trim()}` });
  }
  // BP3: pinned long-term memory — stable, deterministic ordering.
  if (pinnedMemoryBlock) {
    turns.push({ role: 'system', content: pinnedMemoryBlock });
  }
  // Group-awareness — stable per group session. May land beyond the 3rd
  // system slot; then it's merged untagged, which is fine (see note above).
  if (persona && groupOthers && groupOthers.length > 0) {
    turns.push({ role: 'system', content: groupAwarenessSnippet(persona, groupOthers) });
  }

  // Fixed recency nudge appended to EVERY current user message.
  // This is a constant string (never changes) so it is cache-neutral — it
  // adds the same bytes after BP4 each request and costs zero cache misses.
  // Its only job is to keep the style+persona at the top of the model's
  // immediate attention window in very long conversations.
  const STYLE_NUDGE = style && style.prompt.trim()
    ? '<style_reminder>请参照上述人设与写作风格设定作答。</style_reminder>'
    : '';

  // ─── Collect volatile context (injected after BP4, not in system) ───
  const volatileParts: string[] = [];
  if (bookBlock) volatileParts.push(bookBlock);
  if (memoryBlock) volatileParts.push(memoryBlock);
  try {
    const healthBlock = await formatHealthContextBlock();
    if (healthBlock) volatileParts.push(healthBlock);
  } catch { /* health data missing — skip silently */ }
  const statusBlock = formatStatusBlock();
  if (statusBlock) volatileParts.push(statusBlock);

  // Apply short-memory window: keep only recent messages so the API doesn't
  // replay the entire conversation each turn. Null = unlimited.
  //
  // Cache note: a naive sliding window (slice(-keep)) shifts the window start
  // by 2 messages EVERY turn — the first history message changes each request,
  // which invalidates the cached prefix right after the system blocks and
  // makes BP4 useless. Instead we drop the oldest messages in CHUNKS of half
  // the window: the window start then stays byte-identical for keep/2 turns
  // between rebuilds, so the rolling cache keeps hitting in between.
  const settings = await getSettings();
  let trimmed: Message[] = branch;
  if (settings.maxHistoryTurns && settings.maxHistoryTurns > 0) {
    const keep = settings.maxHistoryTurns * 2;
    if (branch.length > keep) {
      const chunk = Math.max(2, Math.floor(keep / 2));
      const drop = Math.ceil((branch.length - keep) / chunk) * chunk;
      trimmed = branch.slice(drop);
    }
  }

  if (persona && groupOthers && groupOthers.length > 0) {
    // Group mode: relabel other personas' messages so the responder
    // can attribute who said what.
    const personaById = new Map<string, Persona>([
      [persona.id, persona],
      ...groupOthers.map((p) => [p.id, p] as const),
    ]);
    for (const t of buildGroupTurns(trimmed, persona, personaById)) {
      turns.push(t);
    }
  } else {
    for (const m of trimmed) {
      if (m.role !== 'system' && m.role !== 'user' && m.role !== 'assistant') continue;
      if (!m.content && (!m.attachments || m.attachments.length === 0)) continue;
      turns.push({
        role: m.role,
        content: m.content,
        attachments: m.attachments,
      });
    }
  }

  // ─── Inject volatile context + style tail into the last user message ─
  // Per-turn volatile data (memory recall, current time, health stats,
  // reading anchor) is prepended BEFORE the user's text, and the writing
  // style reminder is appended AFTER it — the very end of the request, the
  // strongest recency position, so the style takes full effect every turn.
  //
  // Both live inside the CURRENT user message, which sits AFTER the BP4
  // rolling breakpoint, so neither ever touches the cached prefix. When this
  // turn becomes history next request, the raw DB content (without any
  // injection) is re-sent — byte-identical across turns — so BP4 still hits.
  //
  //   BP1 (persona)  → always hits  ✓
  //   BP2 (group)    → always hits  ✓
  //   BP4 (history)  → always hits  ✓
  //   volatile+style → uncached, changes freely without any cache miss penalty
  const vcText =
    volatileParts.length > 0
      ? '<gateway_volatile_context>仅供参考，勿复述：\n' +
        volatileParts.join('\n\n') +
        '\n</gateway_volatile_context>'
      : '';
  if (vcText || STYLE_NUDGE) {
    const last = turns[turns.length - 1];
    if (last && last.role === 'user') {
      // Normal turn: volatile before the user's text, fixed nudge at the end.
      const merged = [vcText, last.content, STYLE_NUDGE].filter(Boolean).join('\n\n');
      turns[turns.length - 1] = { ...last, content: merged };
    } else {
      // Conversation ends on an assistant turn (e.g. letPersonaSpeak): append
      // a pseudo-user turn so volatile context and style nudge aren't dropped,
      // and aren't spliced into an older history message (which would rewrite
      // history semantics). It sits after all breakpoints — cache-neutral.
      turns.push({
        role: 'user',
        content: [vcText, STYLE_NUDGE].filter(Boolean).join('\n\n'),
      });
    }
  }

  const convId = branch[0]?.conversationId ?? '';

  let tools: Tool[] = [];
  if (settings.toolsEnabled && convId) {
    tools = await availableTools({ persona, conversationId: convId });
    // Stable ordering: cache prefix must not be invalidated by tool-list shuffling
    tools.sort((a, b) => a.def.name.localeCompare(b.def.name));
  }

  const liveToolCalls: ToolCallRecord[] = [];
  const result = await runToolLoop({
    endpoint,
    model,
    initialTurns: turns,
    tools,
    ctx: { persona, conversationId: convId },
    signal,
    thinking:
      endpoint.format === 'anthropic' && endpoint.thinkingEnabled
        ? { enabled: true, budgetTokens: endpoint.thinkingBudget }
        : undefined,
    callbacks: {
      onTextDelta: (d) => onDelta?.(d, assistantMessageId),
      onThinkingDelta: (d) => onThinking?.(d, assistantMessageId),
      onToolCallResolved: async (call) => {
        liveToolCalls.push(call);
        // Persist incrementally so chips show before next round finishes.
        await db.messages.update(assistantMessageId, {
          toolCalls: [...liveToolCalls],
        });
      },
    },
  });

  const finalStatus: Message['status'] = result.errored ? 'error' : 'done';
  await db.messages.update(assistantMessageId, {
    content: result.text,
    thinking: result.thinking || undefined,
    status: finalStatus,
    errorMessage: result.errorMessage,
    usage: result.usage,
    toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
  });
  const conv = (await db.messages.get(assistantMessageId))?.conversationId;
  if (conv) {
    await db.conversations.update(conv, { updatedAt: Date.now() });
  }
}

/** Walk parent-chain from a message id to root, returning ordered messages (root first). */
async function getPrefixThrough(messageId: string | null): Promise<Message[]> {
  if (!messageId) return [];
  const path: Message[] = [];
  let cursor = await db.messages.get(messageId);
  while (cursor) {
    path.unshift(cursor);
    if (!cursor.parentId) break;
    cursor = await db.messages.get(cursor.parentId);
  }
  return path;
}

/** Switch which sibling is "active" at a branch point and update the conversation's leaf accordingly. */
export async function switchSibling(opts: {
  conversationId: string;
  newActiveMessageId: string;
}): Promise<void> {
  const { conversationId, newActiveMessageId } = opts;
  const target = await db.messages.get(newActiveMessageId);
  if (!target) return;

  await db.transaction('rw', db.messages, db.conversations, async () => {
    if (target.parentId) {
      await db.messages.update(target.parentId, {
        activeChildId: newActiveMessageId,
      });
    }
    // Walk down the activeChild chain from this node to find the new leaf.
    let leaf = target;
    for (;;) {
      const childId = leaf.activeChildId;
      if (!childId) break;
      const child = await db.messages.get(childId);
      if (!child) break;
      leaf = child;
    }
    // If no activeChildId, fall back to walking to deepest descendant via createdAt order.
    if (!leaf.activeChildId) {
      leaf = await deepestDescendant(leaf);
    }
    await db.conversations.update(conversationId, {
      currentLeafId: leaf.id,
      updatedAt: Date.now(),
    });
  });
}

async function deepestDescendant(start: Message): Promise<Message> {
  let cursor = start;
  for (;;) {
    const children = await db.messages
      .where({ conversationId: cursor.conversationId, parentId: cursor.id })
      .sortBy('createdAt');
    if (children.length === 0) return cursor;
    cursor = children[children.length - 1];
  }
}

/**
 * Group mode: trigger another assistant turn from a specific persona without
 * a new user message. The persona "speaks up" given the current transcript.
 * Used by the 'Let [persona] speak' button to drive AI-to-AI chatter.
 */
export async function letPersonaSpeak(opts: {
  conversation: Conversation;
  endpoint: Endpoint;
  model: string;
  persona: Persona;
  style?: WritingStyle;
  groupOthers?: Persona[];
  onDelta?: (delta: string, assistantMessageId: string) => void;
  onThinking?: (delta: string, assistantMessageId: string) => void;
  signal?: AbortSignal;
}): Promise<Message> {
  const {
    conversation,
    endpoint,
    model,
    persona,
    style,
    groupOthers,
    onDelta,
    onThinking,
    signal,
  } = opts;

  const branch = await getActiveBranch(conversation);
  const parentId = branch.at(-1)?.id ?? null;
  const now = Date.now();

  const newAssistant: Message = {
    id: newId(),
    conversationId: conversation.id,
    parentId,
    role: 'assistant',
    content: '',
    status: 'streaming',
    endpointId: endpoint.id,
    model,
    personaId: persona.id,
    createdAt: now,
  };

  await db.transaction('rw', db.messages, db.conversations, async () => {
    await db.messages.add(newAssistant);
    if (parentId) {
      await db.messages.update(parentId, { activeChildId: newAssistant.id });
    }
    await db.conversations.update(conversation.id, {
      currentLeafId: newAssistant.id,
      updatedAt: now,
    });
  });

  await streamAssistant({
    assistantMessageId: newAssistant.id,
    endpoint,
    model,
    persona,
    style,
    groupOthers,
    branch,
    onDelta,
    onThinking,
    signal,
  });

  return newAssistant;
}

export async function createConversation(opts?: {
  title?: string;
  endpointId?: string;
  model?: string;
  personaId?: string;
  personaIds?: string[];
  styleId?: string;
}): Promise<Conversation> {
  const now = Date.now();
  const conv: Conversation = {
    id: newId(),
    title: opts?.title ?? '新对话',
    currentLeafId: null,
    defaultEndpointId: opts?.endpointId,
    defaultModel: opts?.model,
    personaId: opts?.personaId,
    personaIds: opts?.personaIds,
    styleId: opts?.styleId,
    source: 'native',
    createdAt: now,
    updatedAt: now,
  };
  await db.conversations.add(conv);
  return conv;
}

export async function deleteConversation(id: string): Promise<void> {
  await db.transaction('rw', db.conversations, db.messages, async () => {
    await db.messages.where({ conversationId: id }).delete();
    await db.conversations.delete(id);
  });
}

function deriveTitle(text: string): string {
  const firstLine = text.split('\n').find((l) => l.trim()) ?? text;
  const trimmed = firstLine.trim().replace(/\s+/g, ' ');
  return trimmed.length > 24 ? trimmed.slice(0, 24) + '…' : trimmed || '新对话';
}
