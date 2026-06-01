import JSZip from 'jszip';

/**
 * Minimal EPUB parser. Extracts title + author + concatenated body text
 * in markdown form, suitable for storing in our Book.content (which we
 * later render via remark).
 *
 * Skipped: images, fonts, CSS, cover art, footnotes-as-popups, page
 * breaks. The reader is a single long-scroll surface, so chapter order
 * is preserved (spine), but visual chapter boundaries are just `---`
 * separators and `# Title` headers.
 */
export interface ParsedEpub {
  title?: string;
  author?: string;
  content: string;
  format: 'md';
}

export async function parseEpub(file: File): Promise<ParsedEpub> {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  // 1. META-INF/container.xml → root .opf path.
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) {
    throw new Error('不是有效的 EPUB：缺 META-INF/container.xml');
  }
  const containerXml = await containerFile.async('string');
  const rootMatch = containerXml.match(/<rootfile[^>]+full-path=["']([^"']+)["']/i);
  if (!rootMatch) {
    throw new Error('container.xml 里找不到 rootfile');
  }
  const opfPath = rootMatch[1];
  const opfDir = opfPath.includes('/')
    ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1)
    : '';

  // 2. opf has metadata + manifest (id → href) + spine (id order).
  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error(`找不到 ${opfPath}`);
  const opfXml = await opfFile.async('string');

  const title = stripCDATA(opfXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1]);
  const author = stripCDATA(
    opfXml.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i)?.[1],
  );

  const manifest: Record<string, string> = {};
  const manifestRe = /<item[^>]*\bid=["']([^"']+)["'][^>]*\bhref=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = manifestRe.exec(opfXml)) !== null) {
    manifest[m[1]] = decodeURIComponent(m[2]);
  }
  // Also accept attribute order href-before-id.
  const manifestReAlt = /<item[^>]*\bhref=["']([^"']+)["'][^>]*\bid=["']([^"']+)["']/gi;
  while ((m = manifestReAlt.exec(opfXml)) !== null) {
    if (!manifest[m[2]]) manifest[m[2]] = decodeURIComponent(m[1]);
  }

  const spineIds: string[] = [];
  const spineRe = /<itemref[^>]*\bidref=["']([^"']+)["']/gi;
  while ((m = spineRe.exec(opfXml)) !== null) {
    spineIds.push(m[1]);
  }

  // 3. Read each spine item's XHTML in order, convert to markdown.
  const chapters: string[] = [];
  for (const id of spineIds) {
    const href = manifest[id];
    if (!href) continue;
    const path = opfDir + href;
    const f = zip.file(path);
    if (!f) continue;
    let xhtml: string;
    try {
      xhtml = await f.async('string');
    } catch {
      continue;
    }
    const md = xhtmlToMarkdown(xhtml).trim();
    if (md) chapters.push(md);
  }

  if (chapters.length === 0) {
    throw new Error('EPUB 里没有提取到任何章节文本');
  }

  return {
    title,
    author,
    content: chapters.join('\n\n---\n\n'),
    format: 'md',
  };
}

function stripCDATA(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const cleaned = s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
  return cleaned || undefined;
}

/**
 * Very conservative XHTML→markdown. Walks tag tokens with a stack-based
 * approach so nested em/strong don't collide. Everything not whitelisted
 * is stripped to text content.
 */
function xhtmlToMarkdown(xhtml: string): string {
  // Slice body content if present — EPUB XHTML is a full document.
  const bodyMatch = xhtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let src = (bodyMatch ? bodyMatch[1] : xhtml).trim();

  // Normalize: drop XML decls, script/style, comments.
  src = src
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Block-level conversions (apply before inline).
  src = src
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n\n#### $1\n\n')
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n\n##### $1\n\n')
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n\n###### $1\n\n')
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_w, inner) => {
      const lines = String(inner)
        .replace(/<[^>]+>/g, '')
        .trim()
        .split('\n');
      return '\n\n' + lines.map((l) => `> ${l.trim()}`).join('\n') + '\n\n';
    })
    .replace(/<hr\s*\/?>/gi, '\n\n---\n\n')
    .replace(/<br\s*\/?>/gi, '  \n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n')
    .replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '\n\n$1\n\n');

  // Inline conversions.
  src = src
    .replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*')
    .replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // Drop every remaining tag, keep content.
  src = src.replace(/<[^>]+>/g, '');

  // Decode common entities.
  src = decodeEntities(src);

  // Collapse runaway whitespace.
  return src.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_w, d) => {
      const n = Number(d);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _w;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_w, h) => {
      const n = parseInt(h, 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _w;
    });
}
