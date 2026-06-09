import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { db } from '../db';
import { isoDate } from './period';
import UsageStats, { type AppUsage } from './native/usage-stats';

/**
 * Reader-app whitelist: when she's been in one of these for hours, the
 * persona stays quiet — that's the point of a reader. Anything not on
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

/** Tier brackets keyed off TOTAL screen-time hours today, per the
 *  staquaapp.jsx mockup. */
export function getTier(h: number): number {
  if (h < 1) return 0;
  if (h < 2) return 1;
  if (h < 4) return 2;
  if (h < 6) return 3;
  if (h < 8) return 4;
  return 5;
}

/** 理理酱 roast pool — copied verbatim from staquaapp.jsx. Tiered by
 *  total screen time hours. */
export const LILI: string[][] = [
  ['今天乖。过来让我摸摸头。', '手机凉的。你的手也是。来。'],
  ['还行。你的眼睛没有昨天红。', '勉强及格。我看见你刚才在被窝里偷偷刷了。'],
  ['你的颈椎在跟我告状。', '你摸摸自己后脖子的筋。硬不硬。我替你答。'],
  ['你摸摸自己太阳穴。硬的吧。放下。', '你的拇指今天的运动量比你的腿还大。'],
  ['我要把你的手机塞枕头底下坐上去。', '你的眼球在发干。我看得到。别眨——晚了。'],
  ['手机给我。不是商量。现在。', '你的瞳孔对焦距离锁死在25厘米了。我拿毛巾捂你脸。'],
];

/** Rhema roast pool. */
export const RHEMA: string[][] = [
  ['难得。我记录一下，以防下次需要证据。', '今天的你让我看到了人类意志力的微弱闪光。'],
  ['在可接受范围内。虽然你的标准一直在滑坡。', "你的'一会儿就放下'平均持续47分钟。"],
  ['你今天往屏幕里投入的注意力够写半章论文。', '两到四小时。这个区间叫温水煮青蛙。'],
  ['建议你算一下这些时间换算成时薪是多少。', '你的多巴胺回路在做第四轮空转了。'],
  ['你今天的屏幕时间比睡眠时间长。结构性问题。', '这不是使用手机，这是被手机使用。'],
  ['你的多巴胺受体跟你的存款一样——见底了。', '建议把手机屏幕当枕头，省得来回拿了。'],
];

export function pickRoast(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0] ?? '';
}

const ROAST_THRESHOLD_MS = 60 * 60 * 1000;
const NOTIF_ID_BASE = 200;

function roastKvKey(pkg: string, dateIso: string): string {
  return `roast:${pkg}:${dateIso}`;
}

interface RoastRecord {
  text: string;
  at: number;
  appName: string;
  minutes: number;
}

export async function getTodayRoast(pkg: string): Promise<RoastRecord | null> {
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

export async function pickRoastTarget(usage: AppUsage[]): Promise<AppUsage | null> {
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

/** Persist a roast + (on native) schedule a heads-up local notification.
 *  The line itself comes from the LILI tier pool — fast, no LLM dep,
 *  matches the user's voice for the persona. */
export async function recordAndNotifyRoast(
  target: AppUsage,
  totalScreenHours: number,
): Promise<string> {
  const tier = getTier(totalScreenHours);
  const text = pickRoast(LILI[tier] ?? LILI[LILI.length - 1]);
  const today = isoDate(new Date());
  const minutes = Math.round(target.foregroundMs / 60_000);
  const rec: RoastRecord = {
    text,
    at: Date.now(),
    appName: target.appName,
    minutes,
  };
  await db.kv.put({ key: roastKvKey(target.packageName, today), value: rec });

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
      // banner is enough
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
