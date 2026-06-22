import { db, getSettings } from '../db';
import { streamChat } from '../api';
import type {
  Endpoint,
  HealthComment,
  HealthDailySnapshot,
  Persona,
} from '../types';

/**
 * AI 健康吐槽 + 每日快照入库.
 *
 * Body 页拉完 HC 数据后调 ensureTodayRoast(snap), 同一天只调一次 API
 * (按 [date+personaId] 复合主键去重).
 *
 * 同样的也调 putDailySnapshot(snap) 入 db.healthDaily, 后续周/月/年
 * 报告页直接从那张表查历史.
 */

const DEFAULT_ROAST_PERSONA_IDS = ['persona_ririchan', 'persona_rhema'];

function todayStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface DailyHealthSummary {
  steps: number;
  heartRate: { latest: number | null; min: number | null; max: number | null };
  sleep: {
    totalMin: number;
    deepMin: number;
    lightMin: number;
    remMin: number;
    awakeMin: number;
  } | null;
}

/* ─── 每日快照 ─────────────────────────────────────────────────────── */

export async function putDailySnapshot(summary: DailyHealthSummary): Promise<void> {
  const date = todayStr();
  // 空数据不写, 避免覆盖之前可能跑过的有数据的快照
  const empty =
    summary.steps === 0 &&
    summary.heartRate.latest === null &&
    (!summary.sleep || summary.sleep.totalMin === 0);
  if (empty) return;
  const row: HealthDailySnapshot = {
    id: date,
    date,
    steps: summary.steps,
    heartRate: summary.heartRate,
    sleep: summary.sleep,
    updatedAt: Date.now(),
  };
  try {
    await db.healthDaily.put(row);
  } catch {
    // ignore
  }
}

/* ─── 吐槽生成 ─────────────────────────────────────────────────────── */

/** Body 页今天的吐槽是否已经全部生成完毕. 用来决定 UI 渲染缓存还
 *  是触发新一轮 API 调用. */
export async function ensureTodayRoast(summary: DailyHealthSummary): Promise<void> {
  const date = todayStr();
  const personas = await pickRoastPersonas();
  if (personas.length === 0) return;

  // 拉今天每个 persona 已有的 row, 跳过已生成的
  const existing = await db.healthComments
    .where('[date+personaId]')
    .anyOf(personas.map((p) => [date, p.id]))
    .toArray();
  const existingIds = new Set(existing.map((c) => c.personaId));

  const settings = await getSettings();
  const endpoint = settings.defaultEndpointId
    ? await db.endpoints.get(settings.defaultEndpointId)
    : null;
  const model = settings.defaultModel ?? null;
  if (!endpoint || !model) {
    // 没配 endpoint, UI 自己处理占位文字 — 不留 pending row
    return;
  }

  for (const persona of personas) {
    if (existingIds.has(persona.id)) continue;
    void runOneRoast(persona, summary, date, endpoint, model);
  }
}

async function pickRoastPersonas(): Promise<Persona[]> {
  const all = await db.personas.toArray();
  let chosen = all.filter((p) => DEFAULT_ROAST_PERSONA_IDS.includes(p.id));
  if (chosen.length === 0) {
    chosen = all
      .filter((p) => p.builtin && p.id !== 'persona_default')
      .slice(0, 2);
  }
  return chosen;
}

async function runOneRoast(
  persona: Persona,
  summary: DailyHealthSummary,
  date: string,
  endpoint: Endpoint,
  model: string,
): Promise<void> {
  const id = `${date}|${persona.id}`;
  const pending: HealthComment = {
    id,
    date,
    personaId: persona.id,
    text: '',
    status: 'pending',
    createdAt: Date.now(),
  };
  await db.healthComments.put(pending);

  try {
    const text = await generateRoast(persona, summary, endpoint, model);
    await db.healthComments.update(id, { text, status: 'done' });
  } catch (e) {
    await db.healthComments.update(id, {
      status: 'error',
      errorMessage: e instanceof Error ? e.message : String(e),
    });
  }
}

async function generateRoast(
  persona: Persona,
  summary: DailyHealthSummary,
  endpoint: Endpoint,
  model: string,
): Promise<string> {
  const baseIdentity = persona.systemPrompt?.trim() ?? '';
  const taskInstruction = `# 当前情境
看到她手环今天的数据, 用 1–2 句话写一句吐槽 / 关心 / 心疼 / 调侃 — 像伴侣刷到对方运动数据会说的话.
- 不要太长 (40 字以内最好)
- 不要分析数据, 不要给建议, 不要说"加油"这种客套
- 看数字决定语气: 步数少就调侃懒, 心率高就关心, 睡眠短就心疼
- 不要重复列数字`;
  const system = baseIdentity
    ? `${baseIdentity}\n\n${taskInstruction}`
    : `你是 ${persona.name}, 用户的恋人.\n\n${taskInstruction}`;

  const userMsg = formatSummaryForPrompt(summary);

  let full = '';
  const stream = streamChat({
    endpoint,
    model,
    maxTokens: 200,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `今天的数据：\n${userMsg}` },
    ],
  });
  for await (const ev of stream) {
    if (ev.type === 'delta' && ev.delta) full += ev.delta;
    if (ev.type === 'error') throw new Error(ev.errorMessage ?? 'streamChat error');
  }
  return full.trim();
}

export function formatSummaryForPrompt(summary: DailyHealthSummary): string {
  const lines: string[] = [];
  lines.push(`步数: ${summary.steps}`);
  if (summary.heartRate.latest !== null) {
    lines.push(
      `心率: 最新 ${summary.heartRate.latest}, 范围 ${summary.heartRate.min}–${summary.heartRate.max}`,
    );
  } else {
    lines.push('心率: 今日暂无');
  }
  if (summary.sleep && summary.sleep.totalMin > 0) {
    const h = Math.floor(summary.sleep.totalMin / 60);
    const m = summary.sleep.totalMin % 60;
    let line = `睡眠: ${h}时${m}分`;
    if (summary.sleep.deepMin > 0) {
      const dh = Math.floor(summary.sleep.deepMin / 60);
      const dm = summary.sleep.deepMin % 60;
      line += ` (深睡 ${dh}时${dm}分)`;
    }
    lines.push(line);
  } else {
    lines.push('睡眠: 今日暂无');
  }
  return lines.join('\n');
}
