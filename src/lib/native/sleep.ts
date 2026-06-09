import { registerPlugin } from '@capacitor/core';

/**
 * Sleep — thin bridge over the native Health Connect SleepSessionRecord
 * reader. On non-Android the methods resolve to safe defaults (no sleep,
 * unavailable) so the same UI code runs in the browser preview.
 */

export interface SleepSession {
  /** ISO-8601 string with offset. */
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

export interface SleepPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  hasPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<void>;
  getLastSleep(): Promise<{ session: SleepSession | null }>;
}

const Sleep = registerPlugin<SleepPlugin>('Sleep');
export default Sleep;
