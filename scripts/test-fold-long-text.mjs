import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_FOLD_TEXT_CHARS,
  MAX_FOLDED_TXT_CHARS,
} from '../src/lib/storage-guards.ts';
import {
  shouldAutoFoldText,
  suggestedPastedTxtName,
  prepareFoldedText,
} from '../src/lib/fold-long-text.ts';

describe('shouldAutoFoldText', () => {
  it(`folds at ${AUTO_FOLD_TEXT_CHARS} chars`, () => {
    assert.equal(shouldAutoFoldText('a'.repeat(AUTO_FOLD_TEXT_CHARS - 1)), false);
    assert.equal(shouldAutoFoldText('a'.repeat(AUTO_FOLD_TEXT_CHARS)), true);
  });
});

describe('suggestedPastedTxtName', () => {
  it('uses a stable 粘贴文本- timestamp pattern', () => {
    // Local-time constructor so the assertion is timezone-independent.
    const name = suggestedPastedTxtName(new Date(2026, 6, 18, 21, 56, 3));
    assert.equal(name, '粘贴文本-20260718-215603.txt');
  });
});

describe('prepareFoldedText', () => {
  it('passes through under the hard cap', () => {
    const r = prepareFoldedText('hello');
    assert.equal(r.content, 'hello');
    assert.equal(r.truncated, false);
  });

  it('truncates over the hard cap with a notice', () => {
    const r = prepareFoldedText('x'.repeat(MAX_FOLDED_TXT_CHARS + 50));
    assert.equal(r.truncated, true);
    assert.ok(r.content.startsWith('x'.repeat(100)));
    assert.match(r.content, /已截断/);
    assert.ok(r.content.length < MAX_FOLDED_TXT_CHARS + 200);
  });
});
