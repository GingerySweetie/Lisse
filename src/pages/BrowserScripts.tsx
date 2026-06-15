import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, Plus, Trash2, Edit3, Code2 } from 'lucide-react';
import { db } from '../db';
import { newId } from '../lib/id';
import type { BrowserScript } from '../types';

/**
 * Bookmarklet manager. Each script has a name + code (JS); optional
 * urlPattern + autoRun toggle controls automatic injection on
 * matching pages.
 *
 * The native in-app browser side gets the list at open() time:
 *   - autoRun=true scripts whose pattern matches → auto-inject on
 *     onPageFinished
 *   - all scripts → shown in the "</> 注入" menu for manual fire
 */

export default function BrowserScriptsPage() {
  const scripts = useLiveQuery(
    () => db.browserScripts.orderBy('createdAt').toArray(),
    [],
    [],
  );
  const [editing, setEditing] = useState<BrowserScript | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleDelete(s: BrowserScript) {
    if (!confirm(`删掉脚本「${s.name}」？`)) return;
    await db.browserScripts.delete(s.id);
  }

  async function toggleAutoRun(s: BrowserScript) {
    await db.browserScripts.update(s.id, {
      autoRun: !s.autoRun,
      updatedAt: Date.now(),
    });
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="topbar flex items-center gap-3 px-3 py-3 md:px-6">
        <Link
          to="/browser"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-ink-500 transition hover:bg-lavender-50"
        >
          <ChevronLeft size={16} />
          浏览器
        </Link>
        <h2 className="endpoint-card-title">脚本</h2>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-6 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-ink-500 leading-relaxed">
              Bookmarklet 库。打开「自动运行」并填上「URL pattern」就会在
              加载到匹配域名时自动注入；不填 pattern 等于全开。
            </p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="btn-primary flex shrink-0 items-center gap-1.5"
            >
              <Plus size={16} />
              新脚本
            </button>
          </div>

          {(scripts ?? []).length === 0 ? (
            <div className="mt-12 text-center text-sm text-ink-500/70">
              还没有脚本。
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {scripts?.map((s) => (
                <li key={s.id}>
                  <ScriptCard
                    script={s}
                    onEdit={() => setEditing(s)}
                    onDelete={() => void handleDelete(s)}
                    onToggleAutoRun={() => void toggleAutoRun(s)}
                  />
                </li>
              ))}
            </ul>
          )}

          {(creating || editing) && (
            <ScriptEditor
              script={editing}
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

function ScriptCard({
  script,
  onEdit,
  onDelete,
  onToggleAutoRun,
}: {
  script: BrowserScript;
  onEdit: () => void;
  onDelete: () => void;
  onToggleAutoRun: () => void;
}) {
  const preview = script.code
    .split('\n')
    .find((l) => l.trim() && !l.startsWith('//'))
    ?.trim()
    .slice(0, 80);

  return (
    <div className="endpoint-card !mt-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Code2 size={14} className="shrink-0 text-lavender-500" />
            <h3 className="truncate text-base font-semibold text-ink-900">
              {script.name}
            </h3>
            {script.autoRun && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700">
                自动
              </span>
            )}
          </div>
          {script.urlPattern && (
            <div className="mt-0.5 truncate font-mono text-[11px] text-ink-500">
              ↳ {script.urlPattern}
            </div>
          )}
          {preview && (
            <p className="mt-1 line-clamp-2 font-mono text-[11px] text-ink-500">
              {preview}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggleAutoRun}
            className="icon-btn"
            aria-label={script.autoRun ? '关闭自动' : '开启自动'}
            title={script.autoRun ? '关闭自动' : '开启自动'}
          >
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: 5,
                background: script.autoRun ? '#7ab896' : '#c5b8d0',
              }}
            />
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="icon-btn"
            aria-label="编辑"
          >
            <Edit3 size={14} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="icon-btn danger"
            aria-label="删除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ScriptEditor({
  script,
  onClose,
}: {
  script: BrowserScript | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(script?.name ?? '');
  const [code, setCode] = useState(script?.code ?? '');
  const [urlPattern, setUrlPattern] = useState(script?.urlPattern ?? '');
  const [autoRun, setAutoRun] = useState(script?.autoRun ?? false);

  async function handleSave() {
    if (!name.trim() || !code.trim()) {
      alert('名字和代码都不能空');
      return;
    }
    const now = Date.now();
    if (script) {
      await db.browserScripts.update(script.id, {
        name: name.trim(),
        code,
        urlPattern: urlPattern.trim() || undefined,
        autoRun,
        updatedAt: now,
      });
    } else {
      await db.browserScripts.add({
        id: newId(),
        name: name.trim(),
        code,
        urlPattern: urlPattern.trim() || undefined,
        autoRun,
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
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-ink-900">
          {script ? '编辑脚本' : '新建脚本'}
        </h3>
        <div className="mt-4 flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-500">名字</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="隐藏 style block"
              className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-500">
              URL pattern（子串匹配，可空 = 全部）
            </span>
            <input
              value={urlPattern}
              onChange={(e) => setUrlPattern(e.target.value)}
              placeholder="claude.ai"
              className="rounded-lg border border-lavender-200 bg-white px-3 py-2 font-mono text-xs focus:border-lavender-300"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-700">
            <input
              type="checkbox"
              checked={autoRun}
              onChange={(e) => setAutoRun(e.target.checked)}
            />
            自动运行（每次页面加载完匹配的 URL 时注入）
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-500">
              代码（JS；开头的 javascript: 自动剥）
            </span>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              rows={12}
              placeholder="document.querySelectorAll('…').forEach(el => el.style.display='none');"
              className="resize-y rounded-lg border border-lavender-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed focus:border-lavender-300"
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
