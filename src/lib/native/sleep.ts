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
  /** Net screen-off minutes: brief night wakes (≤ 30 min screen-on gaps)
   *  are merged into the block and subtracted, so this can be smaller
   *  than endTime − startTime. */
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
   *  Screen-off spans separated by ≤ 30 min get merged into one block
   *  first, so checking the phone at 3am doesn't split the night.
   *  Returns null session if no qualifying block (net ≥ 3h within the
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
