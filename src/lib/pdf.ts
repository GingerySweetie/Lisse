/**
 * PDF → plain text parser using pdfjs-dist (lazy-loaded so the ~1 MB
 * worker bundle only loads when a PDF is actually imported).
 *
 * Returns title (from PDF metadata or filename) and the full extracted
 * text as a single string, suitable for feeding into createBook().
 */

export interface ParsedPdf {
  title: string;
  author?: string;
  content: string;
  format: 'txt';
}

export async function parsePdf(file: File): Promise<ParsedPdf> {
  // pdfjs-dist is ESM and ships its own worker. We point the worker at
  // the CDN-hosted copy so we don't bloat the main bundle with a second
  // copy of the worker script. (The local copy in node_modules is also
  // fine if you prefer a fully offline build — just swap the URL.)
  const pdfjsLib = await import('pdfjs-dist');

  // Use the bundled worker entry-point shipped with pdfjs-dist v4+.
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url,
  ).href;

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  // Extract metadata for title / author.
  let title = file.name.replace(/\.pdf$/i, '');
  let author: string | undefined;
  try {
    const meta = await pdf.getMetadata();
    const info = meta.info as Record<string, unknown>;
    if (typeof info.Title === 'string' && info.Title.trim()) {
      title = info.Title.trim();
    }
    if (typeof info.Author === 'string' && info.Author.trim()) {
      author = info.Author.trim();
    }
  } catch {
    // Metadata is optional — continue without it.
  }

  // Extract text from every page in order.
  const pageTexts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    // Join items with space; add a paragraph break between pages.
    const pageText = tc.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim();
    if (pageText) pageTexts.push(pageText);
  }

  const content = pageTexts.join('\n\n');

  if (!content.trim()) {
    throw new Error(
      '这个 PDF 里没有可提取的文字（可能是扫描版图片 PDF，暂不支持喵）。',
    );
  }

  return { title, author, content, format: 'txt' };
}
