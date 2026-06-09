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

export interface UsageStatsPlugin {
  hasPermission(): Promise<{ granted: boolean }>;
  /** Launch system Settings → Usage access. User flips Wisteria's switch. */
  openSettings(): Promise<void>;
  /** Today's foreground time per app since local midnight. */
  getTodayUsage(): Promise<{ usage: AppUsage[] }>;
}

const UsageStats = registerPlugin<UsageStatsPlugin>('UsageStats');
export default UsageStats;
