import type { Attachment } from '../types';
import {
  AUTO_FOLD_TEXT_CHARS,
  MAX_FOLDED_TXT_CHARS,
  formatChars,
  StorageLimitError,
} from './storage-guards.ts';

/**
 * Claude-style long-text folding: oversized paste/composer body becomes a
 * `.txt` attachment chip instead of living in the textarea. The model still
 * receives the full text via the normal text-attachment inject path.
 */

export function shouldAutoFoldText(text: string): boolean {
  return text.length >= AUTO_FOLD_TEXT_CHARS;
}

export function suggestedPastedTxtName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `粘贴文本-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.txt`;
}

/** Clamp folded body; throws if somehow empty after trim. */
export function prepareFoldedText(text: string): {
  content: string;
  truncated: boolean;
  originalChars: number;
} {
  const originalChars = text.length;
  if (!text.trim()) {
    throw new StorageLimitError('没有可折叠的文字');
  }
  if (text.length <= MAX_FOLDED_TXT_CHARS) {
    return { content: text, truncated: false, originalChars };
  }
  const content =
    text.slice(0, MAX_FOLDED_TXT_CHARS) +
    `\n\n…（原文 ${formatChars(originalChars)}，已截断到 ${formatChars(MAX_FOLDED_TXT_CHARS)}）`;
  return { content, truncated: true, originalChars };
}

export async function textToTxtAttachment(
  text: string,
  filename?: string,
): Promise<Attachment> {
  // Dynamic import keeps pure helpers loadable in Node unit tests.
  const { fileToAttachment } = await import('./attachments.ts');
  const { content } = prepareFoldedText(text);
  const name = filename ?? suggestedPastedTxtName();
  const file = new File([content], name, {
    type: 'text/plain;charset=utf-8',
  });
  return fileToAttachment(file);
}
