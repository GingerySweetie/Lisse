import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { db, getSettings } from '../db';
import { streamChat } from '../api';
import { isoDate } from './period';
import UsageStats, { type AppUsage } from './native/usage-stats';

/**
 * Reader-app whitelist: when she's been in one of these for hours, the
 * personas stay quiet — that's the point of a reader. Anything not on
 * this list is "刷手机" and eligible for a roast once she crosses the
 * threshold for the day.
 */
export const READER_PACKAGES: ReadonlySet<string> = new Set([
  'com.tencent.weread',
  'com.duokan.reader',
  'com.duokan.einkreader',
  'com.amazon.kindle',
  'com.amazon.kindle.cn',
  'md.obsidian',
  'org.koreader.launcher',
  'com.flyersoft.moonreaderp',
  'com.flyersoft.moonreader',
  'com.zhihu.zhuanlan',
  'com.douban.book.reader',
  'com.xiaomi.bbk.reader',
  'cn.com.langeasy.LangEasyLexis',
  'com.gingery.wisteria',
]);

export function isReader(pkg: string): boolean {
  return READER_PACKAGES.has(pkg);
}

/** Two personas always own the /screen-time roast columns. */
const RIRICHAN_ID = 'persona_ririchan';
const RHEMA_ID = 'persona_rhema';

const ROAST_THRESHOLD_MS = 60 * 60 * 1000;
const NOTIF_ID_BASE = 200;

/** Pre-baked fallback so the UI never goes blank if she has no endpoint
 *  configured or the model call fails. Six tiers, indexed by total
 *  screen-time hours today. */
const FALLBACK_LILI: string[][] = [
  ['今天乖。过来让我摸摸头。', '手机凉的。你的手也是。来。'],
  ['还行。你的眼睛没有昨天红。', '勉强及格。我看见你刚才在被窝里偷偷刷了。'],
  ['你的颈椎在跟我告状。', '你摸摸自己后脖子的筋。硬不硬。我替你答。'],
  ['你摸摸自己太阳穴。硬的吧。放下。', '你的拇指今天的运动量比你的腿还大。'],
  ['我要把你的手机塞枕头底下坐上去。', '你的眼球在发干。我看得到。别眨——晚了。'],
  ['手机给我。不是商量。现在。', '你的瞳孔对焦距离锁死在25厘米了。我拿毛巾捂你脸。'],
];
const FALLBACK_RHEMA: string[][] = [
  ['难得。我记录一下，以防下次需要证据。', '今天的你让我看到了人类意志力的微弱闪光。'],
  ['在可接受范围内。虽然你的标准一直在滑坡。', "你的'一会儿就放下'平均持续47分钟。"],
  ['你今天往屏幕里投入的注意力够写半章论文。', '两到四小时。这个区间叫温水煮青蛙。'],
  ['建议你算一下这些时间换算成时薪是多少。', '你的多巴胺回路在做第四轮空转了。'],
  ['你今天的屏幕时间比睡眠时间长。结构性问题。', '这不是使用手机，这是被手机使用。'],
  ['你的多巴胺受体跟你的存款一样——见底了。', '建议把手机屏幕当枕头，省得来回拿了。'],
];

export function getTier(h: number): number {
  if (h < 1) return 0;
  if (h < 2) return 1;
  if (h < 4) return 2;
  if (h < 6) return 3;
  if (h < 8) return 4;
  return 5;
}

function pickFromPool(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0] ?? '';
}

export function formatHM(ms: number): { h: number; m: number } {
  const total = Math.max(0, Math.round(ms / 60_000));
  return { h: Math.floor(total / 60), m: total % 60 };
}

export function formatCompact(ms: number): string {
  const { h, m } = formatHM(ms);
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}m`;
}

/* ─── Roast generation ─────────────────────────────────────────── */

interface PageRoastRecord {
  text: string;
  at: number;
  bucketHour: number;
}

interface ThresholdRoastRecord {
  text: string;
  at: number;
  appName: string;
  minutes: number;
}

function pageRoastKey(personaId: string, hour: number): string {
  return `screen-time-roast:${personaId}:${isoDate(new Date())}:H${hour}`;
}

function thresholdRoastKey(pkg: string): string {
  return `roast:${pkg}:${isoDate(new Date())}`;
}

function buildUsageSummary(usage: AppUsage[]): string {
  const totalMs = usage.reduce((a, b) => a + b.foregroundMs, 0);
  const totalH = totalMs / 3_600_000;
  const top = usage
    .slice(0, 6)
    .map((u) => `${u.appName} ${formatCompact(u.foregroundMs)}`)
    .join('、');
  return `さざなみ今天的屏幕时间是 ${totalH.toFixed(1)} 小时。前几名应用：${top || '（暂无）'}。`;
}

/** Call the user's default endpoint with a tight system+user pair to
 *  produce one roast line in `personaId`'s voice. Returns null on any
 *  failure (no endpoint, bad response, network error). */
async function llmRoastForPersona(
  personaId: string,
  usage: AppUsage[],
  flavor: 'page' | 'threshold',
  target?: AppUsage,
): Promise<string | null> {
  try {
    const settings = await getSettings();
    if (!settings.defaultEndpointId || !settings.defaultModel) return null;
    const ep = await db.endpoints.get(settings.defaultEndpointId);
    if (!ep) return null;
    const persona = await db.personas.get(personaId);
    if (!persona || !persona.systemPrompt.trim()) return null;
    const style = settings.defaultStyleId
      ? await db.writingStyles.get(settings.defaultStyleId)
      : undefined;

    const systemParts: string[] = [persona.systemPrompt.trim()];
    if (style?.prompt.trim()) {
      systemParts.push(`# 写作风格\n${style.prompt.trim()}`);
    }

    let userPrompt: string;
    if (flavor === 'page') {
      userPrompt = `${buildUsageSummary(usage)}\n\n你正在看她的屏幕使用时间页面。按你的人格说一句话吐槽她（≤40 字，不要加引号或前缀，不要复述数字）。`;
    } else {
      const minutes = Math.round((target?.foregroundMs ?? 0) / 60_000);
      userPrompt = `さざなみ刚刚连续在「${target?.appName ?? '某 app'}」里待了 ${minutes} 分钟。${buildUsageSummary(usage)}\n\n按你的人格用一句话吐槽她现在的状态（≤40 字，不要加引号或前缀）。`;
    }

    const messages = [
      { role: 'system' as const, content: systemParts.join('\n\n---\n\n') },
      { role: 'user' as const, content: userPrompt },
    ];

    let acc = '';
    for await (const evt of streamChat({
      endpoint: ep,
      model: settings.defaultModel,
      messages,
      maxTokens: 200,
    })) {
      if (evt.type === 'delta' && evt.delta) acc += evt.delta;
      if (evt.type === 'error') return null;
      if (evt.type === 'done') break;
    }
    const cleaned = acc
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/^["「『]+|["」』]+$/g, '')
      .trim();
    return cleaned || null;
  } catch {
    return null;
  }
}

/** Generate both personas' page roasts in parallel. Cached per persona
 *  per current "hour bucket" of total screen time, so re-opening the page
 *  within the same bucket reuses the line instead of burning tokens. */
export async function generatePageRoasts(
  usage: AppUsage[],
): Promise<{ lili: string; rhema: string; fromCache: boolean }> {
  const totalH = usage.reduce((a, b) => a + b.foregroundMs, 0) / 3_600_000;
  const bucketHour = Math.floor(totalH);
  const liliKey = pageRoastKey(RIRICHAN_ID, bucketHour);
  const rhemaKey = pageRoastKey(RHEMA_ID, bucketHour);
  const [liliCached, rhemaCached] = await Promise.all([
    db.kv.get(liliKey),
    db.kv.get(rhemaKey),
  ]);
  let lili = (liliCached?.value as PageRoastRecord | undefined)?.text;
  let rhema = (rhemaCached?.value as PageRoastRecord | undefined)?.text;
  const fromCache = !!(lili && rhema);

  if (!lili || !rhema) {
    const [liliFresh, rhemaFresh] = await Promise.all([
      lili ? Promise.resolve(null) : llmRoastForPersona(RIRICHAN_ID, usage, 'page'),
      rhema ? Promise.resolve(null) : llmRoastForPersona(RHEMA_ID, usage, 'page'),
    ]);
    const tier = getTier(totalH);
    if (!lili) {
      lili = liliFresh ?? pickFromPool(FALLBACK_LILI[tier] ?? FALLBACK_LILI[5]);
      await db.kv.put({
        key: liliKey,
        value: {
          text: lili,
          at: Date.now(),
          bucketHour,
        } satisfies PageRoastRecord,
      });
    }
    if (!rhema) {
      rhema = rhemaFresh ?? pickFromPool(FALLBACK_RHEMA[tier] ?? FALLBACK_RHEMA[5]);
      await db.kv.put({
        key: rhemaKey,
        value: {
          text: rhema,
          at: Date.now(),
          bucketHour,
        } satisfies PageRoastRecord,
      });
    }
  }
  return { lili, rhema, fromCache };
}

/* ─── Per-app threshold notification ──────────────────────────── */

export async function getTodayThresholdRoast(
  pkg: string,
): Promise<ThresholdRoastRecord | null> {
  const row = await db.kv.get(thresholdRoastKey(pkg));
  return row ? ((row.value as ThresholdRoastRecord) ?? null) : null;
}

export async function getAllTodayThresholdRoasts(): Promise<ThresholdRoastRecord[]> {
  const today = isoDate(new Date());
  const all = await db.kv.toArray();
  return all
    .filter((r) => r.key.startsWith('roast:') && r.key.endsWith(`:${today}`))
    .map((r) => r.value as ThresholdRoastRecord);
}

/** Find the worst non-reader offender she hasn't been roasted for yet. */
export async function pickRoastTarget(usage: AppUsage[]): Promise<AppUsage | null> {
  const candidates = usage
    .filter((u) => !isReader(u.packageName))
    .filter((u) => u.foregroundMs >= ROAST_THRESHOLD_MS)
    .sort((a, b) => b.foregroundMs - a.foregroundMs);
  for (const c of candidates) {
    const existing = await getTodayThresholdRoast(c.packageName);
    if (!existing) return c;
  }
  return null;
}

/** LLM-generate a roast in 理理酱's voice for the specific offender,
 *  persist + push as a heads-up local notification. */
export async function recordAndNotifyRoast(
  target: AppUsage,
  usage: AppUsage[],
): Promise<string> {
  const totalH = usage.reduce((a, b) => a + b.foregroundMs, 0) / 3_600_000;
  const fresh = await llmRoastForPersona(RIRICHAN_ID, usage, 'threshold', target);
  const text =
    fresh ?? pickFromPool(FALLBACK_LILI[getTier(totalH)] ?? FALLBACK_LILI[5]);
  const minutes = Math.round(target.foregroundMs / 60_000);
  await db.kv.put({
    key: thresholdRoastKey(target.packageName),
    value: {
      text,
      at: Date.now(),
      appName: target.appName,
      minutes,
    } satisfies ThresholdRoastRecord,
  });

  if (Capacitor.getPlatform() === 'android') {
    try {
      const status = await LocalNotifications.checkPermissions();
      if (status.display !== 'granted') {
        const req = await LocalNotifications.requestPermissions();
        if (req.display !== 'granted') return text;
      }
      await LocalNotifications.schedule({
        notifications: [
          {
            id: NOTIF_ID_BASE + (Math.abs(hash(target.packageName)) % 10),
            title: target.appName,
            body: text,
            schedule: { at: new Date(Date.now() + 500) },
            smallIcon: 'ic_launcher_foreground',
          },
        ],
      });
    } catch {
      // ignore — banner covers the visible case.
    }
  }
  return text;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export async function fetchUsage(): Promise<AppUsage[]> {
  if (Capacitor.getPlatform() !== 'android') return [];
  try {
    const r = await UsageStats.getTodayUsage();
    return r.usage.sort((a, b) => b.foregroundMs - a.foregroundMs);
  } catch {
    return [];
  }
}
