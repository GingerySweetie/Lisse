import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CHAT_MESSAGE_CHARS,
  MAX_BOOK_CONTENT_CHARS,
  MAX_IMPORT_FILE_BYTES,
  assertChatMessageSize,
  assertBookContentSize,
  assertImportFileSize,
  formatStorageError,
  StorageLimitError,
  formatChars,
  formatBytes,
} from '../src/lib/storage-guards.ts';

describe('storage-guards', () => {
  it('allows chat messages under the cap', () => {
    assert.doesNotThrow(() => assertChatMessageSize('a'.repeat(1000)));
  });

  it('rejects oversized chat messages', () => {
    assert.throws(
      () => assertChatMessageSize('a'.repeat(MAX_CHAT_MESSAGE_CHARS + 1)),
      StorageLimitError,
    );
  });

  it('rejects oversized books', () => {
    assert.throws(
      () => assertBookContentSize('x'.repeat(MAX_BOOK_CONTENT_CHARS + 1)),
      StorageLimitError,
    );
  });

  it('rejects oversized import files', () => {
    const file = { size: MAX_IMPORT_FILE_BYTES + 1, name: 'huge.json' };
    assert.throws(
      () => assertImportFileSize(/** @type {File} */ (file), '备份'),
      StorageLimitError,
    );
  });

  it('maps QuotaExceededError to a Chinese recovery hint', () => {
    const err = new DOMException('quota', 'QuotaExceededError');
    const msg = formatStorageError(err);
    assert.match(msg, /本地存储空间不够/);
    assert.match(msg, /替换导入/);
  });

  it('formats sizes for UI copy', () => {
    assert.equal(formatChars(12_000), '1.2 万字');
    assert.equal(formatBytes(2 * 1024 * 1024), '2.0 MB');
  });
});
