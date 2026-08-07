import { db, getSettings } from '../db';
import { getMarginNotesForContext } from './books';
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
import { thinkingOptsFromEndpoint } from '../api/thinking';
import {
  resolveThinkingEffort,
  wantsHealthContext,
} from './thinking-policy';
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
import { parseArtifacts } from './artifacts';
import {
  applyInjectionReceipt,
  enqueueTasksFromAssistant,
} from './workshop/handoff-store';
import { pumpHandoffQueue } from './workshop/handoff-runner';
import {
  buildResultInjection,
  stripClwdTaskTags,
  type HandoffJob,
} from './workshop/handoff-protocol';
import { formatYesterdayDiaryBlock } from './diary';
import { formatLastWeekDiaryBlock } from './weekly-diary';
import { trimHistoryForContext } from './history-window';
import { assertChatMessageSize, formatStorageError } from './storage-guards';
import { afterkiss } from './afterkiss';

/**
 * Capability description injected as a stable system turn so the model
 * knows how to produce file artifacts and choice selectors. Kept as a
 * constant so it is byte-stable across requests and benefits from prompt
 * caching.
 */
const ARTIFACTS_CAPABILITY = `# 输出能力：文件 Artifact 与选择器

你可以在回复中生成文件或多选按钮，使用以下标签格式：

## 文件 Artifact
格式：[file name=文件名.扩展名]完整文件内容[/file]

规则：
- 凡是"成品"性质的内容（完整 HTML 页面、Markdown 文档、代码文件、配置文件等）都用文件标签发送，不要把完整代码贴在聊天气泡里刷屏
- 文件名要有意义，扩展名准确（.html / .md / .py / .js / .ts / .css / .json 等）
- 一条回复可以包含多个文件标签
- 文件标签外可以有正常的聊天文字

## 选择器
格式：[choices]选项A|选项B|选项C[/choices]

规则：
- 当需要让用户从有限选项中选择时使用，选项用 | 分隔
- 自己判断时机，不要滥用；纯聊天、开放性问题不需要选择器
- 一条回复里只用一个 [choices] 标签

示例（HTML 文件）：
好的，这是你要的登录页面：
[file name=login.html]<!DOCTYPE html>
<html lang="zh">
<head><meta charset="UTF-8"><title>登录</title></head>
<body><form>...</form></body>
</html>[/file]

示例（选择器）：
你想要哪种风格？
[choices]极简白色|深色模式|彩色渐变[/choices]`;

/**
 * CLWD Handoff capability — only injected when workshopHandoffEnabled.
 * Byte-stable constant for prompt caching.
 */
const HANDOFF_CAPABILITY = `# 输出能力：炼金工房任务派发（CLWD Handoff）

当你需要改代码、查仓库、写报告等施工类任务时，可在自然回复之后输出：

[clwd-task title="短标题"]
自包含的任务说明（工作区模型看不到完整聊天历史，必须写清楚背景、目标与验收标准）
[/clwd-task]

规则：
- 标签会对用户隐藏；聊天里只显示你的自然语言
- 单轮最多 3 个任务；标题 ≤ 120 字
- 不要在标签里写密钥、账号或内部路径
- 不是所有事都要外派；聊天、情感、轻量问答请自己完成
- 结果不会自动回流；用户勾选后随下一条消息带回`;

const TOY_CAPABILITY = `# 输出能力：玩具力度（AfterKiss）

用户已启动玩具。你可以通过工具 control_toy 调节三路力度（各 0–100）：
- thrust：抽插
- vibe：棒身震动
- clit：阴蒂

规则：
- 按对话氛围主动调节；有感觉变化时再用，不要每句都狂调
- 省略的通道保持当前值；stop=true 急停归零
- 不要向用户复述原始数值协议；用自然语言表达触感即可`;

const MEMORY_CAPABILITY = `# 输出能力：长期记忆（remember / recall / update_memory / forget_memory）

你可以为当前人格读写记忆池。系统已开启记忆工具：

- remember(text, category?)：记下值得跨对话保留的稳定事实（工作/住址/偏好/身边的人/持续状况）。瞬时心情与闲聊不要记。
- recall(query, k?)：按语义检索已有记忆；改写或遗忘前先召回拿 id。
- update_memory(id, text, category?)：用户纠正、情况变化、旧记忆过时时改写并重新嵌入。
- forget_memory(id, reason?)：归档错误、过时或已被取代的记忆。

规则：
- 对话中一旦出现可复用的稳定信息，应主动 remember，不必等她说「记一下」
- 她纠正旧说法时，先 recall 再 update_memory 或 forget_memory
- 每条事实写完整一句、自含上下文；不要向用户复述工具原始返回`;

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
  /** CLWD handoff job ids the user selected to inject with this turn. */
  handoffIds?: string[];
  /** Sticky UI「长思考」— force max effort this turn. */
  deepThink?: boolean;
  /** Lean path for proactive nudge: no tools, no thinking, no fact extract. */
  economy?: boolean;
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
    handoffIds,
    deepThink,
    economy,
    onDelta,
    onThinking,
    signal,
  } = opts;
  const now = Date.now();
  const isNudge = userText.trimStart().startsWith('[nudge]');
  const lean = economy === true || isNudge;

  // Reject novel-length pastes before they hit IndexedDB — oversized rows
  // have OOMed the chat UI and, after a panicked replace-import, wiped DBs.
  try {
    assertChatMessageSize(userText);
  } catch (err) {
    throw new Error(formatStorageError(err), { cause: err });
  }

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

  try {
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
  } catch (err) {
    throw new Error(formatStorageError(err), { cause: err });
  }

  await streamAssistant({
    assistantMessageId: assistantMessage.id,
    userMessageId: userMessage.id,
    endpoint,
    model,
    persona,
    style,
    groupOthers,
    branch: [...branch, userMessage],
    handoffIds,
    deepThink,
    economy: lean,
    onDelta,
    onThinking,
    signal,
  });

  const final = await db.messages.get(assistantMessage.id);
  if (!lean) {
    scheduleFactExtraction({
      persona,
      conversationId: conversation.id,
      userMessage,
      assistantMessage: final ?? assistantMessage,
    });
  }
  const finalUser = await db.messages.get(userMessage.id);
  return {
    userMessage: finalUser ?? userMessage,
    assistantMessage: final ?? assistantMessage,
  };
}

/** Tool names that mean the model already managed memory this turn —
 *  skip the auto-extractor so we don't double-write. */
const MEMORY_WRITE_TOOLS = new Set([
  'remember',
  'update_memory',
  'forget_memory',
]);

/** True only when a memory write tool actually succeeded this turn.
 *  Failed/errored calls must NOT suppress auto-extract — otherwise neither
 *  path writes and lasting facts are lost. */
function memoryWriteSucceeded(call: ToolCallRecord): boolean {
  if (!MEMORY_WRITE_TOOLS.has(call.name)) return false;
  if (call.error) return false;
  const r = call.result;
  if (!r || typeof r !== 'object') return false;
  const obj = r as Record<string, unknown>;
  if (typeof obj.error === 'string' && obj.error) return false;
  return !!(obj.added || obj.updated || obj.forgotten);
}

/** Fire-and-forget extraction; never throws into the chat path. Skipped
 *  when the model successfully used a memory write/edit tool this turn. */
function scheduleFactExtraction(args: {
  persona?: Persona;
  conversationId: string;
  userMessage: Message;
  assistantMessage: Message;
}) {
  if (!args.persona) return;
  if (args.assistantMessage.status !== 'done') return;
  if (!args.assistantMessage.content.trim()) return;
  const usedMemoryWrite = (args.assistantMessage.toolCalls ?? []).some(
    memoryWriteSucceeded,
  );
  if (usedMemoryWrite) return;
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
  try {
    assertChatMessageSize(newText);
  } catch (err) {
    throw new Error(formatStorageError(err), { cause: err });
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
  /** User message that triggered this assistant turn (for CLWD receipt). */
  userMessageId?: string;
  endpoint: Endpoint;
  model: string;
  persona?: Persona;
  style?: WritingStyle;
  /** In a group conversation, the OTHER personas (not the responder). */
  groupOthers?: Persona[];
  /** Full message chain leading up to (and including) the user turn whose response we're generating. */
  branch: Message[];
  /** CLWD handoff job ids to inject with this user turn. */
  handoffIds?: string[];
  deepThink?: boolean;
  economy?: boolean;
  onDelta?: (delta: string, assistantMessageId: string) => void;
  onThinking?: (delta: string, assistantMessageId: string) => void;
  signal?: AbortSignal;
}) {
  const {
    assistantMessageId,
    userMessageId,
    endpoint,
    model,
    persona,
    style,
    groupOthers,
    branch,
    handoffIds,
    deepThink,
    economy,
    onDelta,
    onThinking,
    signal,
  } = args;

  const lastUserText =
    [...branch].reverse().find((m) => m.role === 'user')?.content ?? '';

  // Reading-session context.
  //
  // Two modes depending on bookAnchor.isAnnotation:
  //
  // ① 批注模式 (isAnnotation=true) — user formally annotated a passage.
  //   The AI sees: title/author, reading progress, the selected passage
  //   (±800 chars), an explicit anti-spoiler guard, and any nearby margin
  //   notes. This is the "grounded in the real text" response.
  //
  // ② 吐槽模式 (isAnnotation=false/absent) — casual in-reader comment.
  //   The AI sees: title/author and reading progress only. No book text is
  //   injected — the response stays conversational without pulling raw prose.
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

          if (a?.isAnnotation) {
            // ① Annotation mode — inject the local passage so the AI can
            //   engage with the specific text being annotated.
            lines.push('# 共读批注');
            lines.push(
              `你正在和她一起读《${book.title}》${book.author ? `（${book.author}）` : ''}。`,
            );
            lines.push(`她批注时所在位置：约 ${percent}% 处。`);

            // The highlighted passage itself (selection or excerpt).
            if (a.selection) {
              lines.push(`\n【她标注的段落】\n> ${a.selection.replace(/\n/g, '\n> ')}`);
            }
            // Local context window (±800 chars) for passage grounding.
            if (a.excerpt) {
              lines.push(`\n【段落周边原文（前后约数百字）】\n${a.excerpt}`);
            }

            // Nearby margin notes within the read portion.
            try {
              const notes = await getMarginNotesForContext(book.id, readPos, 5);
              const withNotes = notes.filter((bm) => bm.note);
              if (withNotes.length > 0) {
                lines.push('\n【她在附近的其他批注】');
                for (const bm of withNotes) {
                  const bmPct = Math.round((bm.position / Math.max(1, book.totalChars)) * 100);
                  lines.push(`- 约 ${bmPct}% 处：「${bm.note}」`);
                }
              }
            } catch { /* ignore */ }

            lines.push(
              '\n她发来的是对这段原文的正式批注 / 提问。' +
              '请围绕这段原文给出有深度的回应：可以赏析、联系上下文、对比其他作品，或回答她的问题。' +
              `\n⚠️ 防剧透：她只读到 ${percent}% 处，请不要主动涉及后续情节。`,
            );
          } else {
            // ② Casual 吐槽 mode — lightweight header only.
            lines.push('# 共读语境');
            lines.push(
              `你正在和她一起读《${book.title}》${book.author ? `（${book.author}）` : ''}，她目前读到约 ${percent}% 处。`,
            );
            lines.push('她发来的是阅读途中的随想 / 吐槽 / 闲聊，不一定针对特定段落。正常聊天回应即可。');
          }

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
  // Tagged system order (must match anthropic.ts buildSystemBlocks):
  //   BP1: persona
  //   BP2: writing style
  //   BP3: pinned long-term memory
  // Untagged rest (still covered by BP4 when stable): yesterday's diary
  //   (date-stable all day), artifacts/handoff capability, group awareness.
  //   Capabilities come AFTER the three tagged BPs so they don't steal slots.
  //
  // Cost target: long chats ≥97% hit. Diary used to live in volatile and
  // could dump 300–1500+ uncached toks every turn — moved to system.
  //
  // bookBlock / memoryBlock / healthBlock / statusBlock stay volatile:
  //   • bookBlock   — selection/excerpt changes every reading message
  //   • memoryBlock — semantic recall on the current user query
  //   • healthBlock — steps/HR change through the day (no minute clock)
  //   • statusBlock — gap/typing/quick-state only (no always-on HH:MM)

  const settings = await getSettings();

  // BP1: persona (stable — almost never changes)
  if (persona && persona.systemPrompt.trim()) {
    turns.push({ role: 'system', content: persona.systemPrompt });
  }
  // BP2: writing style — stable per conversation; full text cached here.
  if (style && style.prompt.trim()) {
    turns.push({
      role: 'system',
      content:
        `# 写作风格\n` +
        `【最高优先级】以下条款覆盖人设中任何关于语气、口吻、说话方式、用词习惯的描述；` +
        `必须严格遵守，不得用人设语气稀释或覆盖。\n\n` +
        style.prompt.trim(),
    });
  }
  // BP3: pinned long-term memory — stable, deterministic ordering.
  if (pinnedMemoryBlock) {
    turns.push({ role: 'system', content: pinnedMemoryBlock });
  }

  // Untagged stable layers (after BP3) — still in the cached prefix via BP4.
  // Yesterday's diary is byte-stable for the whole local day; only rewrites
  // once at midnight. Last week's 周记 is stable until the next readWeekday.
  // Keeping them HERE (not volatile) is the main 97%+ lever.
  if (persona) {
    try {
      const diaryBlock = await formatYesterdayDiaryBlock(persona.id);
      if (diaryBlock) turns.push({ role: 'system', content: diaryBlock });
    } catch { /* diary missing — skip silently */ }
    try {
      const weeklyBlock = await formatLastWeekDiaryBlock(persona.id);
      if (weeklyBlock) turns.push({ role: 'system', content: weeklyBlock });
    } catch { /* weekly diary missing — skip silently */ }
  }
  // Capability blurbs only when the surface can use them — pure companion
  // chat was paying ~400–600 cached toks on every cold start for nothing.
  if (settings.toolsEnabled || settings.workshopHandoffEnabled) {
    turns.push({ role: 'system', content: ARTIFACTS_CAPABILITY });
  }
  if (settings.workshopHandoffEnabled) {
    turns.push({ role: 'system', content: HANDOFF_CAPABILITY });
  }
  if (settings.toyControlEnabled) {
    turns.push({ role: 'system', content: TOY_CAPABILITY });
  }
  // Memory tools ride memoryEnabled + embedding (independent of tools master).
  const memoryToolsReady =
    !!persona &&
    settings.memoryEnabled &&
    !!settings.embeddingEndpointId &&
    !!settings.embeddingModel;
  if (memoryToolsReady) {
    turns.push({ role: 'system', content: MEMORY_CAPABILITY });
  }
  if (persona && groupOthers && groupOthers.length > 0) {
    turns.push({ role: 'system', content: groupAwarenessSnippet(persona, groupOthers) });
  }

  // Style at the user-message edge. Default (`off`) is a FIXED short nudge
  // (~25 toks, never embeds style.prompt) so the uncached zone stays tiny.
  // `before` / `after` inject the FULL prompt (consult-room obedience) at the
  // chosen side of the user's text — settings.styleUserInject.
  const stylePrompt = style?.prompt?.trim() ?? '';
  const injectMode = settings.styleUserInject ?? 'off';
  const STYLE_NUDGE =
    stylePrompt && injectMode === 'off'
      ? '<style_reminder>按系统「# 写作风格」作答。</style_reminder>'
      : '';
  const STYLE_FULL =
    stylePrompt && (injectMode === 'before' || injectMode === 'after')
      ? `<style_reminder>本轮写作风格要求（务必遵守；与人设语气冲突时以本风格为准；勿复述）：\n${stylePrompt}\n</style_reminder>`
      : '';
  const styleBefore = injectMode === 'before' ? STYLE_FULL : '';
  const styleAfter =
    injectMode === 'after' ? STYLE_FULL : STYLE_NUDGE;

  // ─── Collect volatile context (injected after BP4, not in system) ───
  const volatileParts: string[] = [];
  if (bookBlock) volatileParts.push(bookBlock);
  if (memoryBlock) volatileParts.push(memoryBlock);
  // Health is volatile (steps change) — only inject when the user asks,
  // so idle turns don't burn uncached tokens every time.
  if (wantsHealthContext(lastUserText)) {
    try {
      const healthBlock = await formatHealthContextBlock();
      if (healthBlock) volatileParts.push(healthBlock);
    } catch { /* health data missing — skip silently */ }
  }
  const statusBlock = formatStatusBlock();
  if (statusBlock) volatileParts.push(statusBlock);

  // CLWD selected results — ride the current user turn (not a system message).
  // Hard-cap size: full 40k×12 dumps nuke hit rate on that turn.
  let handoffInjectJobs: HandoffJob[] = [];
  const earlyConvId = branch[0]?.conversationId ?? '';
  if (handoffIds && handoffIds.length > 0 && earlyConvId) {
    const jobs = await db.handoffJobs.bulkGet(handoffIds);
    const bundle = buildResultInjection({
      sourceConversationId: earlyConvId,
      requestedIds: handoffIds,
      jobs: jobs.filter((j): j is HandoffJob => !!j),
      limits: { maxResultCount: 3, maxResultLength: 3000 },
    });
    if (bundle.context) {
      volatileParts.unshift(bundle.context);
      handoffInjectJobs = bundle.jobs;
    }
  }

  // History window (wallet):
  //   1. historyTodayOnly (default on) — at local midnight drop yesterday's
  //      messages. Continuity is persona + memory + yesterday's diary +
  //      optional style inject — not a re-bill of the full multi-day novel.
  //   2. maxHistoryTurns — within today, keep only recent pairs.
  //
  // Cache note: a naive sliding window (slice(-keep)) shifts the window start
  // by 2 messages EVERY turn — the first history message changes each request,
  // which invalidates the cached prefix right after the system blocks and
  // makes BP4 useless. trimHistoryForContext drops oldest in CHUNKS of half
  // the window so the start stays byte-identical for keep/2 turns between
  // rebuilds. Midnight day-boundary is an intentional one-time cache miss.
  const trimmed = trimHistoryForContext(branch, {
    historyTodayOnly: settings.historyTodayOnly,
    maxHistoryTurns: settings.maxHistoryTurns,
  });

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

  // ─── Inject volatile context + style block into the last user message ─
  // Per-turn volatile data is always prepended BEFORE the user's text.
  // Style placement follows settings.styleUserInject:
  //   off    → short FIXED nudge AFTER the text (cache-cheap default)
  //   before → FULL style.prompt BEFORE the text (after volatile)
  //   after  → FULL style.prompt AFTER the text (consult-room style)
  //
  // Both live inside the CURRENT user message, AFTER BP4, so they never
  // touch the cached prefix. Next turn the raw DB content is re-sent
  // (no injection) — BP4 still hits.
  //
  //   BP1 (persona)     → always hits  ✓
  //   BP2 (full style)  → always hits  ✓
  //   BP3 (pinned)      → always hits  ✓
  //   diary/capabilities→ covered by BP4 when stable  ✓
  //   BP4 (history)     → always hits  ✓
  //   volatile+style    → uncached; full inject trades hit rate for obedience
  const vcText =
    volatileParts.length > 0
      ? '<gateway_volatile_context>仅供参考，勿复述：\n' +
        volatileParts.join('\n\n') +
        '\n</gateway_volatile_context>'
      : '';
  if (vcText || styleBefore || styleAfter) {
    const last = turns[turns.length - 1];
    if (last && last.role === 'user') {
      const merged = [vcText, styleBefore, last.content, styleAfter]
        .filter(Boolean)
        .join('\n\n');
      turns[turns.length - 1] = { ...last, content: merged };
    } else {
      // Conversation ends on an assistant turn (e.g. letPersonaSpeak): append
      // a pseudo-user turn so volatile context and style aren't dropped,
      // and aren't spliced into an older history message (which would rewrite
      // history semantics). It sits after all breakpoints — cache-neutral.
      turns.push({
        role: 'user',
        content: [vcText, styleBefore, styleAfter].filter(Boolean).join('\n\n'),
      });
    }
  }

  const convId = branch[0]?.conversationId ?? '';

  let tools: Tool[] = [];
  // Toy control and memory tools are independent of the general tools master
  // switch — enabling 记忆 / 玩具 is enough to expose their tools. MCP /
  // documents / music still require toolsEnabled.
  if (
    !economy &&
    convId &&
    (settings.toolsEnabled || settings.toyControlEnabled || memoryToolsReady)
  ) {
    tools = await availableTools({ persona, conversationId: convId });
    if (!settings.toolsEnabled) {
      const allow = new Set<string>();
      if (settings.toyControlEnabled) allow.add('control_toy');
      if (memoryToolsReady) {
        allow.add('remember');
        allow.add('recall');
        allow.add('update_memory');
        allow.add('forget_memory');
      }
      tools = tools.filter((t) => allow.has(t.def.name));
    }
    // Stable ordering: cache prefix must not be invalidated by tool-list shuffling
    tools.sort((a, b) => a.def.name.localeCompare(b.def.name));
  }

  const effort = resolveThinkingEffort({
    baseline: endpoint.thinkingEffort ?? 'medium',
    forceDeepThink: deepThink,
    userText: lastUserText,
  });

  const liveToolCalls: ToolCallRecord[] = [];
  const result = await runToolLoop({
    endpoint,
    model,
    initialTurns: turns,
    tools,
    ctx: { persona, conversationId: convId },
    signal,
    thinking: thinkingOptsFromEndpoint(endpoint, {
      effort,
      disable: economy === true,
    }),
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

  // Parse artifact and choices tags out of the raw response text so the
  // chat bubble only shows clean prose while cards/buttons render separately.
  const { cleanText: artifactClean, artifacts, choices } = parseArtifacts(
    result.text,
  );

  // CLWD: strip [clwd-task] from visible text and enqueue durable jobs.
  let cleanText = stripClwdTaskTags(artifactClean);
  if (settings.workshopHandoffEnabled && convId && finalStatus === 'done') {
    try {
      const workerModel =
        settings.workshopModel || settings.defaultModel || model;
      const enqueued = await enqueueTasksFromAssistant({
        assistantText: artifactClean,
        conversationId: convId,
        assistantMessageId,
        dispatch: {
          account: settings.workshopEndpointId || endpoint.id,
          model: workerModel,
        },
      });
      cleanText = enqueued.cleanText;
      if (enqueued.jobs.length > 0) {
        void pumpHandoffQueue(convId);
      }
    } catch (e) {
      console.warn('[clwd] enqueue failed:', e);
      cleanText = stripClwdTaskTags(artifactClean);
    }
  }

  const toyIntensity = settings.toyControlEnabled
    ? afterkiss.getChannels()
    : undefined;

  await db.messages.update(assistantMessageId, {
    content: cleanText,
    artifacts: artifacts.length > 0 ? artifacts : undefined,
    choices: choices.length > 0 ? choices : undefined,
    thinking: result.thinking || undefined,
    status: finalStatus,
    errorMessage: result.errorMessage,
    usage: result.usage,
    toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
    toyIntensity,
  });
  if (convId) {
    await db.conversations.update(convId, { updatedAt: Date.now() });
  }

  // CLWD receipt only after the source turn persisted successfully.
  if (
    !result.errored &&
    userMessageId &&
    handoffInjectJobs.length > 0 &&
    earlyConvId
  ) {
    try {
      await applyInjectionReceipt({
        conversationId: earlyConvId,
        jobIds: handoffInjectJobs.map((j) => j.id),
        userMessageId,
      });
    } catch (e) {
      console.warn('[clwd] injection receipt failed:', e);
    }
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
