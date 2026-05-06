import { db, getSettings } from '../db';
import type {
  Attachment,
  Conversation,
  Endpoint,
  Message,
  Persona,
} from '../types';
import { newId } from './id';
import { getActiveBranch } from './branch';
import { streamChat, type ChatTurn } from '../api';
import {
  retrieveFacts,
  formatFactsBlock,
  extractAndStoreFacts,
} from './memory';

export interface SendOptions {
  conversation: Conversation;
  endpoint: Endpoint;
  model: string;
  userText: string;
  persona?: Persona;
  /** User-attached images/files for this turn. */
  attachments?: Attachment[];
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
    attachments,
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
    });
  });

  await streamAssistant({
    assistantMessageId: assistantMessage.id,
    endpoint,
    model,
    persona,
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

/** Fire-and-forget extraction; never throws into the chat path. */
function scheduleFactExtraction(args: {
  persona?: Persona;
  conversationId: string;
  userMessage: Message;
  assistantMessage: Message;
}) {
  if (!args.persona) return;
  if (args.assistantMessage.status !== 'done') return;
  if (!args.assistantMessage.content.trim()) return;
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
    branch,
    onDelta,
    onThinking,
    signal,
  } = args;

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
  if (memoryBlock) systemParts.push(memoryBlock);
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

  for (const m of trimmed) {
    if (m.role !== 'system' && m.role !== 'user' && m.role !== 'assistant') continue;
    if (!m.content && (!m.attachments || m.attachments.length === 0)) continue;
    turns.push({
      role: m.role,
      content: m.content,
      attachments: m.attachments,
    });
  }

  let acc = '';
  let thinkingAcc = '';
  let errored = false;
  let errorMessage: string | undefined;
  let usage: Message['usage'];

  try {
    for await (const evt of streamChat({
      endpoint,
      model,
      messages: turns,
      signal,
      thinking:
        endpoint.format === 'anthropic' && endpoint.thinkingEnabled
          ? { enabled: true, budgetTokens: endpoint.thinkingBudget }
          : undefined,
    })) {
      if (evt.type === 'delta' && evt.delta) {
        acc += evt.delta;
        onDelta?.(evt.delta, assistantMessageId);
      } else if (evt.type === 'thinking_delta' && evt.thinkingDelta) {
        thinkingAcc += evt.thinkingDelta;
        onThinking?.(evt.thinkingDelta, assistantMessageId);
      } else if (evt.type === 'error') {
        errored = true;
        errorMessage = evt.errorMessage;
        break;
      } else if (evt.type === 'done') {
        usage = evt.usage;
      }
    }
  } catch (err) {
    errored = true;
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  const finalStatus: Message['status'] = errored ? 'error' : 'done';
  await db.messages.update(assistantMessageId, {
    content: acc,
    thinking: thinkingAcc || undefined,
    status: finalStatus,
    errorMessage,
    usage,
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

export async function createConversation(opts?: {
  title?: string;
  endpointId?: string;
  model?: string;
  personaId?: string;
}): Promise<Conversation> {
  const now = Date.now();
  const conv: Conversation = {
    id: newId(),
    title: opts?.title ?? '新对话',
    currentLeafId: null,
    defaultEndpointId: opts?.endpointId,
    defaultModel: opts?.model,
    personaId: opts?.personaId,
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
