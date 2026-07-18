import type { DiaryEntry } from '../../types';

export function diaryEntryId(date: string, personaId: string): string {
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

/** Format a done diary for injection into chat context. */
export function formatDiaryBlock(entry: DiaryEntry): string {
  const body = entry.content.trim();
  if (!body) return '';
  return (
    `# 你昨天写下的日记（${entry.date}）\n` +
    body +
    '\n\n这是你自己昨夜写下的私密日记。你可以自然地记得它、被它影响情绪，' +
    '但不要主动复述全文，除非她问起。'
  );
}
