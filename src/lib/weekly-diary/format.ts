/**
 * Week-boundary helpers for 周记.
 *
 * A week starts on `readWeekday` (default Friday) and lasts 7 local days.
 * On that weekday the app starts injecting last week's 周记 and opens a new
 * week. Example with Friday:
 *   week 2026-07-31 … 2026-08-06  → injected starting Fri 2026-08-07
 */

export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseLocalDate(date: string): Date {
  const [y, m, day] = date.split('-').map(Number);
  return new Date(y!, m! - 1, day!, 0, 0, 0, 0);
}

export function addLocalDays(d: Date, days: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + days);
  return out;
}

/**
 * Start of the week containing `now` — most recent `readWeekday` on or
 * before today (local midnight).
 */
export function currentWeekStart(now: Date, readWeekday: number): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = (d.getDay() - readWeekday + 7) % 7;
  return addLocalDays(d, -diff);
}

/** Inclusive local dates for the week that starts on `weekStart`. */
export function weekBoundsFromStart(weekStart: Date | string): {
  weekStart: string;
  weekEnd: string;
  startMs: number;
  endMs: number;
  dates: string[];
} {
  const start =
    typeof weekStart === 'string' ? parseLocalDate(weekStart) : weekStart;
  const end = addLocalDays(start, 6);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(formatLocalDate(addLocalDays(start, i)));
  }
  return {
    weekStart: formatLocalDate(start),
    weekEnd: formatLocalDate(end),
    startMs: start.getTime(),
    endMs: new Date(
      end.getFullYear(),
      end.getMonth(),
      end.getDate(),
      23,
      59,
      59,
      999,
    ).getTime(),
    dates,
  };
}

/** The most recently completed week relative to `now`. */
export function lastCompletedWeek(
  now: Date,
  readWeekday: number,
): { weekStart: string; weekEnd: string; dates: string[] } {
  const cur = currentWeekStart(now, readWeekday);
  const lastStart = addLocalDays(cur, -7);
  return weekBoundsFromStart(lastStart);
}

export function weeklyDiaryEntryId(weekStart: string, personaId: string): string {
  return `${weekStart}|${personaId}`;
}

/** Format a done weekly diary for chat system injection. */
export function formatWeeklyDiaryBlock(entry: {
  weekStart: string;
  weekEnd: string;
  content: string;
}): string {
  const body = entry.content.trim();
  if (!body) return '';
  return (
    `# 你上周写下的周记（${entry.weekStart} ~ ${entry.weekEnd}）\n` +
    body +
    '\n\n这是你自己写下的上周记事。你可以自然地记得它，' +
    '但不要主动复述全文，除非她问起。'
  );
}
