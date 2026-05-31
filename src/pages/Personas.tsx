import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { db } from '../db';
import type { Persona } from '../types';
import { newId } from '../lib/id';

const COLORS = [
  '#B8A3CC',
  '#7c69a0',
  '#9CCFBC',
  '#5e9d87',
  '#E8B4BC',
  '#D4A574',
  '#7AB8D8',
];

export default function PersonasPage() {
  const personas = useLiveQuery(
    () => db.personas.orderBy('createdAt').toArray(),
    [],
    [],
  );
  const [editing, setEditing] = useState<Persona | null>(null);
  const [creating, setCreating] = useState(false);

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
        <h2 className="endpoint-card-title">设置 · Personas</h2>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-6 md:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-ink-500">
              人格 = 注入到每条对话开头的 system prompt。<br />
              内置人格可以编辑但不能删除。
            </p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="btn-primary flex items-center gap-1.5"
            >
              <Plus size={16} />
              新人格
            </button>
          </div>

          <ul className="flex flex-col gap-3">
            {personas?.map((p) => (
              <li key={p.id}>
                <PersonaCard persona={p} onEdit={() => setEditing(p)} />
              </li>
            ))}
          </ul>

          {(creating || editing) && (
            <PersonaEditor
              persona={editing}
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

function PersonaCard({ persona, onEdit }: { persona: Persona; onEdit: () => void }) {
  async function handleDelete() {
    if (!confirm(`删除人格"${persona.name}"？`)) return;
    await db.personas.delete(persona.id);
  }

  const preview = persona.systemPrompt
    .split('\n')
    .find((l) => l.trim() && !l.startsWith('#'))
    ?.trim();

  return (
    <div className="endpoint-card !mt-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white"
            style={{ background: persona.color }}
          >
            {persona.avatar}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold text-ink-900">
                {persona.name}
              </h3>
              {persona.builtin && (
                <span className="tag-anthropic">
                  内置
                </span>
              )}
            </div>
            {preview && (
              <p className="mt-1 line-clamp-2 text-xs text-ink-500">{preview}</p>
            )}
            {persona.notes && (
              <p className="mt-1 text-xs italic text-ink-500/70">
                {persona.notes}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="icon-btn"
            aria-label="编辑"
          >
            <Pencil size={16} />
          </button>
          {!persona.builtin && (
            <button
              type="button"
              onClick={handleDelete}
              className="icon-btn danger"
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

function PersonaEditor({
  persona,
  onClose,
}: {
  persona: Persona | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(persona?.name ?? '');
  const [avatar, setAvatar] = useState(persona?.avatar ?? '✨');
  const [color, setColor] = useState(persona?.color ?? COLORS[0]);
  const [systemPrompt, setSystemPrompt] = useState(persona?.systemPrompt ?? '');
  const [notes, setNotes] = useState(persona?.notes ?? '');

  async function handleSave() {
    if (!name.trim()) {
      alert('名字不能空');
      return;
    }
    const now = Date.now();
    await db.personas.put({
      id: persona?.id ?? newId(),
      name: name.trim(),
      avatar: avatar.trim().slice(0, 2) || '✨',
      color,
      systemPrompt,
      notes: notes.trim() || undefined,
      builtin: persona?.builtin,
      createdAt: persona?.createdAt ?? now,
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
          {persona ? '编辑人格' : '新建人格'}
        </h3>

        <div className="mt-4 flex flex-col gap-3 text-sm">
          <div className="flex gap-3">
            <label className="flex w-20 flex-col gap-1">
              <span className="text-xs font-medium text-ink-500">头像</span>
              <input
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                maxLength={2}
                className="rounded-lg border border-lavender-200 bg-white px-3 py-2 text-center text-lg focus:border-lavender-300"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-ink-500">名字</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="比如：理理酱"
                className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
              />
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-500">颜色</span>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full border-2 transition ${
                    c === color ? 'border-ink-900 scale-110' : 'border-transparent'
                  }`}
                  style={{ background: c }}
                  aria-label={`选 ${c}`}
                />
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-500">
              System Prompt
            </span>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={14}
              placeholder="她希望你是怎样的人……"
              className="resize-y rounded-lg border border-lavender-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed focus:border-lavender-300"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-500">
              备注（不会发给模型）
            </span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="你想记一下这个人格的来源、用途之类的"
              className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
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
