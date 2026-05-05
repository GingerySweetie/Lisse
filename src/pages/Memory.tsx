import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  Pin,
  PinOff,
  Trash2,
  Archive,
  ArchiveRestore,
  Search,
  Pencil,
  Save,
  X,
} from 'lucide-react';
import { db, getSettings, saveSettings } from '../db';
import { embed } from '../api/embedding';
import type { FactCategory, MemoryFact } from '../types';
import { newId } from '../lib/id';
import { relativeTime } from '../lib/format';

const CATEGORY_LABEL: Record<FactCategory, string> = {
  user_fact: '事实',
  preference: '偏好',
  relationship: '关系',
  event: '事件',
  context: '语境',
  other: '其他',
};

const CATEGORY_COLOR: Record<FactCategory, string> = {
  user_fact: 'bg-lavender-100 text-lavender-600',
  preference: 'bg-mint-100 text-mint-500',
  relationship: 'bg-rose-100 text-rose-500',
  event: 'bg-amber-100 text-amber-600',
  context: 'bg-sky-100 text-sky-600',
  other: 'bg-ink-100 text-ink-500',
};

export default function MemoryPage() {
  const personas = useLiveQuery(() => db.personas.toArray(), [], []);
  const settings = useLiveQuery(() => getSettings(), [], null);

  const [personaId, setPersonaId] = useState<string | null>(null);
  useEffect(() => {
    if (!personaId && personas && personas.length > 0) {
      setPersonaId(settings?.defaultPersonaId ?? personas[0].id);
    }
  }, [personaId, personas, settings]);

  const facts = useLiveQuery(
    () =>
      personaId
        ? db.memoryFacts.where({ personaId }).reverse().sortBy('createdAt')
        : [],
    [personaId],
    [],
  );

  const [filter, setFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    if (!facts) return [];
    let out = facts;
    if (!showArchived) out = out.filter((f) => !f.archived);
    const q = filter.trim().toLowerCase();
    if (q) out = out.filter((f) => f.text.toLowerCase().includes(q));
    return out;
  }, [facts, filter, showArchived]);

  const stats = useMemo(() => {
    if (!facts) return { total: 0, pinned: 0, archived: 0 };
    return {
      total: facts.length,
      pinned: facts.filter((f) => f.pinned).length,
      archived: facts.filter((f) => f.archived).length,
    };
  }, [facts]);

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
        <h2 className="text-base font-semibold text-ink-900">记忆</h2>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-4 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {/* Persona switcher + stats */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-lavender-200 bg-white/80 p-3">
            <div className="flex items-center gap-2 text-sm">
              <label className="text-xs font-medium text-ink-500">人格</label>
              <select
                value={personaId ?? ''}
                onChange={(e) => setPersonaId(e.target.value || null)}
                className="rounded-lg border border-lavender-200 bg-white px-2 py-1.5 focus:border-mint-300"
              >
                {personas?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.avatar} {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3 text-xs text-ink-500">
              <span>共 {stats.total}</span>
              <span>📌 {stats.pinned}</span>
              <span>📦 {stats.archived}</span>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="rounded-lg bg-mint-200 px-2 py-1 text-xs font-medium text-ink-900 hover:bg-mint-300"
              >
                + 手工添加
              </button>
            </div>
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2 rounded-2xl border border-lavender-200 bg-white/80 px-3 py-2">
            <Search size={16} className="text-ink-500" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="搜索记忆……"
              className="flex-1 bg-transparent py-1 text-sm text-ink-900 placeholder:text-ink-500/70 focus:outline-none"
            />
            <label className="flex items-center gap-1 text-xs text-ink-500">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              显示归档
            </label>
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <EmptyMemory hasAny={stats.total > 0} />
          ) : (
            <ul className="flex flex-col gap-2">
              {filtered.map((f) => (
                <li key={f.id}>
                  <FactCard fact={f} />
                </li>
              ))}
            </ul>
          )}

          {creating && personaId && (
            <ManualAddDialog
              personaId={personaId}
              onClose={() => setCreating(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyMemory({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-lavender-300 bg-white/50 p-8 text-center text-sm text-ink-500">
      {hasAny ? (
        '当前过滤条件下没有结果。'
      ) : (
        <>
          这个人格还没有积累记忆喵。
          <br />
          在「Endpoints」页里配置好 embedding 和 extractor，开启记忆开关，
          后续每轮对话结束都会自动抽取事实。
        </>
      )}
    </div>
  );
}

function FactCard({ fact }: { fact: MemoryFact }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fact.text);

  async function togglePin() {
    await db.memoryFacts.update(fact.id, {
      pinned: !fact.pinned,
      updatedAt: Date.now(),
    });
  }
  async function toggleArchive() {
    await db.memoryFacts.update(fact.id, {
      archived: !fact.archived,
      updatedAt: Date.now(),
    });
  }
  async function handleDelete() {
    if (!confirm('彻底删除这条记忆？')) return;
    await db.memoryFacts.delete(fact.id);
  }
  async function saveEdit() {
    const t = draft.trim();
    if (!t) return;
    if (t === fact.text) {
      setEditing(false);
      return;
    }
    // Re-embed the new text.
    const settings = await getSettings();
    let embedding = fact.embedding;
    if (settings.embeddingEndpointId && settings.embeddingModel) {
      const ep = await db.endpoints.get(settings.embeddingEndpointId);
      if (ep) {
        try {
          const r = await embed({
            endpoint: ep,
            model: settings.embeddingModel,
            inputs: [t],
          });
          embedding = r.vectors[0];
        } catch {
          // keep old embedding if re-embed fails
        }
      }
    }
    await db.memoryFacts.update(fact.id, {
      text: t,
      embedding,
      embeddingModel: fact.embeddingModel,
      updatedAt: Date.now(),
    });
    setEditing(false);
  }

  return (
    <div
      className={`rounded-xl border p-3 shadow-sm transition ${
        fact.archived
          ? 'border-ink-100 bg-ink-50/60 opacity-70'
          : fact.pinned
            ? 'border-mint-300 bg-mint-50'
            : 'border-lavender-200 bg-white/80'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                CATEGORY_COLOR[fact.category]
              }`}
            >
              {CATEGORY_LABEL[fact.category]}
            </span>
            {fact.pinned && (
              <span className="rounded bg-mint-200 px-1.5 py-0.5 text-xs text-mint-500">
                已置顶
              </span>
            )}
            {fact.archived && (
              <span className="rounded bg-ink-100 px-1.5 py-0.5 text-xs text-ink-500">
                已归档
              </span>
            )}
            <span className="text-xs text-ink-500/80">
              {relativeTime(fact.createdAt)}
            </span>
          </div>
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.max(2, draft.split('\n').length + 1)}
              className="w-full resize-y rounded-lg border border-lavender-200 bg-white px-2 py-1.5 text-sm text-ink-900 focus:border-mint-300"
              autoFocus
            />
          ) : (
            <p className="text-sm text-ink-900">{fact.text}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          {editing ? (
            <>
              <button
                type="button"
                onClick={saveEdit}
                className="rounded-lg p-1.5 text-mint-500 transition hover:bg-mint-100"
                aria-label="保存"
              >
                <Save size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(fact.text);
                  setEditing(false);
                }}
                className="rounded-lg p-1.5 text-ink-500 transition hover:bg-lavender-50"
                aria-label="取消"
              >
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-lg p-1.5 text-ink-500 transition hover:bg-lavender-50"
                aria-label="编辑"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={togglePin}
                className="rounded-lg p-1.5 text-ink-500 transition hover:bg-mint-50"
                aria-label={fact.pinned ? '取消置顶' : '置顶'}
              >
                {fact.pinned ? <PinOff size={14} /> : <Pin size={14} />}
              </button>
              <button
                type="button"
                onClick={toggleArchive}
                className="rounded-lg p-1.5 text-ink-500 transition hover:bg-lavender-50"
                aria-label={fact.archived ? '取消归档' : '归档'}
              >
                {fact.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-lg p-1.5 text-ink-500 transition hover:bg-rose-50 hover:text-rose-500"
                aria-label="删除"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ManualAddDialog({
  personaId,
  onClose,
}: {
  personaId: string;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState<FactCategory>('user_fact');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setErr('');
    try {
      const settings = await getSettings();
      let embedding: number[] = [];
      let embeddingModel = '';
      if (settings.embeddingEndpointId && settings.embeddingModel) {
        const ep = await db.endpoints.get(settings.embeddingEndpointId);
        if (ep) {
          try {
            const r = await embed({
              endpoint: ep,
              model: settings.embeddingModel,
              inputs: [t],
            });
            embedding = r.vectors[0];
            embeddingModel = settings.embeddingModel;
          } catch (e) {
            setErr(`嵌入失败但记忆会保存：${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
      const now = Date.now();
      await db.memoryFacts.add({
        id: newId(),
        personaId,
        conversationId: '',
        messageId: '',
        text: t,
        category,
        embedding,
        embeddingModel,
        pinned: true,
        createdAt: now,
        updatedAt: now,
      });
      // bump default persona setting too if not set
      const settingsCheck = await getSettings();
      if (!settingsCheck.defaultPersonaId) {
        await saveSettings({ defaultPersonaId: personaId });
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/30 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-ink-900">手工添加记忆</h3>
        <p className="mt-1 text-xs text-ink-500">
          手工添加的记忆默认置顶，永远会被检索到。
        </p>

        <div className="mt-4 flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-500">内容</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="比如：她在苏州一家会员店做零售岗，排班 14:00-22:45。"
              className="resize-y rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-mint-300"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-500">分类</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as FactCategory)}
              className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-mint-300"
            >
              {(Object.entries(CATEGORY_LABEL) as [FactCategory, string][]).map(
                ([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ),
              )}
            </select>
          </label>
          {err && <p className="text-xs text-rose-500">{err}</p>}
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
            disabled={busy || !text.trim()}
            className="rounded-lg bg-mint-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-mint-300 disabled:opacity-60"
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
