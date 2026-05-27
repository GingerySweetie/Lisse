import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { ChevronLeft, Pencil, Plus, Trash2, Wand2 } from 'lucide-react';
import { db } from '../db';
import type { WritingStyle } from '../types';
import { newId } from '../lib/id';

export default function StylesPage() {
  const styles = useLiveQuery(
    () => db.writingStyles.orderBy('createdAt').toArray(),
    [],
    [],
  );
  const [editing, setEditing] = useState<WritingStyle | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center gap-3 border-b border-lavender-200 bg-white/60 px-3 py-3 pl-14 backdrop-blur md:px-6 md:pl-6">
        <Link
          to="/chat"
          className="hidden items-center gap-1 rounded-lg px-2 py-1 text-sm text-ink-500 transition hover:bg-lavender-50 md:inline-flex"
        >
          <ChevronLeft size={16} />
          返回
        </Link>
        <h2 className="serif-title text-lg">设置 · 写作风格</h2>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-6 md:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-ink-500">
              风格独立于人格，叠加在 system prompt 末尾。<br />
              比如同一个理理酱可以套上"简洁 / 文学 / 代码"模式。
            </p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 rounded-lg bg-lavender-200 px-3 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-300"
            >
              <Plus size={16} />
              新风格
            </button>
          </div>

          <ul className="flex flex-col gap-3">
            {styles?.map((s) => (
              <li key={s.id}>
                <StyleCard style={s} onEdit={() => setEditing(s)} />
              </li>
            ))}
          </ul>

          {(creating || editing) && (
            <StyleEditor
              style={editing}
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

function StyleCard({
  style,
  onEdit,
}: {
  style: WritingStyle;
  onEdit: () => void;
}) {
  async function handleDelete() {
    if (!confirm(`删除风格"${style.name}"？`)) return;
    await db.writingStyles.delete(style.id);
  }
  const preview = style.prompt
    .split('\n')
    .find((l) => l.trim() && !l.startsWith('#'))
    ?.trim();

  return (
    <div className="rounded-2xl border border-lavender-200 bg-white/80 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lavender-100 text-lavender-600">
            <Wand2 size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold text-ink-900">
                {style.name}
              </h3>
              {style.builtin && (
                <span className="rounded bg-lavender-100 px-1.5 py-0.5 text-xs text-lavender-600">
                  内置
                </span>
              )}
            </div>
            {style.description && (
              <p className="mt-0.5 text-xs text-ink-500">{style.description}</p>
            )}
            {!style.description && preview && (
              <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">
                {preview}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg p-2 text-ink-500 transition hover:bg-lavender-50 hover:text-ink-900"
            aria-label="编辑"
          >
            <Pencil size={16} />
          </button>
          {!style.builtin && (
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg p-2 text-ink-500 transition hover:bg-rose-50 hover:text-rose-500"
              aria-label="删除"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StyleEditor({
  style,
  onClose,
}: {
  style: WritingStyle | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(style?.name ?? '');
  const [description, setDescription] = useState(style?.description ?? '');
  const [prompt, setPrompt] = useState(style?.prompt ?? '');

  async function handleSave() {
    if (!name.trim()) {
      alert('名字不能空');
      return;
    }
    const now = Date.now();
    await db.writingStyles.put({
      id: style?.id ?? newId(),
      name: name.trim(),
      description: description.trim() || undefined,
      prompt,
      builtin: style?.builtin,
      createdAt: style?.createdAt ?? now,
      updatedAt: now,
    });
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
          {style ? '编辑风格' : '新建风格'}
        </h3>

        <div className="mt-4 flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-500">名字</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="比如：极简 / 学术 / 邮件草稿"
              className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-500">
              描述（一行话提醒你这个风格在做什么）
            </span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可空"
              className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-500">
              Prompt（追加到 system 末尾）
            </span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={12}
              placeholder="你的回复尽量简短直接……"
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
