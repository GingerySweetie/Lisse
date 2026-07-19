/**
 * Limits and friendly errors for oversized paste / import / IndexedDB writes.
 *
 * Pasting a novel into chat or running a failed "replace" import has wiped
 * users' local DBs (or made the UI look empty after an OOM). These guards
 * fail loudly before we hold giant strings in React state or commit a wipe.
 */

/** Soft cap for a single chat composer message (paste or typed). */
export const MAX_CHAT_MESSAGE_CHARS = 120_000;

/**
 * Above this, paste / composer body is auto-folded into a `.txt` attachment
 * (Claude-style) instead of staying in the textarea.
 */
export const AUTO_FOLD_TEXT_CHARS = 2_000;

/** Hard cap for one auto-folded `.txt` payload (IDB / memory safety). */
export const MAX_FOLDED_TXT_CHARS = 500_000;

/** Hard reject for book body text stored as one IndexedDB row. */
export const MAX_BOOK_CONTENT_CHARS = 2_000_000;

/** Warn / refuse reading a chat-export / config file entirely into memory. */
export const MAX_IMPORT_FILE_BYTES = 80 * 1024 * 1024;

<<<<<<< HEAD
/**
 * Soft cap for full-backup import via the streaming path (chunked read +
 * batched IndexedDB writes). Far above the old in-memory 80MB guard.
 */
export const MAX_BACKUP_STREAM_IMPORT_BYTES = 1024 * 1024 * 1024;

/** Above this, chat bubbles render a truncated preview instead of full Markdown. */
export const MAX_BUBBLE_RENDER_CHARS = 40_000;
=======
/** Above this, chat bubbles render a plain truncated preview (no Markdown). */
export const MAX_BUBBLE_RENDER_CHARS = 12_000;
>>>>>>> 7d12427 (fix(chat): fold at 2k chars; stop long-chat switch crashes)

export class StorageLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageLimitError';
  }
}

export function formatChars(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)} 万字`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k 字`;
  return `${n} 字`;
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export function assertChatMessageSize(text: string): void {
  if (text.length > MAX_CHAT_MESSAGE_CHARS) {
    throw new StorageLimitError(
      `这段文字太长了（${formatChars(text.length)}），聊天输入框上限 ${formatChars(MAX_CHAT_MESSAGE_CHARS)}。` +
        `超长粘贴会自动折叠成 .txt 附件；再长请放到「书架」导入。`,
    );
  }
}

export function assertBookContentSize(text: string): void {
  if (text.length > MAX_BOOK_CONTENT_CHARS) {
    throw new StorageLimitError(
      `书的内容太长了（${formatChars(text.length)}），上限大约 ${formatChars(MAX_BOOK_CONTENT_CHARS)}。` +
        `请拆成多本或先删减再导入，否则写入 IndexedDB 时可能把整个应用拖垮。`,
    );
  }
}

export function assertImportFileSize(file: File, label = '导入文件'): void {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new StorageLimitError(
      `${label}太大了（${formatBytes(file.size)}），上限 ${formatBytes(MAX_IMPORT_FILE_BYTES)}。` +
        `请先在电脑上拆分，或导出一份更小的备份再导入——整文件读进内存会直接把页面打死。`,
    );
  }
}

/** Size guard for streaming full-backup import (not whole-file JSON.parse). */
export function assertBackupImportFileSize(
  size: number,
  label = '备份文件',
): void {
  if (size > MAX_BACKUP_STREAM_IMPORT_BYTES) {
    throw new StorageLimitError(
      `${label}太大了（${formatBytes(size)}），流式导入上限 ${formatBytes(MAX_BACKUP_STREAM_IMPORT_BYTES)}。` +
        `请先在电脑上拆成多份更小的备份，或删减对话后再导出。`,
    );
  }
}

/** Map QuotaExceeded / Dexie / DOMException into a user-facing Chinese message. */
export function formatStorageError(err: unknown): string {
  if (err instanceof StorageLimitError) return err.message;

  const name =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name: unknown }).name)
      : '';
  const msg = err instanceof Error ? err.message : String(err);
  const blob = `${name} ${msg}`;

  if (
    name === 'QuotaExceededError' ||
    /quotaexceeded|exceeded.*quota|the quota|存储空间|空间不足/i.test(blob)
  ) {
    return (
      '本地存储空间不够了（IndexedDB 配额已满）。' +
      '请先到「导入 / 导出」导出备份，再删掉特别大的对话、附件或书籍腾出空间。' +
      '不要用「替换导入」碰运气——清库之后如果写不回去，数据会真的没了。'
    );
  }

  return msg || '存储写入失败';
}
