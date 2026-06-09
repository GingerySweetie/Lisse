import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { db, getSettings } from '../db';
import { streamChat } from '../api';
import { isoDate } from './period';
import UsageStats, { type AppUsage } from './native/usage-stats';

/**
 * Reader-app whitelist: when she's been in one of these for hours, the
 * persona stays quiet — that's the point of a reader. Anything not on
 * this list is "刷手机" and eligible for a roast once she crosses the
 * threshold for the day.
 */
export const READER_PACKAGES: ReadonlySet<string> = new Set([
  'com.tencent.weread', // 微信读书
  'com.duokan.reader', // 多看阅读
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
  'com.gingery.wisteria', // self — we're the reader app
]);

export function isReader(pkg: string): boolean {
  return READER_PACKAGES.has(pkg);
}

const ROAST_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour today
const NOTIF_ID_BASE = 200; // 200..209 — reserve a small block

/** Build a YYYY-MM-DD cooldown key so the persona only roasts once per
 *  app per day; otherwise getting nagged every time /screen-time opens
 *  would be its own annoyance. */
function roastKvKey(pkg: string, dateIso: string): string {
  return `roast:${pkg}:${dateIso}`;
}

interface RoastRecord {
  text: string;
  at: number;
  appName: string;
  minutes: number;
}

export async function getTodayRoast(
  pkg: string,
): Promise<RoastRecord | null> {
  const today = isoDate(new Date());
  const row = await db.kv.get(roastKvKey(pkg, today));
  return row ? ((row.value as RoastRecord) ?? null) : null;
}

export async function getAllTodayRoasts(): Promise<RoastRecord[]> {
  const today = isoDate(new Date());
  const all = await db.kv.toArray();
  return all
    .filter((r) => r.key.startsWith('roast:') && r.key.endsWith(`:${today}`))
    .map((r) => r.value as RoastRecord);
}

/** Pick the worst offender (longest foreground time among non-reader apps)
 *  that's also crossed the threshold and hasn't been roasted today. Null
 *  if nothing qualifies. */
export async function pickRoastTarget(
  usage: AppUsage[],
): Promise<AppUsage | null> {
  const candidates = usage
    .filter((u) => !isReader(u.packageName))
    .filter((u) => u.foregroundMs >= ROAST_THRESHOLD_MS)
    .sort((a, b) => b.foregroundMs - a.foregroundMs);
  for (const c of candidates) {
    const existing = await getTodayRoast(c.packageName);
    if (!existing) return c;
  }
  return null;
}

/** Generate a one-shot roast line in the active persona's voice via the
 *  user's default endpoint+model. Falls back to a canned line if the LLM
 *  call fails or no endpoint is configured. */
export async function generateRoast(target: AppUsage): Promise<string> {
  const fallback = cannedRoast(target);
  try {
    const settings = await getSettings();
    if (!settings.defaultEndpointId || !settings.defaultModel) return fallback;
    const ep = await db.endpoints.get(settings.defaultEndpointId);
    if (!ep) return fallback;
    const persona = settings.defaultPersonaId
      ? await db.personas.get(settings.defaultPersonaId)
      : undefined;
    const style = settings.defaultStyleId
      ? await db.writingStyles.get(settings.defaultStyleId)
      : undefined;

    const minutes = Math.round(target.foregroundMs / 60_000);
    const systemParts: string[] = [];
    if (persona?.systemPrompt.trim()) systemParts.push(persona.systemPrompt);
    if (style?.prompt.trim()) {
      systemParts.push(`# 写作风格\n${style.prompt.trim()}`);
    }

    const messages = [
      ...(systemParts.length > 0
        ? [{ role: 'system' as const, content: systemParts.join('\n\n---\n\n') }]
        : []),
      {
        role: 'user' as const,
        content: `さざなみ今天用了「${target.appName}」${minutes} 分钟（${pickPhrase(minutes)}）。\n\n请按你的人格说一句话吐槽她（一句话内，不超过 40 字，不要加引号或前缀）。`,
      },
    ];

    let acc = '';
    for await (const evt of streamChat({
      endpoint: ep,
      model: settings.defaultModel,
      messages,
      maxTokens: 200,
    })) {
      if (evt.type === 'delta' && evt.delta) acc += evt.delta;
      if (evt.type === 'error') throw new Error(evt.errorMessage ?? '');
      if (evt.type === 'done') break;
    }
    const cleaned = acc
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/^["「『]+|["」』]+$/g, '')
      .trim();
    return cleaned || fallback;
  } catch {
    return fallback;
  }
}

function pickPhrase(minutes: number): string {
  if (minutes < 90) return '已经够多了';
  if (minutes < 180) return '不少了吧';
  if (minutes < 300) return '半天都搭进去了';
  return '一整天都在这里';
}

function cannedRoast(t: AppUsage): string {
  const m = Math.round(t.foregroundMs / 60_000);
  return `${t.appName} ${m} 分钟。够了。`;
}

/** Persist a roast + (on native) schedule a heads-up local notification
 *  so the line surfaces even if she's not looking at the app. */
export async function recordAndNotifyRoast(
  target: AppUsage,
  text: string,
): Promise<void> {
  const today = isoDate(new Date());
  const minutes = Math.round(target.foregroundMs / 60_000);
  const rec: RoastRecord = {
    text,
    at: Date.now(),
    appName: target.appName,
    minutes,
  };
  await db.kv.put({ key: roastKvKey(target.packageName, today), value: rec });

  if (Capacitor.getPlatform() !== 'android') return;
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') return;
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
    // ignore — having the in-app banner already covers the visible case.
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

/** Pull today's usage from native. Returns empty on web / no permission. */
export async function fetchUsage(): Promise<AppUsage[]> {
  if (Capacitor.getPlatform() !== 'android') return [];
  try {
    const r = await UsageStats.getTodayUsage();
    return r.usage.sort((a, b) => b.foregroundMs - a.foregroundMs);
  } catch {
    return [];
  }
}

export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m} 分`;
  if (m <= 0) return `${h} 时`;
  return `${h} 时 ${m} 分`;
}
