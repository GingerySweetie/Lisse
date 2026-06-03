import JSZip from 'jszip';
import type { TocEntry } from '../types';

/**
 * Minimal EPUB parser. Extracts title + author + concatenated body text
 * in markdown form + TOC keyed to char offsets of each spine file, so
 * the reader gets accurate chapter navigation even when the original
 * XHTML didn't use semantic <h*> for chapter titles.
 */
export interface ParsedEpub {
  title?: string;
  author?: string;
  content: string;
  format: 'md';
  /** One entry per spine file — the EPUB itself defines chapters. */
  toc: TocEntry[];
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

  // 2b. Try to read the EPUB 3 nav doc or EPUB 2 NCX for nicer chapter
  // titles. Optional — falls back to first-heading-or-filename when
  // missing.
  const navTitles = await readNavTitles(zip, opfXml, manifest, opfDir);

  // 3. Read each spine item's XHTML in order, convert to markdown,
  // track char offset so we can emit a TOC anchored to the body.
  const SEP = '\n\n---\n\n';
  const parts: string[] = [];
  const toc: TocEntry[] = [];
  let offset = 0;
  let idx = 0;
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
    if (!md) continue;

    // Chapter title priority: (a) nav/ncx label keyed by href,
    // (b) first <h1-6> in the XHTML, (c) <title>, (d) "章节 N".
    const navLabel = navTitles[normalizeHref(href)];
    const headingFromXhtml = firstHeadingTitle(xhtml);
    const docTitle = stripCDATA(xhtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
    idx += 1;
    const chapterTitle = navLabel ?? headingFromXhtml ?? docTitle ?? `章节 ${idx}`;

    // Inject a markdown heading at the top of each chapter — that way
    // the reader also visually has the chapter title.
    const titledChapter = `# ${chapterTitle}\n\n${md}`;

    // toc position = where this chapter starts in the final content.
    const startOffset = offset + (parts.length > 0 ? SEP.length : 0);
    toc.push({ title: chapterTitle, position: startOffset, level: 1 });
    parts.push(titledChapter);
    offset = startOffset + titledChapter.length;
  }

  if (parts.length === 0) {
    throw new Error('EPUB 里没有提取到任何章节文本');
  }

  return {
    title,
    author,
    content: parts.join(SEP),
    format: 'md',
    toc,
  };
}

/** First-heading text within an XHTML chapter. Returns text-only,
 *  trimmed, decoded. */
function firstHeadingTitle(xhtml: string): string | undefined {
  const m = xhtml.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  if (!m) return undefined;
  const text = m[1].replace(/<[^>]+>/g, '').trim();
  return text ? decodeEntities(text) : undefined;
}

function normalizeHref(href: string): string {
  // Strip fragment, decode percent-escapes, lowercase host-side bits.
  const noFrag = href.split('#')[0];
  try {
    return decodeURIComponent(noFrag);
  } catch {
    return noFrag;
  }
}

/** EPUB 3 nav doc OR EPUB 2 toc.ncx — extract href → label map. */
async function readNavTitles(
  zip: JSZip,
  opfXml: string,
  manifest: Record<string, string>,
  opfDir: string,
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};

  // EPUB 3 nav: any item with properties="nav".
  const navMatch = opfXml.match(
    /<item[^>]*\bproperties=["'][^"']*\bnav\b[^"']*["'][^>]*\bhref=["']([^"']+)["']/i,
  );
  let navHref =
    navMatch?.[1] ??
    opfXml.match(
      /<item[^>]*\bhref=["']([^"']+)["'][^>]*\bproperties=["'][^"']*\bnav\b[^"']*["']/i,
    )?.[1];
  if (navHref) {
    const f = zip.file(opfDir + decodeURIComponent(navHref));
    if (f) {
      try {
        const navXhtml = await f.async('string');
        // Find <nav epub:type="toc"> (or any nav) and pull <a href> labels.
        const navBlock = navXhtml.match(
          /<nav[^>]*(?:epub:type=["'][^"']*toc[^"']*["'])?[^>]*>([\s\S]*?)<\/nav>/i,
        );
        const navSrc = navBlock ? navBlock[1] : navXhtml;
        const linkRe =
          /<a[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let m: RegExpExecArray | null;
        while ((m = linkRe.exec(navSrc)) !== null) {
          const label = decodeEntities(m[2].replace(/<[^>]+>/g, '').trim());
          if (label) {
            map[normalizeHref(m[1])] = label;
          }
        }
        if (Object.keys(map).length > 0) return map;
      } catch {
        // fall through to NCX
      }
    }
  }

  // EPUB 2 NCX: manifest item with media-type="application/x-dtbncx+xml".
  const ncxMatch = opfXml.match(
    /<item[^>]*\bmedia-type=["']application\/x-dtbncx\+xml["'][^>]*\bhref=["']([^"']+)["']/i,
  );
  const ncxHref =
    ncxMatch?.[1] ??
    opfXml.match(
      /<item[^>]*\bhref=["']([^"']+)["'][^>]*\bmedia-type=["']application\/x-dtbncx\+xml["']/i,
    )?.[1];
  // OPF can also reference NCX via <spine toc="..."> id ref.
  const spineTocId = opfXml.match(/<spine[^>]*\btoc=["']([^"']+)["']/i)?.[1];
  const ncxFromSpine = spineTocId ? manifest[spineTocId] : undefined;
  const finalNcxHref = ncxHref ?? ncxFromSpine;
  if (!finalNcxHref) return map;

  const f = zip.file(opfDir + decodeURIComponent(finalNcxHref));
  if (!f) return map;
  try {
    const ncx = await f.async('string');
    // <navPoint><navLabel><text>Title</text></navLabel><content src="href"/></navPoint>
    const npRe =
      /<navPoint[^>]*>([\s\S]*?)<\/navPoint>/gi;
    let m: RegExpExecArray | null;
    while ((m = npRe.exec(ncx)) !== null) {
      const block = m[1];
      const label = stripCDATA(
        block.match(/<navLabel[^>]*>[\s\S]*?<text[^>]*>([\s\S]*?)<\/text>/i)?.[1],
      );
      const src = block.match(/<content[^>]*\bsrc=["']([^"']+)["']/i)?.[1];
      if (label && src) {
        map[normalizeHref(src)] = label;
      }
    }
  } catch {
    // give up, use fallback titles
  }
  return map;
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
