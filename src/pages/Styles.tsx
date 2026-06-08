import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { ChevronLeft, Plus, Save, Trash2 } from 'lucide-react';
import { db, getSettings, saveSettings } from '../db';
import type { WritingStyle } from '../types';
import { newId } from '../lib/id';

export default function StylesPage() {
  const styles = useLiveQuery(
    () => db.writingStyles.orderBy('createdAt').toArray(),
    [],
    [],
  );
  const settings = useLiveQuery(() => getSettings(), [], null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [dirty, setDirty] = useState(false);

  // Pick which style the panel shows: prefer the global default; else first.
  useEffect(() => {
    if (!styles || styles.length === 0) return;
    if (activeId && styles.some((s) => s.id === activeId)) return;
    const fallback = settings?.defaultStyleId ?? styles[0].id;
    setActiveId(fallback);
  }, [styles, settings, activeId]);

  // Sync editor fields when the active style changes (and we're not mid-edit).
  useEffect(() => {
    if (!styles || !activeId) return;
    const s = styles.find((x) => x.id === activeId);
    if (!s) return;
    setName(s.name);
    setPrompt(s.prompt);
    setDirty(false);
  }, [activeId, styles]);

  const active = styles?.find((s) => s.id === activeId) ?? null;

  async function handleUseStyleChange(id: string) {
    setActiveId(id);
    await saveSettings({ defaultStyleId: id });
  }

  async function handleNew() {
    const now = Date.now();
    const id = newId();
    const fresh: WritingStyle = {
      id,
      name: '新风格',
      prompt: '',
      createdAt: now,
      updatedAt: now,
    };
    await db.writingStyles.put(fresh);
    setActiveId(id);
  }

  async function handleSave() {
    if (!active) return;
    if (!name.trim()) {
      alert('Title 不能空');
      return;
    }
    await db.writingStyles.update(active.id, {
      name: name.trim(),
      prompt,
      updatedAt: Date.now(),
    });
    setDirty(false);
  }

  async function handleDelete() {
    if (!active) return;
    if (active.builtin) {
      alert('内置风格不可删除。');
      return;
    }
    if (!confirm(`删除风格"${active.name}"？`)) return;
    const remaining = (styles ?? []).filter((s) => s.id !== active.id);
    await db.writingStyles.delete(active.id);
    const next = remaining[0]?.id ?? null;
    setActiveId(next);
    if (settings?.defaultStyleId === active.id) {
      await saveSettings({ defaultStyleId: next });
    }
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="topbar flex items-center gap-3 px-3 py-3 pl-14 md:px-6 md:pl-6">
        <Link
          to="/chat"
          className="hidden items-center gap-1 rounded-lg px-2 py-1 text-sm text-ink-500 transition hover:bg-lavender-50 md:inline-flex"
        >
          <ChevronLeft size={16} />
          返回
        </Link>
        <h2 className="endpoint-card-title">设置 · 写作风格</h2>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-6 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          <p className="text-sm text-ink-500">
            Style 在每轮对话里追加在你最新消息之后发给小机，
            位置最靠近模型的注意力，优先级最高。
            <br />
            前端改完保存即生效，下一条消息就会带上新内容。
          </p>

          <section className="endpoint-card !mt-0 flex flex-col gap-4">
            {/* UseStyle */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-500">
                UseStyle · 当前使用
              </span>
              <select
                value={activeId ?? ''}
                onChange={(e) => handleUseStyleChange(e.target.value)}
                className="rounded-lg border border-lavender-200 bg-white px-3 py-2 text-sm text-ink-700 focus:border-lavender-300"
              >
                {styles?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.builtin ? ' · 内置' : ''}
                  </option>
                ))}
              </select>
            </label>

            {/* Title */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-500">Title</span>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setDirty(true);
                }}
                placeholder="风格名"
                disabled={!active}
                className="rounded-lg border border-lavender-200 bg-white px-3 py-2 text-sm focus:border-lavender-300 disabled:opacity-50"
              />
            </label>

            {/* Content */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-500">Content</span>
              <textarea
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setDirty(true);
                }}
                rows={12}
                placeholder="写给小机看的风格指令……"
                disabled={!active}
                className="resize-y rounded-lg border border-lavender-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed focus:border-lavender-300 disabled:opacity-50"
              />
            </label>

            {/* Actions: New / Save / Delete */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleNew}
                className="btn-primary flex items-center gap-1.5"
              >
                <Plus size={16} />
                New
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!active || !dirty}
                className="flex items-center gap-1.5 rounded-lg bg-lavender-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save size={16} />
                Save
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!active || active.builtin}
                className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-4 py-2 text-sm text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 size={16} />
                Delete
              </button>
              {active?.builtin && (
                <span className="text-xs text-ink-400">
                  内置风格可编辑，但不可删除。
                </span>
              )}
              {dirty && (
                <span className="text-xs text-amber-600">未保存</span>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
