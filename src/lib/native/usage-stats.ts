import { registerPlugin } from '@capacitor/core';

/**
 * UsageStats — bridges Android's UsageStatsManager. The user must grant
 * "Usage access" via Settings (special access permission); manifest
 * declaration alone is not enough.
 */

export interface AppUsage {
  packageName: string;
  appName: string;
  foregroundMs: number;
  /** ms epoch of last foreground use. */
  lastTimeUsed: number;
  /** Base64-encoded PNG of the app icon, when resolvable. */
  iconPng?: string;
}

export interface DayUsage {
  /** YYYY-MM-DD (device local). */
  date: string;
  totalMs: number;
}

export interface UnlockSummary {
  count: number;
  /** "HH:MM" first unlock time today, or null if none. */
  firstAt: string | null;
}

export interface UsageStatsPlugin {
  hasPermission(): Promise<{ granted: boolean }>;
  /** Open the system Settings → "使用情况访问" page. */
  requestPermission(): Promise<void>;
  /** Backward-compat alias for requestPermission. */
  openSettings(): Promise<void>;

  /** Per-app foreground time over an arbitrary window. */
  getUsageStats(args: {
    startTime: number;
    endTime: number;
  }): Promise<{ usage: AppUsage[] }>;
  /** Keyguard-unlock count over an arbitrary window. */
  getUnlockCount(args: {
    startTime: number;
    endTime: number;
  }): Promise<{ count: number; firstAt: number | null }>;

  /** Convenience: today's per-app foreground time since local midnight. */
  getTodayUsage(): Promise<{ usage: AppUsage[] }>;
  /** Convenience: total foreground ms per day, last 7 days (oldest → newest). */
  getWeekUsage(): Promise<{ days: DayUsage[] }>;
  /** Convenience: today's foreground distribution in 24 hourly buckets (ms each). */
  getHourlyDistribution(): Promise<{ hours: number[] }>;
  /** Convenience: today's keyguard unlock count + first-unlock "HH:MM". */
  getUnlocks(): Promise<UnlockSummary>;
}

const UsageStats = registerPlugin<UsageStatsPlugin>('UsageStats');
export default UsageStats;
