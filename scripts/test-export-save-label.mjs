/**
 * Pure-logic tests for export save labels.
 * Run: node --experimental-strip-types --test scripts/test-export-save-label.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { formatExportSaveLabel } from '../src/lib/export-save-result.ts';

test('formatExportSaveLabel mentions folder when used', () => {
  const label = formatExportSaveLabel(
    {
      usedBackupFolder: true,
      folder: { uri: 'content://x', label: 'Wisteria' },
    },
    '已保存配置 JSON',
  );
  assert.equal(label, '已保存配置 JSON（已保存到「Wisteria」）');
});

test('formatExportSaveLabel keeps fallback without folder', () => {
  assert.equal(
    formatExportSaveLabel(
      { usedBackupFolder: false, folder: null },
      '已导出 3 条对话',
    ),
    '已导出 3 条对话',
  );
});
