/**
 * Week-start dates (YYYY-MM-DD) that should have 周记 by now.
 * Newest completed week first; lookback covers app-closed catch-up.
 *
 * On readWeekday before writeHour, the newest completed week is skipped
 * unless `forceLast` (Settings「立即写上周周记」).
 *
 * Pure — no relative imports so node --test can load this file directly.
 */

const LOOKBACK_WEEKS = 4;

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addLocalDays(d: Date, days: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + days);
  return out;
}

function currentWeekStart(now: Date, readWeekday: number): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = (d.getDay() - readWeekday + 7) % 7;
  return addLocalDays(d, -diff);
}

function clampWeekday(n: number): number {
  if (!Number.isFinite(n)) return 5;
  return Math.min(6, Math.max(0, Math.floor(n)));
}

function clampHour(n: number): number {
  if (!Number.isFinite(n)) return 9;
  return Math.min(23, Math.max(0, Math.floor(n)));
}

export function weeksNeedingWeeklyDiary(
  now: Date,
  readWeekday: number,
  writeHour: number,
  forceLast = false,
): string[] {
  const wd = clampWeekday(readWeekday);
  const hourGate = clampHour(writeHour);
  const curStart = currentWeekStart(now, wd);
  const starts: string[] = [];

  for (let w = 1; w <= LOOKBACK_WEEKS; w++) {
    const start = addLocalDays(curStart, -7 * w);
    if (w === 1 && !forceLast) {
      const onReadDay = now.getDay() === wd;
      const onWeekStartDay =
        formatLocalDate(now) === formatLocalDate(curStart);
      if (onReadDay && onWeekStartDay && now.getHours() < hourGate) {
        continue;
      }
    }
    starts.push(formatLocalDate(start));
  }
  return starts;
}
