import { Health, type HealthDataType, type HealthSample } from '@capgo/capacitor-health';
import { Capacitor } from '@capacitor/core';

/**
 * Health Connect wrapper.
 *
 * 紫藤手机端的步数 / 心率 / 睡眠 / 体重数据走 Health Connect — 小米手环
 * → 小米运动健康 → Health Connect → 这里。原生 TYPE_STEP_COUNTER 那条
 * 路只读手机自带传感器, 漏掉手环上记的所有步数 (而且 baseline 算
 * 法本身也跟 app 进程生命周期挂钩, 不可靠). HC 一条线串到底, 跟带
 * 手环时手机本身的数据有冲突时手环数据为准.
 *
 * 所有方法在非 Android 平台返回空/默认值, 不抛错 —— Web/iOS 暂时
 * 没接入。
 */

const DEFAULT_READ_TYPES: HealthDataType[] = [
  'steps',
  'heartRate',
  'sleep',
  'weight',
];

function isAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/** 系统支持 Health Connect 吗? Android 8+ 才有, 旧设备会 false. */
export async function isHealthAvailable(): Promise<boolean> {
  if (!isAndroid()) return false;
  try {
    const r = await Health.isAvailable();
    return r.available;
  } catch {
    return false;
  }
}

/** 唤起 HC 权限对话框。返回所有 type 都拿到读权限了吗。 */
export async function requestHealthPermissions(
  types: HealthDataType[] = DEFAULT_READ_TYPES,
): Promise<boolean> {
  if (!isAndroid()) return false;
  try {
    const status = await Health.requestAuthorization({
      read: types,
      write: [],
    });
    return types.every((t) => status.readAuthorized.includes(t));
  } catch (e) {
    console.warn('Health Connect auth request failed:', e);
    return false;
  }
}

/** 不弹对话框, 只看当前是否已经授权。 */
export async function checkHealthAuth(
  types: HealthDataType[] = DEFAULT_READ_TYPES,
): Promise<boolean> {
  if (!isAndroid()) return false;
  try {
    const status = await Health.checkAuthorization({
      read: types,
      write: [],
    });
    return types.every((t) => status.readAuthorized.includes(t));
  } catch {
    return false;
  }
}

async function readSamples(
  dataType: HealthDataType,
  start: Date,
  end: Date,
  limit = 200,
): Promise<HealthSample[]> {
  if (!isAndroid()) return [];
  try {
    const r = await Health.readSamples({
      dataType,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      limit,
    });
    return r.samples;
  } catch (e) {
    console.warn(`Health Connect readSamples(${dataType}) failed:`, e);
    return [];
  }
}

/** 今日累计步数。HC 同一时段同一来源会被去重, 直接 sum value 安全。 */
export async function getTodaySteps(): Promise<number> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const samples = await readSamples('steps', startOfDay, now);
  return samples.reduce((sum, s) => sum + (s.value || 0), 0);
}

/** 今日心率 (最新一笔 + 范围).
 *
 *  历史教训: 之前 readSamples('heartRate', startOfDay, now, 500),
 *  手环连续戴一天 Health Connect 里一条 HeartRateRecord 内嵌的
 *  series 数组能上千 sub-point, 500 条 record × ~1000 series →
 *  IPC binder 反序列化 SeriesValue proto 时直接 OOM, 整个 app
 *  进程被 system_server 杀掉 (堆栈是 IReadDataRangeCallback 的
 *  parseFrom).
 *
 *  现在 min / max / average 走 queryAggregated, HC 端就聚合好,
 *  传过来三个 double; latest 用 readSamples 但窗口缩到最近 30 分
 *  钟 + limit 5, payload 顶天几 KB. 不会再炸. */
export async function getTodayHeartRate(): Promise<{
  latest: number | null;
  min: number | null;
  max: number | null;
  count: number;
}> {
  if (!isAndroid()) {
    return { latest: null, min: null, max: null, count: 0 };
  }
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const aggKinds: Array<'min' | 'max' | 'average'> = ['min', 'max', 'average'];
  let min: number | null = null;
  let max: number | null = null;
  let hasAny = false;
  await Promise.all(
    aggKinds.map(async (kind) => {
      try {
        const r = await Health.queryAggregated({
          dataType: 'heartRate',
          startDate: startOfDay.toISOString(),
          endDate: now.toISOString(),
          bucket: 'day',
          aggregation: kind,
        });
        const v = r.samples[0]?.value;
        if (typeof v === 'number' && v > 0) {
          hasAny = true;
          if (kind === 'min') min = Math.round(v);
          else if (kind === 'max') max = Math.round(v);
        }
      } catch {
        // 单个 aggregation 失败就当没数据, 不致命
      }
    }),
  );

  // 最新一笔走小窗口的 readSamples — 只要最近 30 分钟最多 5 条,
  // 避开全天大批 series 解码
  let latest: number | null = null;
  try {
    const recent = await readSamples(
      'heartRate',
      new Date(now.getTime() - 30 * 60_000),
      now,
      5,
    );
    if (recent.length > 0) {
      const last = recent.reduce((a, b) =>
        new Date(a.endDate).getTime() > new Date(b.endDate).getTime() ? a : b,
      );
      if (last.value > 0) latest = Math.round(last.value);
    }
  } catch {
    // ignore
  }

  if (!hasAny && latest === null) {
    return { latest: null, min: null, max: null, count: 0 };
  }
  return { latest, min, max, count: hasAny || latest !== null ? 1 : 0 };
}

/** 今日心率时间序列 (24 个 hourly bucket, 缺数据的小时为 0). 之前
 *  readSamples 500 条每条 series 数千点 → OOM. 改成 queryAggregated
 *  bucket=hour, HC 端聚合好 24 个 average BPM, 传过来 24 个 double,
 *  payload 极小。 */
export async function getTodayHeartRateSeries(): Promise<number[]> {
  if (!isAndroid()) return [];
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  try {
    const r = await Health.queryAggregated({
      dataType: 'heartRate',
      startDate: startOfDay.toISOString(),
      endDate: now.toISOString(),
      bucket: 'hour',
      aggregation: 'average',
    });
    // 把不连续的 bucket 摊到 24 个槽, 缺的填 0. bucket startDate 是
    // 各小时的整点.
    const byHour = new Map<number, number>();
    for (const s of r.samples) {
      const h = new Date(s.startDate).getHours();
      if (s.value > 0) byHour.set(h, Math.round(s.value));
    }
    const out: number[] = [];
    const upToHour = now.getHours();
    for (let h = 0; h <= upToHour; h++) out.push(byHour.get(h) ?? 0);
    return out;
  } catch (e) {
    console.warn('Health Connect heartRate hourly aggregated failed:', e);
    return [];
  }
}

/** 最近 7 天每天的步数, 顺序: 6 天前 → 今天. queryAggregated bucket=day
 *  让 HC 自己分桶, 不用我们手工逐日查。 */
export async function getWeeklySteps(): Promise<
  { date: string; steps: number }[]
> {
  if (!isAndroid()) return [];
  const now = new Date();
  // 7 个完整的本地日: 从 6 天前的 00:00 到现在.
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 6,
  );
  try {
    const r = await Health.queryAggregated({
      dataType: 'steps',
      startDate: start.toISOString(),
      endDate: now.toISOString(),
      bucket: 'day',
      aggregation: 'sum',
    });
    // queryAggregated 不保证桶完整 (没数据的天可能缺), 我们补 0.
    const byDate = new Map<string, number>();
    for (const s of r.samples) {
      const d = new Date(s.startDate);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      byDate.set(k, (byDate.get(k) ?? 0) + s.value);
    }
    const out: { date: string; steps: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({ date: k, steps: Math.round(byDate.get(k) ?? 0) });
    }
    return out;
  } catch (e) {
    console.warn('Health Connect queryAggregated(steps) failed:', e);
    return [];
  }
}

/** 昨晚睡眠。HC 一条 sleep sample 通常代表一整段睡眠, 取窗口里最长的
 *  那段当作 "last night". 带 stages 时返回, 没分期就 stages=[] 。 */
export interface SleepSummary {
  startDate: string;
  endDate: string;
  durationMinutes: number;
  /** 分期段 (可选). 没有的时候为空数组。 */
  stages: Array<{
    startDate: string;
    endDate: string;
    stage: string;
    durationMinutes: number;
  }>;
  /** 各 stage 累计分钟, 没分期则全 0. */
  totalsByStage: {
    deep: number;
    light: number;
    rem: number;
    awake: number;
  };
}

export async function getLastNightSleep(): Promise<SleepSummary | null> {
  // 查窗口: 昨天 18:00 → 现在, 跟 SleepEstimatePlugin 同口径.
  const now = new Date();
  const yesterday18 = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
    18,
  );
  const samples = await readSamples('sleep', yesterday18, now, 20);
  if (samples.length === 0) return null;

  // 选窗口内最长的一段当 "last night".
  const longest = samples.reduce((a, b) => {
    const da = new Date(a.endDate).getTime() - new Date(a.startDate).getTime();
    const db = new Date(b.endDate).getTime() - new Date(b.startDate).getTime();
    return db > da ? b : a;
  });

  const ms =
    new Date(longest.endDate).getTime() - new Date(longest.startDate).getTime();
  const durationMinutes = Math.max(0, Math.round(ms / 60000));

  const stages = longest.stages ?? [];
  const totalsByStage = { deep: 0, light: 0, rem: 0, awake: 0 };
  for (const st of stages) {
    if (st.stage === 'deep') totalsByStage.deep += st.durationMinutes;
    else if (st.stage === 'light') totalsByStage.light += st.durationMinutes;
    else if (st.stage === 'rem') totalsByStage.rem += st.durationMinutes;
    else if (st.stage === 'awake') totalsByStage.awake += st.durationMinutes;
  }

  return {
    startDate: longest.startDate,
    endDate: longest.endDate,
    durationMinutes,
    stages,
    totalsByStage,
  };
}

/** 最近 N 天的体重读数, 按时间升序。 */
export async function getRecentWeight(
  days = 30,
): Promise<{ date: string; kg: number }[]> {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 3600 * 1000);
  // weight 没有 series sub-points, 比较安全, 但 limit 还是给 60
  // (一天测一次 30 天也才 30 条, 60 已经富裕).
  const samples = await readSamples('weight', start, now, 60);
  return samples
    .filter((s) => s.value > 0)
    .map((s) => ({
      date: s.endDate,
      kg: Math.round(s.value * 10) / 10,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/** 诊断信息: 每个 dataType 在过去 24 小时里 HC 里到底有什么.
 *  排查「HC 连上了但是面板全 0」时用 — 一眼看出来:
 *  - read 权限拿到了吗
 *  - 有几条样本
 *  - 最后一笔什么时候
 *  - 哪些 app/sourceName 在写 (= 小米运动健康 / 其他 / 还是没人写)
 */
export interface HcDiagEntry {
  dataType: HealthDataType;
  authorized: boolean;
  sampleCount: number;
  latestAt: string | null;
  sources: string[];
}

export interface HcDiagReport {
  available: boolean;
  entries: HcDiagEntry[];
  generatedAt: string;
}

export async function inspectHealthConnect(): Promise<HcDiagReport> {
  const generatedAt = new Date().toISOString();
  if (!isAndroid()) {
    return { available: false, entries: [], generatedAt };
  }
  const types: HealthDataType[] = ['steps', 'heartRate', 'sleep', 'weight'];
  let available = false;
  try {
    available = (await Health.isAvailable()).available;
  } catch {
    available = false;
  }
  if (!available) return { available: false, entries: [], generatedAt };

  let auth;
  try {
    auth = await Health.checkAuthorization({ read: types, write: [] });
  } catch {
    auth = { readAuthorized: [], readDenied: [], writeAuthorized: [], writeDenied: [] };
  }

  const now = new Date();
  // 心率窗口缩到最近 30 分钟避开整天 series proto 把 binder 反序列
  // 化 OOM 掉. 步数 24h. sleep / weight 7 天兜底. limit 整体砍到
  // 20 (诊断只看时间戳 + sourceName, 不需要全量).
  const entries: HcDiagEntry[] = [];
  for (const t of types) {
    const authorized = auth.readAuthorized.includes(t);
    let sampleCount = 0;
    let latestAt: string | null = null;
    const sourcesSet = new Set<string>();
    if (authorized) {
      const start =
        t === 'heartRate'
          ? new Date(now.getTime() - 30 * 60_000)
          : t === 'sleep' || t === 'weight'
            ? new Date(now.getTime() - 7 * 24 * 3600 * 1000)
            : new Date(now.getTime() - 24 * 3600 * 1000);
      try {
        const samples = await readSamples(t, start, now, 20);
        sampleCount = samples.length;
        for (const s of samples) {
          if (s.sourceName) sourcesSet.add(s.sourceName);
          if (!latestAt || s.endDate > latestAt) latestAt = s.endDate;
        }
      } catch {
        // 诊断不该把 app 炸了 — 失败就当无数据
      }
    }
    entries.push({
      dataType: t,
      authorized,
      sampleCount,
      latestAt,
      sources: Array.from(sourcesSet).sort(),
    });
  }
  return { available: true, entries, generatedAt };
}
