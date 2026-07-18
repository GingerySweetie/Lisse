/**
 * Minimal DOCX → plain text extractor.
 *
 * Office Open XML is a zip; body text lives in word/document.xml as
 * `<w:t>` runs. We don't pull in mammoth — just enough to make chat
 * attachments readable for the parse_document tool.
 */

export interface ParsedDocx {
  title: string;
  content: string;
  format: 'txt';
}

export async function parseDocx(file: File): Promise<ParsedDocx> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const doc = zip.file('word/document.xml');
  if (!doc) {
    throw new Error('不是有效的 DOCX：缺 word/document.xml');
  }
  const xml = await doc.async('string');
  const content = docxXmlToText(xml);
  if (!content.trim()) {
    throw new Error('这个 Word 文档里没有可提取的文字。');
  }
  const title = file.name.replace(/\.docx$/i, '') || 'document';
  return { title, content, format: 'txt' };
}

/** Pure XML → text helper (exported for unit tests). */
export function docxXmlToText(xml: string): string {
  return xml
    .replace(/<w:binData[\s\S]*?<\/w:binData>/gi, '')
    .replace(/<w:pict[\s\S]*?<\/w:pict>/gi, '')
    .replace(/<w:drawing[\s\S]*?<\/w:drawing>/gi, '')
    .replace(/<\/w:p>/gi, '\n')
    .replace(/<w:br\b[^/]*\/>/gi, '\n')
    .replace(/<w:cr\b[^/]*\/>/gi, '\n')
    .replace(/<w:tab\b[^/]*\/>/gi, '\t')
    .replace(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi, (_w, inner: string) =>
      decodeXmlEntities(inner),
    )
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_w, d) => {
      const n = Number(d);
      return Number.isFinite(n) ? String.fromCodePoint(n) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_w, h) => {
      const n = parseInt(h, 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : '';
    });
}
