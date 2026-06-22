import { db } from '../db';
import {
  getLastNightSleep,
  getTodayHeartRate,
  getTodayHeartRateSeries,
  getTodaySteps,
  getWeeklySteps,
  type SleepSummary,
} from './health-connect';

/**
 * Health Connect 读穿透缓存.
 *
 * 背景: MIUI 杀后台后 Gadgetbridge → Health Connect 这条线写进 HC
 * 的数据偶发蒸发, Body 页一刷新就出 0 步 / null 睡眠 / 空心率。我们
 * 又没法挽救 HC 本身, 只能在 app 这边自己存一份。
 *
 * 写时机: HC 每次实际给出"非空"数据时, 我们立刻 stringify 存到
 * db.healthCache, key = "type|YYYY-MM-DD"。
 *
 * 读时机: HC 返回空 (isEmpty 谓词命中) 时, 同 key 拉缓存返回, 标
 * fromCache=true 让 UI 给个 "缓存 · N 分钟前" 指示。
 *
 * 清理: 每次写时顺手扫一遍删 > 7 天的旧 row, 防 IndexedDB 无限涨。
 */

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function cacheId(type: string, date: string): string {
  return `${type}|${date}`;
}

export interface CachedRead<T> {
  data: T;
  fromCache: boolean;
  /** 缓存命中时是 row.updatedAt, 否则是这次读 HC 的 wall time. */
  updatedAt: number;
}

const PURGE_OLDER_THAN_MS = 7 * 24 * 3600 * 1000;
let lastPurgeAt = 0;

async function maybePurgeOldCache() {
  // 24 小时一次足够, 缓存 row 不多。
  const now = Date.now();
  if (now - lastPurgeAt < 24 * 3600 * 1000) return;
  lastPurgeAt = now;
  try {
    const threshold = now - PURGE_OLDER_THAN_MS;
    await db.healthCache.where('updatedAt').below(threshold).delete();
  } catch {
    // 清理失败别影响主流程
  }
}

async function cachedRead<T>(
  type: string,
  date: string,
  fetcher: () => Promise<T>,
  isEmpty: (v: T) => boolean,
): Promise<CachedRead<T>> {
  let fresh: T;
  try {
    fresh = await fetcher();
  } catch {
    // HC 抛错也走缓存兜底
    const cached = await db.healthCache.get(cacheId(type, date));
    if (cached) {
      return {
        data: JSON.parse(cached.data) as T,
        fromCache: true,
        updatedAt: cached.updatedAt,
      };
    }
    throw new Error(`Health Connect ${type} 读失败且无缓存`);
  }

  const now = Date.now();
  if (!isEmpty(fresh)) {
    // 有新鲜数据 → 写缓存覆盖旧 row
    try {
      await db.healthCache.put({
        id: cacheId(type, date),
        type,
        date,
        data: JSON.stringify(fresh),
        updatedAt: now,
      });
      void maybePurgeOldCache();
    } catch {
      // 写失败不影响主流程
    }
    return { data: fresh, fromCache: false, updatedAt: now };
  }

  // 没新鲜数据 → 拉缓存
  const cached = await db.healthCache.get(cacheId(type, date));
  if (cached) {
    return {
      data: JSON.parse(cached.data) as T,
      fromCache: true,
      updatedAt: cached.updatedAt,
    };
  }
  // 缓存也没 → 把空值原样返回, fromCache=false (没东西好缓存)
  return { data: fresh, fromCache: false, updatedAt: now };
}

/* ─── 五个带缓存的读函数 ──────────────────────────────────────── */

export function cachedTodaySteps(): Promise<CachedRead<number>> {
  return cachedRead(
    'steps',
    todayStr(),
    () => getTodaySteps(),
    (v) => v === 0,
  );
}

export function cachedWeeklySteps(): Promise<
  CachedRead<{ date: string; steps: number }[]>
> {
  return cachedRead(
    'weekSteps',
    todayStr(),
    () => getWeeklySteps(),
    (v) => v.length !== 7 || v.every((d) => d.steps === 0),
  );
}

export function cachedHeartRate(): Promise<
  CachedRead<{
    latest: number | null;
    min: number | null;
    max: number | null;
    count: number;
  }>
> {
  return cachedRead(
    'heartRate',
    todayStr(),
    () => getTodayHeartRate(),
    (v) => v.latest === null,
  );
}

export function cachedHeartRateSeries(): Promise<CachedRead<number[]>> {
  return cachedRead(
    'heartSeries',
    todayStr(),
    () => getTodayHeartRateSeries(),
    (v) => v.length === 0,
  );
}

export function cachedLastNightSleep(): Promise<
  CachedRead<SleepSummary | null>
> {
  return cachedRead(
    'sleep',
    todayStr(),
    () => getLastNightSleep(),
    (v) => v === null,
  );
}
