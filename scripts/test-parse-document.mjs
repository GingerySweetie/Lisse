import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { docxXmlToText } from '../src/lib/docx.ts';
import {
  sliceText,
  collectFileAttachments,
} from '../src/lib/document-text.ts';

describe('docxXmlToText', () => {
  it('extracts runs and paragraph breaks', () => {
    const xml = `
      <w:document><w:body>
        <w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:t xml:space="preserve"> world</w:t></w:r></w:p>
        <w:p><w:r><w:t>第二段 &amp; 符号</w:t></w:r></w:p>
      </w:body></w:document>`;
    const text = docxXmlToText(xml);
    assert.match(text, /Hello world/);
    assert.match(text, /第二段 & 符号/);
  });

  it('decodes numeric entities', () => {
    const xml = `<w:p><w:r><w:t>&#x4E2D;&#25991;</w:t></w:r></w:p>`;
    assert.equal(docxXmlToText(xml), '中文');
  });
});

describe('sliceText', () => {
  it('pages through long text', () => {
    const text = 'abcdefghij';
    const first = sliceText(text, 0, 4);
    assert.equal(first.text, 'abcd');
    assert.equal(first.truncated, true);
    assert.equal(first.nextStart, 4);

    const second = sliceText(text, first.nextStart, 4);
    assert.equal(second.text, 'efgh');
    assert.equal(second.truncated, true);

    const last = sliceText(text, 8, 4);
    assert.equal(last.text, 'ij');
    assert.equal(last.truncated, false);
    assert.equal(last.nextStart, null);
  });
});

describe('collectFileAttachments', () => {
  it('skips images and returns newest-first', () => {
    const attachments = collectFileAttachments([
      {
        id: 'm1',
        conversationId: 'c',
        parentId: null,
        role: 'user',
        content: 'old',
        status: 'done',
        createdAt: 1,
        attachments: [
          {
            id: 'a1',
            kind: 'file',
            mimeType: 'application/pdf',
            data: 'x',
            filename: 'old.pdf',
          },
        ],
      },
      {
        id: 'm2',
        conversationId: 'c',
        parentId: null,
        role: 'user',
        content: 'new',
        status: 'done',
        createdAt: 2,
        attachments: [
          {
            id: 'img',
            kind: 'image',
            mimeType: 'image/png',
            data: 'x',
          },
          {
            id: 'a2',
            kind: 'file',
            mimeType: 'text/plain',
            data: 'eA==',
            filename: 'note.txt',
          },
        ],
      },
    ]);
    assert.deepEqual(
      attachments.map((a) => a.id),
      ['a2', 'a1'],
    );
  });
});
