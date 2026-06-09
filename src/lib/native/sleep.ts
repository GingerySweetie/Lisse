import { registerPlugin } from '@capacitor/core';

/**
 * Sleep — bridge over the native SleepEstimatePlugin (option A from the
 * spec). Estimates last night's sleep from PACKAGE_USAGE_STATS screen
 * events (SCREEN_NON_INTERACTIVE → SCREEN_INTERACTIVE/KEYGUARD_HIDDEN).
 *
 * Permission flow lives in the same Usage Access settings page as
 * UsageStats — one switch covers both. Use Sleep.requestPermission()
 * (or UsageStats.requestPermission()) to launch it.
 */

export interface SleepSession {
  /** ISO-8601 with offset. */
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

export interface SleepPlugin {
  /** True iff PACKAGE_USAGE_STATS has been granted. */
  hasPermission(): Promise<{ granted: boolean }>;
  /** Open the system Settings → Usage access page. */
  requestPermission(): Promise<void>;
  /** Backward-compat shim — always resolves true since the estimation
   *  is pure native and doesn't depend on Health Connect being installed. */
  isAvailable(): Promise<{ available: boolean }>;
  /** Estimate last night's sleep from screen lock/unlock events.
   *  Returns null session if no qualifying span (≥ 3h within the
   *  yesterday-18:00 → today-14:00 window) was found. */
  estimateLastNightSleep(): Promise<{
    session: SleepSession | null;
    startTime: string | null;
    endTime: string | null;
    durationMinutes: number;
  }>;
  /** Backward-compat alias. */
  getLastSleep(): Promise<{ session: SleepSession | null }>;
}

const Sleep = registerPlugin<SleepPlugin>('Sleep');
export default Sleep;
