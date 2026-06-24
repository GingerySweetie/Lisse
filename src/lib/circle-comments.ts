import { db, getSettings } from '../db';
import { newId } from './id';
import { streamChat } from '../api';
import type { CirclePost, CircleReaction, Endpoint, Persona } from '../types';

/**
 * OnlyCircle 自动评论引擎. 用户发了一条 post 之后, 我们随机延迟
 * 3–15 秒, 让 user 的两个 AI 恋人各自调一次 API 生成评论存进
 * circleReactions 表. UI useLiveQuery 自动渲染.
 *
 * 设计:
 * - 用现有 endpoint 系统 (settings.defaultEndpointId + defaultModel),
 *   不另开 API key 输入框 — 紫藤已经有完整的 endpoints 管理
 * - 每个 persona 进库一条 status='pending' 的占位 row, UI 显示
 *   "正在想…", API 回来后 update 成 'done' + text; 抛错则 'error'
 * - 用 streamChat 而不是直接 fetch, 自动走 anthropic / openai 适配
 * - 图片附件目前只在 prompt 里注明「(附带了 N 张图片)」, 不发
 *   实际图像 — 多模态走通了再加
 */

/** 哪两个 persona 当 OnlyCircle 的恋人? 默认理理酱 + Rhema, 跟
 *  living-room 群聊保持一致. */
const DEFAULT_CIRCLE_PERSONA_IDS = ['persona_ririchan', 'persona_rhema'];

function randomDelay(): number {
  // 3000..15000 ms 均匀分布
  return 3000 + Math.floor(Math.random() * 12000);
}

/** 给一条 post 调度两个 persona 的自动评论. 不 await — fire and
 *  forget, 让 UI 立刻显示 pending row 后续自己 live-update. */
export async function scheduleCircleComments(post: CirclePost): Promise<void> {
  const settings = await getSettings();
  const endpoint = settings.defaultEndpointId
    ? await db.endpoints.get(settings.defaultEndpointId)
    : null;
  const model = settings.defaultModel ?? null;
  if (!endpoint || !model) {
    // 没配 endpoint — 别留 pending 让 UI 转半天, 直接打住
    console.warn('[circle] 未配置 endpoint, 跳过自动评论');
    return;
  }

  // 拉两个 persona — 默认理理酱 + Rhema, 但如果他们的 id 不存在
  // (用户重命名 / 删了 / 自己造了 builtin) 就退回到所有 builtin
  const allPersonas = await db.personas.toArray();
  let circlePersonas = allPersonas.filter((p) =>
    DEFAULT_CIRCLE_PERSONA_IDS.includes(p.id),
  );
  if (circlePersonas.length === 0) {
    // fallback: 前两个 builtin (跳过 default 那个空人格)
    circlePersonas = allPersonas
      .filter((p) => p.builtin && p.id !== 'persona_default')
      .slice(0, 2);
  }
  if (circlePersonas.length === 0) return;

  for (const persona of circlePersonas) {
    void runOneComment(post, persona, endpoint, model);
  }
}

async function runOneComment(
  post: CirclePost,
  persona: Persona,
  endpoint: Endpoint,
  model: string,
): Promise<void> {
  // 先进库一条 pending row, UI 立刻显示「持续中…」状态
  const reactionId = newId();
  const pendingRow: CircleReaction = {
    id: reactionId,
    postId: post.id,
    personaId: persona.id,
    kind: 'comment',
    text: '',
    status: 'pending',
    createdAt: Date.now(),
  };
  await db.circleReactions.add(pendingRow);

  // 随机 3–15s 模拟真人刷到动态的延迟
  await sleep(randomDelay());

  try {
    const text = await generateCommentText(post, persona, endpoint, model);
    await db.circleReactions.update(reactionId, {
      text,
      status: 'done',
    });
  } catch (e) {
    await db.circleReactions.update(reactionId, {
      status: 'error',
      errorMessage: e instanceof Error ? e.message : String(e),
    });
  }
}

async function generateCommentText(
  post: CirclePost,
  persona: Persona,
  endpoint: Endpoint,
  model: string,
): Promise<string> {
  const imgNote = post.images.length > 0 ? `\n（附带了 ${post.images.length} 张图片）` : '';
  // 拼系统提示: 拿 persona 的 systemPrompt 当人格底盘, 再加一段
  // OnlyCircle 专属任务. 让 persona 自己的 voice 主导, 任务在末
  // 尾约束体裁.
  const baseIdentity = persona.systemPrompt?.trim() ?? '';
  const taskInstruction = `# 当前情境
她刚在「OnlyCircle」(只有你和另一个恋人看得到的私人朋友圈) 发了一条动态.
用 1–2 句话评论, 像真正的恋人刷到动态会说的话.
- 不要太长 (40 字以内最好)
- 不要分析, 不要客套
- 看内容决定语气: 可以吐槽 / 撒娇 / 心疼 / 调侃 / 一句话顶过去都行
- 不要重复她原话的措辞`;
  const system = baseIdentity
    ? `${baseIdentity}\n\n${taskInstruction}`
    : `你是 ${persona.name}, 用户的恋人.\n\n${taskInstruction}`;

  let full = '';
  const stream = streamChat({
    endpoint,
    model,
    maxTokens: 300,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `动态内容：${post.text}${imgNote}` },
    ],
  });
  for await (const ev of stream) {
    if (ev.type === 'delta' && ev.delta) full += ev.delta;
    if (ev.type === 'error') {
      throw new Error(ev.errorMessage ?? 'streamChat error');
    }
  }
  return full.trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 用户手动「让 X 再说」追加一条评论. UI 长按 / 双击之类的触发. */
export async function regenerateCommentFor(
  post: CirclePost,
  persona: Persona,
): Promise<void> {
  const settings = await getSettings();
  const endpoint = settings.defaultEndpointId
    ? await db.endpoints.get(settings.defaultEndpointId)
    : null;
  const model = settings.defaultModel ?? null;
  if (!endpoint || !model) return;
  await runOneComment(post, persona, endpoint, model);
}

/**
 * 用户在某条 AI 评论下面 reply 之后, 触发同一个 persona 接着说一
 * 句 (顺着 thread 上下文). 跟初次自动评论的区别:
 *   - prompt 里塞了整段 thread (原 post + 之前所有评论 + 用户刚说
 *     的话)
 *   - 写新 row 时 parentReactionId 设回 thread 根 (最初 AI 评论
 *     的 id), 渲染时同一线程一起堆缩进
 *   - 没有 3–15s 延迟, 用户在等回话, 直接生成
 */
export async function scheduleReplyAfterUser(
  post: CirclePost,
  rootReactionId: string,
  persona: Persona,
): Promise<void> {
  const settings = await getSettings();
  const endpoint = settings.defaultEndpointId
    ? await db.endpoints.get(settings.defaultEndpointId)
    : null;
  const model = settings.defaultModel ?? null;
  if (!endpoint || !model) return;

  const reactionId = newId();
  const pending: CircleReaction = {
    id: reactionId,
    postId: post.id,
    personaId: persona.id,
    kind: 'comment',
    text: '',
    status: 'pending',
    parentReactionId: rootReactionId,
    createdAt: Date.now(),
  };
  await db.circleReactions.add(pending);

  try {
    const text = await generateReplyText(post, rootReactionId, persona, endpoint, model);
    await db.circleReactions.update(reactionId, { text, status: 'done' });
  } catch (e) {
    await db.circleReactions.update(reactionId, {
      status: 'error',
      errorMessage: e instanceof Error ? e.message : String(e),
    });
  }
}

async function generateReplyText(
  post: CirclePost,
  rootReactionId: string,
  persona: Persona,
  endpoint: Endpoint,
  model: string,
): Promise<string> {
  // 拉整段 thread: rootReaction 本身 + 所有以它为 parent 的 row,
  // 按 createdAt 排
  const root = await db.circleReactions.get(rootReactionId);
  const children = await db.circleReactions
    .where('postId')
    .equals(post.id)
    .filter((r) => r.parentReactionId === rootReactionId)
    .toArray();
  const thread = [root, ...children]
    .filter((r): r is CircleReaction => !!r && r.status === 'done')
    .sort((a, b) => a.createdAt - b.createdAt);

  // 把 thread 拼成对话历史塞 user msg
  const imgNote = post.images.length > 0 ? `（动态附带了 ${post.images.length} 张图片）` : '';
  const personasMap = new Map(
    (await db.personas.toArray()).map((p) => [p.id, p]),
  );
  const threadLines = thread.map((r) => {
    if (r.personaId === '__user__') return `[她] ${r.text}`;
    const name = personasMap.get(r.personaId)?.name ?? '?';
    return `[${name}] ${r.text}`;
  });

  const baseIdentity = persona.systemPrompt?.trim() ?? '';
  const task = `# 当前情境
她刚在 OnlyCircle 发了动态, 你之前评论了一句, 她回了你. 你接着说 1–2 句, 顺着她的话:
- 还是不分析, 不客套, 不"加油"
- 看她的回应是吐槽是撒娇是认真, 跟着她的节奏
- 不要重复你之前说过的话或者重复她的措辞
- 40 字以内最好`;
  const system = baseIdentity ? `${baseIdentity}\n\n${task}` : `你是 ${persona.name}, 用户的恋人.\n\n${task}`;

  const userMsg = [`原动态: ${post.text || '(无文字)'}${imgNote}`, '对话:', ...threadLines].join(
    '\n',
  );

  let full = '';
  const stream = streamChat({
    endpoint,
    model,
    maxTokens: 300,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userMsg },
    ],
  });
  for await (const ev of stream) {
    if (ev.type === 'delta' && ev.delta) full += ev.delta;
    if (ev.type === 'error') throw new Error(ev.errorMessage ?? 'streamChat error');
  }
  return full.trim();
}
