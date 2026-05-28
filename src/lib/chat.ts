import { db, getSettings } from '../db';
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
import { streamChat, type ChatTurn } from '../api';
import {
  retrieveFacts,
  formatFactsBlock,
  extractAndStoreFacts,
} from './memory';
import { availableTools, findTool, toolDefs, type Tool } from './tools';
import { buildGroupTurns, groupAwarenessSnippet } from './group';
import { formatStatusBlock } from './behavior';

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
  const prefix = await getPrefixThrough(message.parentId);
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
  // the latest user message has a bookAnchor, build a "currently reading"
  // block to prepend to the system prompt. The persona sees what passage
  // the user is looking at + their selection.
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
          const percent = a
            ? Math.round((a.position / Math.max(1, book.totalChars)) * 100)
            : null;
          const lines: string[] = [];
          lines.push('# 共读语境');
          lines.push(
            `你正在和她一起读《${book.title}》${book.author ? `（${book.author}）` : ''}。`,
          );
          if (percent !== null) lines.push(`她目前读到大约 ${percent}% 处。`);
          if (a?.selection) {
            lines.push(`\n她刚才划出了这一段（重点）：\n> ${a.selection.replace(/\n/g, '\n> ')}`);
          }
          if (a?.excerpt) {
            lines.push(`\n附近的原文（前后约几百字，供你定位）：\n${a.excerpt}`);
          }
          lines.push(
            '\n她接下来发来的不是泛泛聊天，是对刚才那段的吐槽 / 评论 / 提问。\
请围绕这段原文回应，可以同意 / 反驳 / 延伸 / 接梗。\
你可以引用原文细节，但不要逐句复读。',
          );
          bookBlock = lines.join('\n');
        }
      }
    }
  }

  // Memory retrieval: scoped to current persona, keyed off latest user message.
  let memoryBlock = '';
  const lastUser = [...branch].reverse().find((m) => m.role === 'user');
  if (persona && lastUser?.content) {
    try {
      const facts = await retrieveFacts(persona.id, lastUser.content);
      memoryBlock = formatFactsBlock(facts);
    } catch {
      memoryBlock = '';
    }
  }

  const turns: ChatTurn[] = [];
  const systemParts: string[] = [];
  if (persona && persona.systemPrompt.trim()) systemParts.push(persona.systemPrompt);
  if (bookBlock) systemParts.push(bookBlock);
  if (memoryBlock) systemParts.push(memoryBlock);
  // Ambient status: device usage timing + manual quick chips. Always-on for
  // now (local data only, no extra cost). If the user disables it later we
  // can guard on settings.behaviorEnabled.
  const statusBlock = formatStatusBlock();
  if (statusBlock) systemParts.push(statusBlock);
  // In group mode, tell the responder about the other AIs in the room.
  if (persona && groupOthers && groupOthers.length > 0) {
    systemParts.push(groupAwarenessSnippet(persona, groupOthers));
  }
  // Style prompt comes after persona+memory: it shapes register/format
  // without redefining identity. Empty style prompts (e.g. 默认) are
  // skipped so they don't pollute the system message.
  if (style && style.prompt.trim()) {
    systemParts.push(`# 写作风格\n${style.prompt.trim()}`);
  }
  if (systemParts.length > 0) {
    turns.push({ role: 'system', content: systemParts.join('\n\n---\n\n') });
  }
  // Apply short-memory window: keep only the last 2*N messages so the API
  // doesn't replay the entire conversation each turn. Null = unlimited.
  const settings = await getSettings();
  let trimmed: Message[] = branch;
  if (settings.maxHistoryTurns && settings.maxHistoryTurns > 0) {
    const keep = settings.maxHistoryTurns * 2;
    if (branch.length > keep) trimmed = branch.slice(-keep);
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

  // Resolve available tools for this turn (memory tools if memoryEnabled +
  // embedding configured + tools toggle on). When the list is empty, the
  // loop runs exactly once — same as the pre-tool-use path.
  let tools: Tool[] = [];
  if (settings.toolsEnabled) {
    const convId = branch[0]?.conversationId;
    if (convId) {
      tools = await availableTools({ persona, conversationId: convId });
    }
  }
  const toolDefList = toolDefs(tools);

  let acc = '';
  let thinkingAcc = '';
  let errored = false;
  let errorMessage: string | undefined;
  let usage: Message['usage'];
  const toolCalls: ToolCallRecord[] = [];

  // Per-round mutable continuation history.
  const continuation: ChatTurn[] = [...turns];
  const MAX_ROUNDS = 6;

  outer: for (let round = 0; round < MAX_ROUNDS; round++) {
    let stopReason: string | undefined;
    const activeCalls: Record<string, { name: string; argsBuf: string }> = {};
    const completed: { id: string; name: string; input: unknown }[] = [];
    let roundText = '';

    try {
      for await (const evt of streamChat({
        endpoint,
        model,
        messages: continuation,
        signal,
        thinking:
          endpoint.format === 'anthropic' && endpoint.thinkingEnabled
            ? { enabled: true, budgetTokens: endpoint.thinkingBudget }
            : undefined,
        ...(toolDefList.length > 0 && { tools: toolDefList }),
      })) {
        if (evt.type === 'delta' && evt.delta) {
          acc += evt.delta;
          roundText += evt.delta;
          onDelta?.(evt.delta, assistantMessageId);
        } else if (evt.type === 'thinking_delta' && evt.thinkingDelta) {
          thinkingAcc += evt.thinkingDelta;
          onThinking?.(evt.thinkingDelta, assistantMessageId);
        } else if (evt.type === 'tool_call_start' && evt.toolCallStart) {
          activeCalls[evt.toolCallStart.id] = {
            name: evt.toolCallStart.name,
            argsBuf: '',
          };
        } else if (evt.type === 'tool_call_args_delta' && evt.toolCallArgsDelta) {
          const a = activeCalls[evt.toolCallArgsDelta.id];
          if (a) a.argsBuf += evt.toolCallArgsDelta.chunk;
        } else if (evt.type === 'tool_call_end' && evt.toolCallEnd) {
          const a = activeCalls[evt.toolCallEnd.id];
          if (a) {
            let input: unknown = {};
            try {
              input = a.argsBuf ? JSON.parse(a.argsBuf) : {};
            } catch {
              input = { _rawArgs: a.argsBuf };
            }
            completed.push({ id: evt.toolCallEnd.id, name: a.name, input });
          }
        } else if (evt.type === 'error') {
          errored = true;
          errorMessage = evt.errorMessage;
          break outer;
        } else if (evt.type === 'done') {
          usage = evt.usage;
          stopReason = evt.stopReason;
        }
      }
    } catch (err) {
      errored = true;
      errorMessage = err instanceof Error ? err.message : String(err);
      break outer;
    }

    if (stopReason !== 'tool_use' || completed.length === 0) break;

    // Execute tools, persist records, build the continuation turn for the
    // next round.
    const convId = branch[0]?.conversationId;
    const ctx = { persona, conversationId: convId ?? '' };
    const toolResultTurns: ChatTurn[] = [];
    for (const call of completed) {
      const tool = findTool(tools, call.name);
      let result: unknown;
      let error: string | undefined;
      if (!tool) {
        error = `unknown tool: ${call.name}`;
      } else {
        try {
          result = await tool.handler(call.input, ctx);
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
      }
      toolCalls.push({
        id: call.id,
        name: call.name,
        input: call.input,
        result,
        error,
      });
      toolResultTurns.push({
        role: 'tool',
        toolCallId: call.id,
        content: JSON.stringify(error ? { error } : (result ?? null)),
      });
    }

    // Persist the running record + visible text so the user sees the
    // tool chips inline before the next round finishes.
    await db.messages.update(assistantMessageId, {
      content: acc,
      thinking: thinkingAcc || undefined,
      toolCalls: [...toolCalls],
    });

    continuation.push({
      role: 'assistant',
      content: roundText,
      toolCalls: completed,
    });
    for (const tr of toolResultTurns) continuation.push(tr);
  }

  const finalStatus: Message['status'] = errored ? 'error' : 'done';
  await db.messages.update(assistantMessageId, {
    content: acc,
    thinking: thinkingAcc || undefined,
    status: finalStatus,
    errorMessage,
    usage,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
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
