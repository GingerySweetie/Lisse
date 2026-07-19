/** How many past calendar days to catch up if the app was closed at writeHour. */
export const LOOKBACK_DAYS = 7;
const DEFAULT_WRITE_HOUR = 22;

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Dates that should have confessions by now:
 * - today, once local hour >= writeHour (or force)
 * - previous LOOKBACK_DAYS days (catch-up when the app was closed)
 */
export function datesNeedingConfession(
  now: Date,
  writeHour: number,
  forceToday = false,
): string[] {
  const hour = now.getHours();
  const dates: string[] = [];
  const includeToday = forceToday || hour >= clampHour(writeHour);

  for (let i = 0; i <= LOOKBACK_DAYS; i++) {
    if (i === 0 && !includeToday) continue;
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(formatLocalDate(d));
  }
  return dates;
}

function clampHour(h: number): number {
  if (!Number.isFinite(h)) return DEFAULT_WRITE_HOUR;
  return Math.min(23, Math.max(0, Math.floor(h)));
}
