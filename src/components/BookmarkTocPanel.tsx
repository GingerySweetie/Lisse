import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, Bookmark as BookmarkIcon, ListTree, Trash2, Plus } from 'lucide-react';
import { db } from '../db';
import {
  addBookmark,
  deleteBookmark,
  ensureToc,
  updateBookmarkNote,
} from '../lib/books';
import { relativeTime } from '../lib/format';
import type { Book, Bookmark, TocEntry } from '../types';

interface Props {
  book: Book;
  /** Char offset of current scroll position — used as the default for
   *  the "新增书签" action. */
  currentPosition: number;
  /** Snippet preview around currentPosition. */
  currentSnippet: string;
  onClose: () => void;
  onJump: (position: number) => void;
}

/**
 * Two-tab drawer for the reader: 目录 (TOC) and 书签 (bookmarks).
 * Pink-accented surface that floats over the reader. Both tabs are
 * scrollable independently. Tap an entry → close drawer + scroll the
 * reader to that char offset (via onJump).
 */
export default function BookmarkTocPanel({
  book,
  currentPosition,
  currentSnippet,
  onClose,
  onJump,
}: Props) {
  const [tab, setTab] = useState<'toc' | 'marks'>('toc');
  const [toc, setToc] = useState<TocEntry[]>(book.toc ?? []);

  // Backfill / refresh TOC. Always run ensureToc — it'll upgrade the
  // cache if the new multi-strategy detector finds more entries than
  // what was stored, otherwise it's a no-op.
  useEffect(() => {
    if (book.toc && book.toc.length > 0) setToc(book.toc);
    ensureToc(book).then((next) => {
      if (next.length > 0) setToc(next);
    });
  }, [book]);

  const bookmarks = useLiveQuery(
    () =>
      db.bookmarks
        .where({ bookId: book.id })
        .reverse()
        .sortBy('createdAt'),
    [book.id],
    [],
  );

  return createPortal(
    <div className="rose-drawer-backdrop" onClick={onClose}>
      <div
        className="rose-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header tabs */}
        <div className="rose-drawer-head">
          <button
            type="button"
            className={`rose-tab ${tab === 'toc' ? 'is-active' : ''}`}
            onClick={() => setTab('toc')}
          >
            <ListTree size={14} /> 目录
          </button>
          <button
            type="button"
            className={`rose-tab ${tab === 'marks' ? 'is-active' : ''}`}
            onClick={() => setTab('marks')}
          >
            <BookmarkIcon size={14} /> 书签
            {bookmarks && bookmarks.length > 0 && (
              <span className="rose-tab-count">{bookmarks.length}</span>
            )}
          </button>
          <button
            type="button"
            className="rose-close"
            onClick={onClose}
            aria-label="关掉"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="rose-drawer-body">
          {tab === 'toc' ? (
            <TocList
              toc={toc}
              currentPosition={currentPosition}
              onJump={(p) => {
                onJump(p);
                onClose();
              }}
            />
          ) : (
            <BookmarksList
              bookmarks={bookmarks ?? []}
              onJump={(p) => {
                onJump(p);
                onClose();
              }}
            />
          )}
        </div>

        {/* Footer */}
        {tab === 'marks' && (
          <AddBookmarkBar
            bookId={book.id}
            position={currentPosition}
            snippet={currentSnippet}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

// ─── TOC tab ──────────────────────────────────────────────────────

function TocList({
  toc,
  currentPosition,
  onJump,
}: {
  toc: TocEntry[];
  currentPosition: number;
  onJump: (p: number) => void;
}) {
  if (toc.length === 0) {
    return (
      <div className="rose-empty">
        这本书没有可识别的章节标题。Markdown 用 `# 标题` 标章；
        TXT 用 "第X章 / 第X节" 起行。
      </div>
    );
  }
  // Determine which entry is "current" — the last one whose position
  // is at or before the reader's scroll position.
  let activeIdx = -1;
  for (let i = 0; i < toc.length; i++) {
    if (toc[i].position <= currentPosition) activeIdx = i;
    else break;
  }
  return (
    <ul className="rose-toc">
      {toc.map((e, i) => (
        <li
          key={i}
          className={`rose-toc-item ${i === activeIdx ? 'is-current' : ''}`}
          style={{ paddingLeft: 16 + (Math.max(1, e.level) - 1) * 14 }}
        >
          <button type="button" onClick={() => onJump(e.position)}>
            {e.title}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ─── Bookmarks tab ─────────────────────────────────────────────────

function BookmarksList({
  bookmarks,
  onJump,
}: {
  bookmarks: Bookmark[];
  onJump: (p: number) => void;
}) {
  if (bookmarks.length === 0) {
    return (
      <div className="rose-empty">
        尚无书签。
        <br />
        <span style={{ opacity: 0.7 }}>底下点「新增书签」记下现在这页。</span>
      </div>
    );
  }
  return (
    <ul className="rose-marks">
      {bookmarks.map((b) => (
        <BookmarkRow key={b.id} bm={b} onJump={onJump} />
      ))}
    </ul>
  );
}

function BookmarkRow({
  bm,
  onJump,
}: {
  bm: Bookmark;
  onJump: (p: number) => void;
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [draft, setDraft] = useState(bm.note ?? '');

  async function saveNote() {
    await updateBookmarkNote(bm.id, draft);
    setEditingNote(false);
  }

  return (
    <li className="rose-mark">
      <button
        type="button"
        className="rose-mark-main"
        onClick={() => onJump(bm.position)}
      >
        <div className="rose-mark-snippet">「{bm.snippet}」</div>
        <div className="rose-mark-meta">{relativeTime(bm.createdAt)}</div>
      </button>
      {editingNote ? (
        <div className="rose-mark-note-edit">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="加个备注……"
            onBlur={() => void saveNote()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveNote();
              if (e.key === 'Escape') setEditingNote(false);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          className="rose-mark-note"
          onClick={() => setEditingNote(true)}
        >
          {bm.note || '+ 备注'}
        </button>
      )}
      <button
        type="button"
        className="rose-mark-del"
        onClick={() => void deleteBookmark(bm.id)}
        aria-label="删除"
      >
        <Trash2 size={13} />
      </button>
    </li>
  );
}

function AddBookmarkBar({
  bookId,
  position,
  snippet,
}: {
  bookId: string;
  position: number;
  snippet: string;
}) {
  const [busy, setBusy] = useState(false);
  async function handleAdd() {
    if (busy) return;
    setBusy(true);
    try {
      await addBookmark({ bookId, position, snippet });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rose-add-bar">
      <button
        type="button"
        className="rose-add-btn"
        onClick={handleAdd}
        disabled={busy}
      >
        <Plus size={14} /> 新增书签（当前位置）
      </button>
    </div>
  );
}
