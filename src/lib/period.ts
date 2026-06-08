import { db } from '../db';
import { newId } from './id';
import type { PeriodEntry } from '../types';

/** Format a Date as local YYYY-MM-DD. */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Whole days between two YYYY-MM-DD strings, b - a. */
export function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00');
  const dbd = new Date(b + 'T00:00:00');
  return Math.round((dbd.getTime() - da.getTime()) / 86_400_000);
}

/** Sort ascending by startDate (oldest first). */
export function sortByStart(entries: PeriodEntry[]): PeriodEntry[] {
  return [...entries].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export interface CycleSummary {
  /** Most recent start date, or null if no entries. */
  latestStart: string | null;
  /** Day of current cycle (1-indexed from latestStart). 0 if none. */
  currentDay: number;
  /** Average cycle length over the last 6 entries, or default 28. */
  avgCycle: number;
  /** Average period length (start→end if recorded), default 5. */
  avgPeriod: number;
  /** Days until next expected start (negative = overdue). */
  daysToNext: number;
  /** Predicted next start date. */
  predictedNext: string;
}

const DEFAULT_CYCLE = 28;
const DEFAULT_PERIOD = 5;

export function summarizeCycle(
  entries: PeriodEntry[],
  todayIso: string = isoDate(new Date()),
): CycleSummary {
  const sorted = sortByStart(entries);
  if (sorted.length === 0) {
    return {
      latestStart: null,
      currentDay: 0,
      avgCycle: DEFAULT_CYCLE,
      avgPeriod: DEFAULT_PERIOD,
      daysToNext: DEFAULT_CYCLE,
      predictedNext: todayIso,
    };
  }
  const recent = sorted.slice(-7); // last ~7 entries for avg
  // Cycle lengths = gaps between consecutive starts.
  const gaps: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    gaps.push(daysBetween(recent[i - 1].startDate, recent[i].startDate));
  }
  const avgCycle = gaps.length > 0
    ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)
    : DEFAULT_CYCLE;
  // Period lengths (only entries with endDate).
  const periodLengths = recent
    .filter((e) => e.endDate)
    .map((e) => daysBetween(e.startDate, e.endDate!) + 1)
    .filter((n) => n > 0 && n < 14);
  const avgPeriod = periodLengths.length > 0
    ? Math.round(periodLengths.reduce((a, b) => a + b, 0) / periodLengths.length)
    : DEFAULT_PERIOD;

  const latestStart = sorted[sorted.length - 1].startDate;
  const currentDay = daysBetween(latestStart, todayIso) + 1;
  const predicted = new Date(latestStart + 'T00:00:00');
  predicted.setDate(predicted.getDate() + avgCycle);
  const predictedNext = isoDate(predicted);
  const daysToNext = daysBetween(todayIso, predictedNext);

  return {
    latestStart,
    currentDay,
    avgCycle,
    avgPeriod,
    daysToNext,
    predictedNext,
  };
}

export async function addPeriodStart(startDate: string): Promise<PeriodEntry> {
  const entry: PeriodEntry = {
    id: newId(),
    startDate,
    createdAt: Date.now(),
  };
  await db.periodEntries.add(entry);
  return entry;
}

export async function setPeriodEnd(
  id: string,
  endDate: string,
): Promise<void> {
  await db.periodEntries.update(id, { endDate });
}

export async function deletePeriodEntry(id: string): Promise<void> {
  await db.periodEntries.delete(id);
}
