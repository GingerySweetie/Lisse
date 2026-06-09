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
  openSettings(): Promise<void>;
  getTodayUsage(): Promise<{ usage: AppUsage[] }>;
  /** Total foreground ms per day, last 7 days (oldest → newest). */
  getWeekUsage(): Promise<{ days: DayUsage[] }>;
  /** Today's foreground distribution in 24 hourly buckets (ms each). */
  getHourlyDistribution(): Promise<{ hours: number[] }>;
  /** Today's keyguard unlock count + first-unlock time. */
  getUnlocks(): Promise<UnlockSummary>;
}

const UsageStats = registerPlugin<UsageStatsPlugin>('UsageStats');
export default UsageStats;
