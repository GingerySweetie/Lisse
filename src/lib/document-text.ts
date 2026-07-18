import type { Attachment, Message } from '../types';

/** Page a long extracted document for tool results. */
export function sliceText(
  text: string,
  startChar: number,
  maxChars: number,
): { text: string; truncated: boolean; nextStart: number | null } {
  const start = Math.min(Math.max(0, startChar), text.length);
  const end = Math.min(text.length, start + maxChars);
  const sliced = text.slice(start, end);
  const truncated = end < text.length;
  return {
    text: sliced,
    truncated,
    nextStart: truncated ? end : null,
  };
}

/** Newest-first non-image file attachments from user messages. */
export function collectFileAttachments(messages: Message[]): Attachment[] {
  const sorted = [...messages].sort((a, b) => b.createdAt - a.createdAt);
  const out: Attachment[] = [];
  for (const m of sorted) {
    if (m.role !== 'user' || !m.attachments?.length) continue;
    for (const a of m.attachments) {
      if (a.kind !== 'image') out.push(a);
    }
  }
  return out;
}
