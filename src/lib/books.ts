import { db } from '../db';
import type { Book, Conversation } from '../types';
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
  const book: Book = {
    id: newId(),
    title: input.title.trim() || '未命名',
    author: input.author?.trim() || undefined,
    content: input.content,
    format: input.format ?? guessFormat(input.title, input.content),
    totalChars: input.content.length,
    lastPosition: 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.books.add(book);
  return book;
}

export async function deleteBook(id: string): Promise<void> {
  const book = await db.books.get(id);
  if (!book) return;
  await db.transaction(
    'rw',
    db.books,
    db.conversations,
    db.messages,
    async () => {
      // Delete the linked conversation (if any) along with the book.
      if (book.conversationId) {
        await db.messages.where({ conversationId: book.conversationId }).delete();
        await db.conversations.delete(book.conversationId);
      }
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
