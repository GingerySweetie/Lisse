import { db } from '../db';
import type { Book, Bookmark, Conversation, TocEntry } from '../types';
import { newId } from './id';
import { createConversation } from './chat';

export interface NewBookInput {
  title: string;
  author?: string;
  content: string;
  format?: 'txt' | 'md';
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
    toc: extractToc(input.content, format),
    createdAt: now,
    updatedAt: now,
  };
  await db.books.add(book);
  return book;
}

/** Extract a flat TOC from book content. md: walk `#` headings. txt:
 *  look for `第X章 / 第X节 / 第X回` markers. Returns char-offset based
 *  entries so the reader can scroll directly. */
export function extractToc(content: string, format: 'txt' | 'md'): TocEntry[] {
  const out: TocEntry[] = [];
  if (format === 'md') {
    const lines = content.split('\n');
    let offset = 0;
    for (const line of lines) {
      const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
      if (m) {
        out.push({
          title: m[2].trim(),
          position: offset,
          level: m[1].length,
        });
      }
      offset += line.length + 1;
    }
    return out;
  }
  // TXT 章节启发: 行首 "第X章/节/回/卷/部" 等
  const re =
    /^[\t ]*(第\s*[一二三四五六七八九十百千零〇0-9０-９]+\s*[章节回卷部篇])(.*)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const head = m[1].trim();
    const tail = m[2].trim();
    const title = tail ? `${head}　${tail}` : head;
    out.push({
      title,
      position: m.index,
      level: head.includes('部') || head.includes('卷') ? 1 : 2,
    });
  }
  return out;
}

/** Backfill: re-derive TOC for a book that was created before the TOC
 *  field existed. Idempotent — overwrites whatever's stored. */
export async function ensureToc(book: Book): Promise<TocEntry[]> {
  const toc = extractToc(book.content, book.format);
  if (toc.length > 0) {
    await db.books.update(book.id, { toc });
  }
  return toc;
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

function guessFormat(title: string, content: string): 'txt' | 'md' {
  if (/\.md$/i.test(title)) return 'md';
  // Heuristic: lots of markdown-style headers.
  const lines = content.split('\n').slice(0, 100);
  const mdish = lines.filter((l) => /^#{1,6}\s/.test(l) || /^[-*]\s/.test(l));
  if (mdish.length > 3) return 'md';
  return 'txt';
}
