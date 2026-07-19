export function confessionEntryId(date: string, personaId: string): string {
  return `${date}|${personaId}`;
}

export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function localDayBounds(date: string): { start: number; end: number } {
  const [y, m, day] = date.split('-').map(Number);
  const start = new Date(y!, m! - 1, day!, 0, 0, 0, 0).getTime();
  const end = new Date(y!, m! - 1, day!, 23, 59, 59, 999).getTime();
  return { start, end };
}

export function yesterdayDate(now: Date = new Date()): string {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return formatLocalDate(y);
}
