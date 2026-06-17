import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, Plus, Trash2, Edit3 } from 'lucide-react';
import { db, getSettings } from '../db';
import { newId } from '../lib/id';
import InAppBrowser from '../lib/native/in-app-browser';
import type { BrowserBookmark, BrowserScript } from '../types';

/**
 * Browser home — a grid of bookmark tiles. Tapping a tile opens the
 * native in-app browser activity. Scripts management lives at
 * /browser/scripts.
 */

export default function BrowserPage() {
  const bookmarks = useLiveQuery(
    () => db.browserBookmarks.orderBy('position').toArray(),
    [],
    [],
  );
  const [editing, setEditing] = useState<BrowserBookmark | null>(null);
  const [creating, setCreating] = useState(false);

  async function openBookmark(b: BrowserBookmark) {
    const [settings, scripts] = await Promise.all([
      getSettings(),
      db.browserScripts.toArray(),
    ]);
    const autoInjects = scripts
      .filter((s) => s.autoRun && matchesUrl(b.url, s.urlPattern))
      .map((s) => ({ pattern: s.urlPattern ?? '', code: s.code }));
    const savedScripts = scripts.map((s) => ({ name: s.name, code: s.code }));
    try {
      await InAppBrowser.open({
        url: b.url,
        userAgent: settings.browserUserAgent ?? undefined,
        autoInjects,
        savedScripts,
      });
    } catch (e) {
      alert('打不开：' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleDelete(b: BrowserBookmark) {
    if (!confirm(`删掉书签「${b.name}」？`)) return;
    await db.browserBookmarks.delete(b.id);
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="topbar flex items-center gap-3 px-3 py-3 md:px-6">
        <Link
          to="/home"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-ink-500 transition hover:bg-lavender-50"
        >
          <ChevronLeft size={16} />
          玄関
        </Link>
        <h2 className="endpoint-card-title">浏览器</h2>
        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/browser/scripts"
            className="rounded-md border border-lavender-200 px-3 py-1 text-xs text-ink-700 transition hover:bg-lavender-50"
          >
            脚本
          </Link>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-6 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          <p className="text-sm text-ink-500 leading-relaxed">
            自己的 WebView 实例，cookie 持久，切后台再回来不重连。
            <br />
            按域名自动注入的 bookmarklet 在「脚本」里配。
          </p>

          <UaSection />

          <section className="endpoint-card !mt-0">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-ink-700">书签</h3>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="btn-primary flex items-center gap-1.5"
              >
                <Plus size={14} />
                新书签
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {(bookmarks ?? []).map((b) => (
                <BookmarkTile
                  key={b.id}
                  bookmark={b}
                  onOpen={() => void openBookmark(b)}
                  onEdit={() => setEditing(b)}
                  onDelete={() => void handleDelete(b)}
                />
              ))}
            </div>
          </section>

          {(creating || editing) && (
            <BookmarkEditor
              bookmark={editing}
              onClose={() => {
                setCreating(false);
                setEditing(null);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function matchesUrl(url: string, pattern?: string): boolean {
  if (!pattern || pattern.length === 0) return true;
  return url.toLowerCase().includes(pattern.toLowerCase());
}

function BookmarkTile({
  bookmark,
  onOpen,
  onEdit,
  onDelete,
}: {
  bookmark: BrowserBookmark;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-lavender-100 to-lavender-200 text-2xl font-medium text-ink-700 shadow-sm transition hover:shadow-md"
        style={{ fontFamily: "'Cormorant Garamond', serif" }}
      >
        {bookmark.glyph ?? bookmark.name.charAt(0)}
      </button>
      <span className="max-w-[5rem] truncate text-xs text-ink-700">
        {bookmark.name}
      </span>
      <div className="absolute right-0 top-0 hidden group-hover:flex pointer-coarse:flex">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-full bg-white/85 p-1 text-ink-500 shadow ring-1 ring-lavender-100"
          aria-label="编辑"
        >
          <Edit3 size={12} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="ml-1 rounded-full bg-white/85 p-1 text-rose-500 shadow ring-1 ring-rose-100"
          aria-label="删除"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function BookmarkEditor({
  bookmark,
  onClose,
}: {
  bookmark: BrowserBookmark | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(bookmark?.name ?? '');
  const [url, setUrl] = useState(bookmark?.url ?? '');
  const [glyph, setGlyph] = useState(bookmark?.glyph ?? '');

  async function handleSave() {
    if (!name.trim() || !url.trim()) {
      alert('名字和 URL 都不能空');
      return;
    }
    const finalUrl = /^https?:\/\//i.test(url.trim())
      ? url.trim()
      : `https://${url.trim()}`;
    const now = Date.now();
    if (bookmark) {
      await db.browserBookmarks.update(bookmark.id, {
        name: name.trim(),
        url: finalUrl,
        glyph: glyph.trim() || undefined,
        updatedAt: now,
      });
    } else {
      const max = await db.browserBookmarks
        .orderBy('position')
        .reverse()
        .limit(1)
        .first();
      await db.browserBookmarks.add({
        id: newId(),
        name: name.trim(),
        url: finalUrl,
        glyph: glyph.trim() || undefined,
        position: (max?.position ?? -1) + 1,
        createdAt: now,
        updatedAt: now,
      });
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/30 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl rounded-t-2xl bg-white p-5 shadow-xl md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-ink-900">
          {bookmark ? '编辑书签' : '新建书签'}
        </h3>
        <div className="mt-4 flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-500">名字</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Claude"
              className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-500">URL</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://claude.ai"
              className="rounded-lg border border-lavender-200 bg-white px-3 py-2 font-mono text-xs focus:border-lavender-300"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-500">
              图标字（一个字 / emoji，可空）
            </span>
            <input
              value={glyph}
              onChange={(e) => setGlyph(e.target.value)}
              placeholder="C"
              maxLength={2}
              className="rounded-lg border border-lavender-200 bg-white px-3 py-2 text-center text-lg focus:border-lavender-300"
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-lavender-200 px-4 py-2 text-sm text-ink-700 transition hover:bg-lavender-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-lavender-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-300"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36';

function UaSection() {
  const settings = useLiveQuery(() => getSettings(), [], null);
  const [draft, setDraft] = useState<string | null>(null);
  const current = draft ?? settings?.browserUserAgent ?? '';

  async function save(next: string | null) {
    const { saveSettings } = await import('../db');
    await saveSettings({ browserUserAgent: next });
    setDraft(null);
  }

  return (
    <section className="endpoint-card !mt-0">
      <h3 className="mb-1 text-sm font-medium text-ink-700">UA</h3>
      <p className="mb-2 text-xs text-ink-500">
        发给网页的 User-Agent。空就用系统 WebView 默认。
      </p>
      <textarea
        value={current}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={DEFAULT_UA}
        rows={3}
        className="w-full resize-y rounded-lg border border-lavender-200 bg-white px-3 py-2 font-mono text-[11px] leading-relaxed focus:border-lavender-300"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void save(draft?.trim() || null)}
          disabled={draft === null}
          className="rounded-md bg-lavender-200 px-3 py-1 text-xs text-ink-900 transition hover:bg-lavender-300 disabled:opacity-50"
        >
          保存
        </button>
        <button
          type="button"
          onClick={() => setDraft(DEFAULT_UA)}
          className="rounded-md border border-lavender-200 px-3 py-1 text-xs text-ink-700 transition hover:bg-lavender-50"
        >
          填默认 Chrome
        </button>
        <button
          type="button"
          onClick={() => void save(null)}
          className="rounded-md border border-lavender-200 px-3 py-1 text-xs text-ink-700 transition hover:bg-lavender-50"
        >
          清空（用系统默认）
        </button>
      </div>
    </section>
  );
}

export type { BrowserScript };
