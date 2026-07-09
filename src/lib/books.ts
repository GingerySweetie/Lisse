import { db } from '../db';
import type { Book, Bookmark, Conversation, TocEntry } from '../types';
import { newId } from './id';
import { createConversation } from './chat';

export interface NewBookInput {
  title: string;
  author?: string;
  content: string;
  format?: 'txt' | 'md';
  /** When the source (EPUB, etc.) already has authoritative chapter
   *  boundaries, the caller passes them in and we use them as-is
   *  instead of running regex heuristics on the body text. */
  toc?: TocEntry[];
}

export async function createBook(input: NewBookInput): Promise<Book> {
  const now = Date.now();
  const format = input.format ?? guessFormat(input.title, input.content);
  const book: Book = {
    id: newId(),
    title: input.title.trim() || '未命名',
    author: input.author?.trim() || undefined,
    content: input.content,
    format,
    totalChars: input.content.length,
    lastPosition: 0,
    toc: input.toc ?? extractToc(input.content, format),
    createdAt: now,
    updatedAt: now,
  };
  await db.books.add(book);
  return book;
}

/** Extract a flat TOC from book content. Tries multiple strategies in
 *  priority order — md headings, 中文章节, English chapters, setext
 *  headings, numbered sections. If none match, splits the book into
 *  evenly-spaced anchor points so the user gets *some* navigation. */
export function extractToc(content: string, _format: 'txt' | 'md'): TocEntry[] {
  // Strategy 1: markdown headings (only meaningful when format='md',
  // but we also try on txt since EPUB→md conversion sometimes leaves
  // those markers in.)
  const md = findMarkdownHeadings(content);
  if (md.length >= 2) return md;

  // Strategy 2: 中文章节 — 第X章 / 节 / 回 / 卷 / 部 / 篇 / 序 / 楔子 / 尾声.
  const cn = findChineseChapters(content);
  if (cn.length >= 2) return cn;

  // Strategy 3: English chapters — "Chapter 1", "CHAPTER 1", "Part I" etc.
  const en = findEnglishChapters(content);
  if (en.length >= 2) return en;

  // Strategy 3b: horizontal-rule split — when EPUB→md conversion used
  // `\n\n---\n\n` as chapter joiners (no semantic <h*> survived), each
  // segment between rules is one chapter.
  const hr = findHorizontalRuleChapters(content);
  if (hr.length >= 2) return hr;

  // Strategy 4: setext headings — line followed by ===/--- (md books).
  const setext = findSetextHeadings(content);
  if (setext.length >= 2) return setext;

  // Strategy 5: numbered sections like "1. Title" / "1.1 Title" alone
  // on a line (academic books often).
  const numbered = findNumberedSections(content);
  if (numbered.length >= 2) return numbered;

  // Strategy 6: take whichever single-strategy match returned 1 item
  // (better than nothing).
  const single = md.length ? md : cn.length ? cn : en.length ? en : setext.length ? setext : numbered;
  if (single.length >= 1) return single;

  // Fallback: virtual anchors every ~10% of the book.
  return virtualChapters(content);
}

/** Strip residual markdown emphasis / code markers from extracted
 *  chapter titles. EPUB→md conversion leaves `**bold**` / `*em*` /
 *  backticks around what should be plain text. */
function cleanTitle(s: string): string {
  return s
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
    .replace(/(^|[^\*])\*([^\s\*][^\*]*?)\*(?!\*)/g, '$1$2')
    .replace(/__([\s\S]+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[\s\*_~`#>\-—–]+/, '')
    .replace(/[\s\*_~`]+$/, '')
    .trim();
}

function findMarkdownHeadings(content: string): TocEntry[] {
  const out: TocEntry[] = [];
  const lines = content.split('\n');
  let offset = 0;
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m) {
      out.push({
        title: cleanTitle(m[2]),
        position: offset,
        level: m[1].length,
      });
    }
    offset += line.length + 1;
  }
  return out;
}

function findChineseChapters(content: string): TocEntry[] {
  const out: TocEntry[] = [];
  // 多字符头优先（部分 > 部, 章 > 节）—— 否则"第一部分"会被切成
  // "第一部" + 尾部 " 分 …"。 序 必须是 序章/序言/序幕/序曲 等复合
  // 形态，单独的 序 会误伤"序列主义 / 序章句"之类的正文起行。
  const re = new RegExp(
    String.raw`^[\t 　]*(` +
      String.raw`(?:第\s*[一二三四五六七八九十百千零〇0-9０-９]+\s*` +
      String.raw`(?:部分|章|节|回|卷|部|篇))` +
      String.raw`|(?:序[章言幕曲]|楔子|引子|尾声|终章|开篇|终篇|后记|前言|结语)` +
      String.raw`)([^\n]*)$`,
    'gm',
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const head = m[1].trim();
    const tail = cleanTitle(m[2]);
    const title = tail ? `${head}　${tail}` : head;
    const level =
      /部分|[部篇卷]/.test(head) ? 1 : /[章]/.test(head) ? 2 : 3;
    out.push({ title, position: m.index, level });
  }
  return out;
}

function findEnglishChapters(content: string): TocEntry[] {
  const out: TocEntry[] = [];
  // Chapter / CHAPTER / Part / PART followed by a roman or arabic
  // numeral, optionally with a title.
  const re =
    /^[\t ]*(?:(Chapter|CHAPTER|Part|PART|Book|BOOK|Section|SECTION)\s+(\d+|[IVXLCDM]+)(?:[:.\s—–-]+([^\n]+))?)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const kind = m[1];
    const num = m[2];
    const tail = cleanTitle(m[3] ?? '');
    const title = tail ? `${kind} ${num}: ${tail}` : `${kind} ${num}`;
    const level = /^(Part|PART|Book|BOOK)$/.test(kind) ? 1 : 2;
    out.push({ title, position: m.index, level });
  }
  return out;
}

/** Each chunk between `\n\n---\n\n` separators becomes a chapter. Title
 *  is the first non-blank line of the chunk if it's short enough,
 *  otherwise "章节 N". Useful for EPUBs that were imported with the old
 *  parser (rule-joined, no headings). */
function findHorizontalRuleChapters(content: string): TocEntry[] {
  const re = /\n\n---\n\n/g;
  const positions: number[] = [0];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    positions.push(m.index + m[0].length);
  }
  if (positions.length < 3) return [];
  return positions.map((pos, i) => {
    let title = `章节 ${i + 1}`;
    // Look at first non-empty line within first 200 chars of the chunk.
    const window = content.slice(pos, pos + 200);
    for (const raw of window.split('\n')) {
      const line = cleanTitle(raw);
      if (line.length > 0 && line.length < 80) {
        title = line;
        break;
      }
    }
    return { title, position: pos, level: 1 };
  });
}

function findSetextHeadings(content: string): TocEntry[] {
  const out: TocEntry[] = [];
  const lines = content.split('\n');
  let offset = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    const text = cleanTitle(line);
    if (text.length > 0 && text.length < 80) {
      if (/^={3,}\s*$/.test(next)) {
        out.push({ title: text, position: offset, level: 1 });
      } else if (/^-{3,}\s*$/.test(next)) {
        out.push({ title: text, position: offset, level: 2 });
      }
    }
    offset += line.length + 1;
  }
  return out;
}

function findNumberedSections(content: string): TocEntry[] {
  const out: TocEntry[] = [];
  // Match lines like "1. Title", "1.1 Title", "1.2.3 Title", "1 Title"
  // standing alone on a line, where Title is non-trivial.
  const re = /^[\t ]*(\d+(?:\.\d+)*)\.?\s+([^\n]{2,80})$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const num = m[1];
    const title = `${num} ${cleanTitle(m[2])}`;
    const level = Math.min(6, num.split('.').length);
    out.push({ title, position: m.index, level });
  }
  // Filter out spurious matches inside paragraphs: keep only entries
  // that are preceded by a blank line (so the "1. xxx" really stands
  // as a heading, not as the start of a numbered list inside text).
  const filtered = out.filter((entry) => {
    const before = content.slice(Math.max(0, entry.position - 2), entry.position);
    return before === '\n\n' || entry.position === 0 || before.endsWith('\n');
  });
  return filtered.length >= 2 ? filtered : [];
}

function virtualChapters(content: string): TocEntry[] {
  const total = content.length;
  if (total < 4000) return [];
  const out: TocEntry[] = [];
  const segments = 10;
  for (let i = 0; i < segments; i++) {
    const pos = Math.floor((total / segments) * i);
    out.push({
      title: `段 ${i + 1} (${Math.round((i / segments) * 100)}%)`,
      position: pos,
      level: 1,
    });
  }
  return out;
}

/** Re-derive TOC if it's empty or looks suspicious (cached version from
 *  an older extractor — fewer entries than the new multi-strategy
 *  detector finds). Idempotent. */
export async function ensureToc(book: Book): Promise<TocEntry[]> {
  const fresh = extractToc(book.content, book.format);
  const cached = book.toc ?? [];
  // Use fresh if cache is empty OR if fresh finds noticeably more.
  if (cached.length === 0 || fresh.length > cached.length) {
    await db.books.update(book.id, { toc: fresh });
    return fresh;
  }
  return cached;
}

// ─── Bookmarks ────────────────────────────────────────────────────

export async function addBookmark(args: {
  bookId: string;
  position: number;
  snippet: string;
  note?: string;
}): Promise<Bookmark> {
  const bm: Bookmark = {
    id: newId(),
    bookId: args.bookId,
    position: args.position,
    snippet: args.snippet.slice(0, 80),
    note: args.note?.trim() || undefined,
    createdAt: Date.now(),
  };
  await db.bookmarks.add(bm);
  return bm;
}

export async function deleteBookmark(id: string): Promise<void> {
  await db.bookmarks.delete(id);
}

export async function updateBookmarkNote(
  id: string,
  note: string,
): Promise<void> {
  await db.bookmarks.update(id, { note: note.trim() || undefined });
}

export async function deleteBook(id: string): Promise<void> {
  const book = await db.books.get(id);
  if (!book) return;
  await db.transaction(
    'rw',
    db.books,
    db.conversations,
    db.messages,
    db.bookmarks,
    async () => {
      // Delete the linked conversation (if any) along with the book.
      if (book.conversationId) {
        await db.messages.where({ conversationId: book.conversationId }).delete();
        await db.conversations.delete(book.conversationId);
      }
      await db.bookmarks.where({ bookId: id }).delete();
      await db.books.delete(id);
    },
  );
}

export async function getBookConversation(book: Book): Promise<Conversation> {
  if (book.conversationId) {
    const existing = await db.conversations.get(book.conversationId);
    if (existing) return existing;
  }
  const conv = await createConversation({
    title: book.title,
  });
  await db.conversations.update(conv.id, { bookId: book.id });
  await db.books.update(book.id, {
    conversationId: conv.id,
    updatedAt: Date.now(),
  });
  return { ...conv, bookId: book.id };
}

export async function updateReadingPosition(
  bookId: string,
  position: number,
): Promise<void> {
  await db.books.update(bookId, {
    lastPosition: Math.max(0, position),
    updatedAt: Date.now(),
  });
}

/** Extract ~400 chars on either side of an anchor position. */
export function extractExcerpt(
  content: string,
  position: number,
  windowSize = 400,
): string {
  const start = Math.max(0, position - windowSize);
  const end = Math.min(content.length, position + windowSize);
  let slice = content.slice(start, end).trim();
  if (start > 0) slice = '…' + slice;
  if (end < content.length) slice = slice + '…';
  return slice;
}

/**
 * Extract the last `maxChars` characters of text UP TO (not past) the
 * current reading position — the "already-read" window.
 *
 * Used for the spoiler-safe co-reading context: we give the AI everything
 * the user has already read (capped to avoid bloating the prompt) so it can
 * engage with the real text, while never seeing content beyond the bookmark.
 */
export function extractReadSoFar(
  content: string,
  position: number,
  maxChars = 3000,
): string {
  const clampedPos = Math.max(0, Math.min(content.length, position));
  const start = Math.max(0, clampedPos - maxChars);
  let slice = content.slice(start, clampedPos).trim();
  if (start > 0) slice = '…' + slice;
  return slice;
}

/**
 * Return bookmarks for a book that fall within the already-read portion
 * (position ≤ readPosition), sorted newest-first, capped to `limit`.
 * Used to inject margin notes into the co-reading AI context.
 */
export async function getMarginNotesForContext(
  bookId: string,
  readPosition: number,
  limit = 8,
): Promise<Bookmark[]> {
  const all = await db.bookmarks
    .where({ bookId })
    .filter((bm) => bm.position <= readPosition)
    .reverse()
    .sortBy('position');
  return all.slice(0, limit);
}

function guessFormat(title: string, content: string): 'txt' | 'md' {
  if (/\.md$/i.test(title)) return 'md';
  // Heuristic: lots of markdown-style headers.
  const lines = content.split('\n').slice(0, 100);
  const mdish = lines.filter((l) => /^#{1,6}\s/.test(l) || /^[-*]\s/.test(l));
  if (mdish.length > 3) return 'md';
  return 'txt';
}
