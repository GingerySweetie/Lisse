import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ListChecks,
  Pencil,
  Pin,
  PinOff,
  Save,
  Search,
  Sparkles,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { db, getSettings, saveSettings } from '../db';
import { embed } from '../api/embedding';
import {
  backfillConversations,
  type BackfillProgress,
} from '../lib/memory/backfill';
import {
  importClaudeMemories,
  type ImportClaudeMemoriesResult,
} from '../lib/memory/import-claude';
import type { Conversation, FactCategory, MemoryFact, Persona } from '../types';
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
  preference: 'bg-lavender-100 text-sky-500',
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
  const [backfilling, setBackfilling] = useState(false);
  const [importingClaude, setImportingClaude] = useState(false);

  // ── Multi-select / edit mode ──────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState<FactCategory | ''>('');

  function enterEditMode() {
    setEditMode(true);
    setSelected(new Set());
    setBulkCategory('');
  }
  function exitEditMode() {
    setEditMode(false);
    setSelected(new Set());
    setBulkCategory('');
  }
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = useMemo(() => {
    if (!facts) return [];
    let out = facts;
    if (!showArchived) out = out.filter((f) => !f.archived);
    const q = filter.trim().toLowerCase();
    if (q) out = out.filter((f) => f.text.toLowerCase().includes(q));
    return out;
  }, [facts, filter, showArchived]);

  const allFilteredIds = useMemo(() => filtered.map((f) => f.id), [filtered]);
  const allSelected =
    allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id));

  const stats = useMemo(() => {
    if (!facts) return { total: 0, pinned: 0, archived: 0 };
    return {
      total: facts.length,
      pinned: facts.filter((f) => f.pinned).length,
      archived: facts.filter((f) => f.archived).length,
    };
  }, [facts]);

  // ── Bulk operations ───────────────────────────────────────────────────────
  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selected.size} 条记忆？此操作不可撤销喵。`)) return;
    await db.memoryFacts.bulkDelete([...selected]);
    setSelected(new Set());
  }

  async function handleBulkCategorize() {
    if (selected.size === 0 || !bulkCategory) return;
    const now = Date.now();
    await db.transaction('rw', db.memoryFacts, async () => {
      for (const id of selected) {
        await db.memoryFacts.update(id, { category: bulkCategory, updatedAt: now });
      }
    });
    setSelected(new Set());
    setBulkCategory('');
  }

  async function handleBulkPin(pinned: boolean) {
    if (selected.size === 0) return;
    const now = Date.now();
    await db.transaction('rw', db.memoryFacts, async () => {
      for (const id of selected) {
        await db.memoryFacts.update(id, { pinned, updatedAt: now });
      }
    });
    setSelected(new Set());
  }

  async function handleBulkArchive(archived: boolean) {
    if (selected.size === 0) return;
    const now = Date.now();
    await db.transaction('rw', db.memoryFacts, async () => {
      for (const id of selected) {
        await db.memoryFacts.update(id, { archived, updatedAt: now });
      }
    });
    setSelected(new Set());
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="topbar flex items-center gap-3 px-3 py-3 md:px-6">
        <Link
          to="/chat"
          className="hidden items-center gap-1 rounded-lg px-2 py-1 text-sm text-ink-500 transition hover:bg-lavender-50 md:inline-flex"
        >
          <ChevronLeft size={16} />
          返回
        </Link>
        <h2 className="endpoint-card-title flex-1">记忆</h2>
        {/* Edit-mode toggle */}
        {editMode ? (
          <button
            type="button"
            onClick={exitEditMode}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-500 transition hover:bg-lavender-100 hover:text-ink-700"
          >
            <X size={13} strokeWidth={1.5} />
            取消
          </button>
        ) : (
          <button
            type="button"
            onClick={enterEditMode}
            className="rounded-lg p-1.5 text-ink-400 transition hover:bg-lavender-100 hover:text-ink-700"
            aria-label="进入多选模式"
            title="多选"
          >
            <ListChecks size={15} strokeWidth={1.5} />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-4 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">

          {/* Persona switcher + stats */}
          {!editMode && (
            <div className="endpoint-card !mt-0 !p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <label className="text-xs font-medium text-ink-500">人格</label>
                <select
                  value={personaId ?? ''}
                  onChange={(e) => setPersonaId(e.target.value || null)}
                  className="rounded-lg border border-lavender-200 bg-white px-2 py-1.5 focus:border-lavender-300"
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
                  onClick={() => setBackfilling(true)}
                  disabled={!personaId}
                  className="btn-ghost flex items-center gap-1 !px-2 !py-1 !text-xs"
                >
                  <Sparkles size={12} />
                  从对话回填
                </button>
                <button
                  type="button"
                  onClick={() => setImportingClaude(true)}
                  disabled={!personaId}
                  className="btn-ghost flex items-center gap-1 !px-2 !py-1 !text-xs"
                >
                  <Upload size={12} />
                  导入 Claude 记忆
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="btn-primary !px-2 !py-1 !text-xs"
                >
                  + 手工添加
                </button>
              </div>
            </div>
          )}

          {/* Filter bar */}
          <div className="endpoint-card !mt-0 !p-3 flex items-center gap-2">
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

          {/* Bulk-edit action bar */}
          {editMode && (
            <div className="endpoint-card !mt-0 !p-3 flex flex-wrap items-center gap-2">
              {/* Selection controls */}
              <span className="text-xs font-medium text-ink-700">
                {selected.size > 0 ? `已选 ${selected.size} 条` : '未选'}
              </span>
              <button
                type="button"
                onClick={() =>
                  allSelected
                    ? setSelected(new Set())
                    : setSelected(new Set(allFilteredIds))
                }
                className="rounded-lg px-2 py-1 text-xs text-ink-500 transition hover:bg-lavender-50"
              >
                {allSelected ? '取消全选' : '全选'}
              </button>

              <div className="mx-1 h-4 w-px bg-lavender-200" />

              {/* Categorize */}
              <select
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value as FactCategory | '')}
                disabled={selected.size === 0}
                className="rounded-lg border border-lavender-200 bg-white px-2 py-1 text-xs disabled:opacity-40"
              >
                <option value="">改分类…</option>
                {(Object.entries(CATEGORY_LABEL) as [FactCategory, string][]).map(
                  ([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ),
                )}
              </select>
              <button
                type="button"
                onClick={handleBulkCategorize}
                disabled={selected.size === 0 || !bulkCategory}
                className="rounded-lg bg-lavender-200 px-2 py-1 text-xs font-medium text-ink-900 transition hover:bg-lavender-300 disabled:opacity-40"
              >
                确认
              </button>

              <div className="mx-1 h-4 w-px bg-lavender-200" />

              {/* Pin / Unpin */}
              <button
                type="button"
                onClick={() => handleBulkPin(true)}
                disabled={selected.size === 0}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-500 transition hover:bg-lavender-50 disabled:opacity-40"
                title="批量置顶"
              >
                <Pin size={12} /> 置顶
              </button>
              <button
                type="button"
                onClick={() => handleBulkPin(false)}
                disabled={selected.size === 0}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-500 transition hover:bg-lavender-50 disabled:opacity-40"
                title="批量取消置顶"
              >
                <PinOff size={12} /> 取消置顶
              </button>

              <div className="mx-1 h-4 w-px bg-lavender-200" />

              {/* Archive / Unarchive */}
              <button
                type="button"
                onClick={() => handleBulkArchive(true)}
                disabled={selected.size === 0}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-500 transition hover:bg-lavender-50 disabled:opacity-40"
                title="批量归档"
              >
                <Archive size={12} /> 归档
              </button>
              <button
                type="button"
                onClick={() => handleBulkArchive(false)}
                disabled={selected.size === 0}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-500 transition hover:bg-lavender-50 disabled:opacity-40"
                title="批量取消归档"
              >
                <ArchiveRestore size={12} /> 取消归档
              </button>

              <div className="mx-1 h-4 w-px bg-lavender-200" />

              {/* Delete */}
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={selected.size === 0}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-rose-500 transition hover:bg-rose-50 disabled:opacity-40"
              >
                <Trash2 size={12} />
                删除选中 {selected.size > 0 ? `(${selected.size})` : ''}
              </button>
            </div>
          )}

          {/* List */}
          {filtered.length === 0 ? (
            <EmptyMemory hasAny={stats.total > 0} />
          ) : (
            <ul className="flex flex-col gap-2">
              {filtered.map((f) => (
                <li key={f.id}>
                  <FactCard
                    fact={f}
                    editMode={editMode}
                    selected={selected.has(f.id)}
                    onToggleSelect={() => toggleSelect(f.id)}
                  />
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
          {backfilling && personaId && personas && (
            <BackfillDialog
              targetPersona={
                personas.find((p) => p.id === personaId) ?? personas[0]
              }
              allPersonas={personas}
              onClose={() => setBackfilling(false)}
            />
          )}
          {importingClaude && personaId && personas && (
            <ClaudeMemoryImportDialog
              targetPersona={
                personas.find((p) => p.id === personaId) ?? personas[0]
              }
              allPersonas={personas}
              onClose={() => setImportingClaude(false)}
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
          在「Endpoints」页开启记忆并配置嵌入模型后，模型可主动写入记忆；
          也可「导入 Claude 记忆」或从历史对话回填。
        </>
      )}
    </div>
  );
}

function FactCard({
  fact,
  editMode,
  selected,
  onToggleSelect,
}: {
  fact: MemoryFact;
  editMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fact.text);

  async function togglePin() {
    await db.memoryFacts.update(fact.id, { pinned: !fact.pinned, updatedAt: Date.now() });
  }
  async function toggleArchive() {
    await db.memoryFacts.update(fact.id, { archived: !fact.archived, updatedAt: Date.now() });
  }
  async function handleDelete() {
    if (!confirm('彻底删除这条记忆？')) return;
    await db.memoryFacts.delete(fact.id);
  }
  async function saveEdit() {
    const t = draft.trim();
    if (!t) return;
    if (t === fact.text) { setEditing(false); return; }
    const settings = await getSettings();
    let embedding = fact.embedding;
    if (settings.embeddingEndpointId && settings.embeddingModel) {
      const ep = await db.endpoints.get(settings.embeddingEndpointId);
      if (ep) {
        try {
          const r = await embed({ endpoint: ep, model: settings.embeddingModel, inputs: [t] });
          embedding = r.vectors[0];
        } catch { /* keep old embedding */ }
      }
    }
    await db.memoryFacts.update(fact.id, {
      text: t, embedding, embeddingModel: fact.embeddingModel, updatedAt: Date.now(),
    });
    setEditing(false);
  }

  return (
    <div
      className={`rounded-xl border p-3 shadow-sm transition ${
        selected
          ? 'border-lavender-400 bg-lavender-50 ring-1 ring-lavender-300'
          : fact.archived
            ? 'border-ink-100 bg-ink-50/60 opacity-70'
            : fact.pinned
              ? 'border-lavender-300 bg-lavender-50'
              : 'border-lavender-200 bg-white/80'
      }`}
      onClick={editMode ? onToggleSelect : undefined}
      style={editMode ? { cursor: 'pointer' } : undefined}
    >
      <div className="flex items-start gap-2">
        {/* Checkbox in edit mode */}
        {editMode && (
          <div className="mt-0.5 flex shrink-0 items-center">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 accent-lavender-400"
            />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${CATEGORY_COLOR[fact.category]}`}>
              {CATEGORY_LABEL[fact.category]}
            </span>
            {fact.pinned && (
              <span className="rounded bg-lavender-200 px-1.5 py-0.5 text-xs text-sky-500">已置顶</span>
            )}
            {fact.archived && (
              <span className="rounded bg-ink-100 px-1.5 py-0.5 text-xs text-ink-500">已归档</span>
            )}
            <span className="text-xs text-ink-500/80">{relativeTime(fact.createdAt)}</span>
          </div>
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.max(2, draft.split('\n').length + 1)}
              className="w-full resize-y rounded-lg border border-lavender-200 bg-white px-2 py-1.5 text-sm text-ink-900 focus:border-lavender-300"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <p className="text-sm text-ink-900">{fact.text}</p>
          )}
        </div>

        {/* Per-card action buttons — hidden in edit mode */}
        {!editMode && (
          <div className="flex shrink-0 flex-col gap-1">
            {editing ? (
              <>
                <button type="button" onClick={saveEdit}
                  className="rounded-lg p-1.5 text-sky-500 transition hover:bg-lavender-100" aria-label="保存">
                  <Save size={14} />
                </button>
                <button type="button" onClick={() => { setDraft(fact.text); setEditing(false); }}
                  className="rounded-lg p-1.5 text-ink-500 transition hover:bg-lavender-50" aria-label="取消">
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setEditing(true)}
                  className="rounded-lg p-1.5 text-ink-500 transition hover:bg-lavender-50" aria-label="编辑">
                  <Pencil size={14} />
                </button>
                <button type="button" onClick={togglePin}
                  className="rounded-lg p-1.5 text-ink-500 transition hover:bg-lavender-50"
                  aria-label={fact.pinned ? '取消置顶' : '置顶'}>
                  {fact.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                </button>
                <button type="button" onClick={toggleArchive}
                  className="rounded-lg p-1.5 text-ink-500 transition hover:bg-lavender-50"
                  aria-label={fact.archived ? '取消归档' : '归档'}>
                  {fact.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                </button>
                <button type="button" onClick={handleDelete}
                  className="rounded-lg p-1.5 text-ink-500 transition hover:bg-rose-50 hover:text-rose-500" aria-label="删除">
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ManualAddDialog({ personaId, onClose }: { personaId: string; onClose: () => void }) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState<FactCategory>('user_fact');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    const t = text.trim();
    if (!t) return;
    setBusy(true); setErr('');
    try {
      const settings = await getSettings();
      let embedding: number[] = [];
      let embeddingModel = '';
      if (settings.embeddingEndpointId && settings.embeddingModel) {
        const ep = await db.endpoints.get(settings.embeddingEndpointId);
        if (ep) {
          try {
            const r = await embed({ endpoint: ep, model: settings.embeddingModel, inputs: [t] });
            embedding = r.vectors[0];
            embeddingModel = settings.embeddingModel;
          } catch (e) {
            setErr(`嵌入失败但记忆会保存：${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
      const now = Date.now();
      await db.memoryFacts.add({
        id: newId(), personaId, conversationId: '', messageId: '',
        text: t, category, embedding, embeddingModel, pinned: true, createdAt: now, updatedAt: now,
      });
      const settingsCheck = await getSettings();
      if (!settingsCheck.defaultPersonaId) await saveSettings({ defaultPersonaId: personaId });
      onClose();
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/30 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-ink-900">手工添加记忆</h3>
        <p className="mt-1 text-xs text-ink-500">手工添加的记忆默认置顶，永远会被检索到。</p>
        <div className="mt-4 flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-500">内容</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
              placeholder="比如：她在苏州一家会员店做零售岗，排班 14:00-22:45。"
              className="resize-y rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-500">分类</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as FactCategory)}
              className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300">
              {(Object.entries(CATEGORY_LABEL) as [FactCategory, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          {err && <p className="text-xs text-rose-500">{err}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-lavender-200 px-4 py-2 text-sm text-ink-700 transition hover:bg-lavender-50">取消</button>
          <button type="button" onClick={handleSave} disabled={busy || !text.trim()}
            className="rounded-lg bg-lavender-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-300 disabled:opacity-60">
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

const SOURCE_LABEL: Record<NonNullable<Conversation['source']> | 'unknown', string> = {
  native: '原生', chatgpt: 'ChatGPT', claude: 'Claude', unknown: '其它',
};

interface ConvRow { conversation: Conversation; msgCount: number; }

function BackfillDialog({ targetPersona, allPersonas, onClose }: {
  targetPersona: Persona; allPersonas: Persona[]; onClose: () => void;
}) {
  const [personaId, setPersonaId] = useState(targetPersona.id);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'native' | 'chatgpt' | 'claude'>('all');
  const [showBackfilled, setShowBackfilled] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<ConvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BackfillProgress | null>(null);
  const [doneSummary, setDoneSummary] = useState<{ convs: number; facts: number } | null>(null);
  const [runError, setRunError] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const convs = await db.conversations.toArray();
      const visible = convs.filter((c) => !c.room);
      const counts = await Promise.all(
        visible.map(async (c) => ({
          conversation: c,
          msgCount: await db.messages.where({ conversationId: c.id }).count(),
        })),
      );
      counts.sort((a, b) => b.conversation.updatedAt - a.conversation.updatedAt);
      if (!cancelled) { setRows(counts); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const filteredRows = useMemo(() => {
    let r = rows;
    if (sourceFilter !== 'all') r = r.filter((row) => (row.conversation.source ?? 'native') === sourceFilter);
    if (!showBackfilled) r = r.filter((row) => !row.conversation.memoryBackfilledAt);
    return r;
  }, [rows, sourceFilter, showBackfilled]);

  function toggle(id: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function selectAllVisible() { setSelected(new Set(filteredRows.map((r) => r.conversation.id))); }
  function clearSelection() { setSelected(new Set()); }

  const selectedRows = filteredRows.filter((r) => selected.has(r.conversation.id));
  const estimatedBatches = selectedRows.reduce((sum, r) => sum + Math.max(1, Math.ceil(r.msgCount / 16)), 0);

  async function start() {
    if (selectedRows.length === 0) return;
    const persona = allPersonas.find((p) => p.id === personaId);
    if (!persona) return;
    setRunning(true); setRunError(''); setDoneSummary(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const results = await backfillConversations({
        conversations: selectedRows.map((r) => r.conversation), persona,
        signal: controller.signal, onProgress: setProgress,
      });
      const totalFacts = results.reduce((s, r) => s + r.factsAdded, 0);
      setDoneSummary({ convs: results.length, facts: totalFacts });
      const refreshed = await Promise.all(
        rows.map(async (r) => ({
          conversation: (await db.conversations.get(r.conversation.id)) ?? r.conversation,
          msgCount: r.msgCount,
        })),
      );
      setRows(refreshed); setSelected(new Set());
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally { setRunning(false); abortRef.current = null; }
  }

  function abort() { abortRef.current?.abort(); }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/30 backdrop-blur-sm md:items-center"
      onClick={running ? undefined : onClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-lavender-100 px-5 py-4">
          <div>
            <h3 className="flex items-center gap-1.5 text-lg font-semibold text-ink-900">
              <Sparkles size={16} className="text-lavender-600" /> 从对话回填记忆
            </h3>
            <p className="mt-1 text-xs text-ink-500">历史对话每 16 条消息打包一次喂给抽取小模型，事实落到选中的人格记忆池。</p>
          </div>
          <button type="button" onClick={onClose} disabled={running}
            className="rounded-full p-1 text-ink-500 transition hover:bg-lavender-50 disabled:opacity-40" aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-b border-lavender-100 px-5 py-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-xs text-ink-500">归到</span>
            <select value={personaId} onChange={(e) => setPersonaId(e.target.value)} disabled={running}
              className="rounded-lg border border-lavender-200 bg-white px-2 py-1 text-sm">
              {allPersonas.map((p) => <option key={p.id} value={p.id}>{p.avatar} {p.name}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-1 text-xs">
            {(['all', 'native', 'chatgpt', 'claude'] as const).map((s) => (
              <button key={s} type="button" disabled={running} onClick={() => setSourceFilter(s)}
                className={`rounded-full px-2 py-1 transition ${sourceFilter === s ? 'bg-lavender-200 text-ink-900' : 'bg-lavender-50 text-ink-500 hover:bg-lavender-100'} disabled:opacity-40`}>
                {s === 'all' ? '全部' : SOURCE_LABEL[s]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-xs text-ink-500">
            <input type="checkbox" checked={showBackfilled} onChange={(e) => setShowBackfilled(e.target.checked)} disabled={running} />
            含已抽过
          </label>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <button type="button" disabled={running || filteredRows.length === 0} onClick={selectAllVisible}
              className="rounded-lg px-2 py-1 text-ink-500 transition hover:bg-lavender-50 disabled:opacity-40">全选</button>
            <button type="button" disabled={running || selected.size === 0} onClick={clearSelection}
              className="rounded-lg px-2 py-1 text-ink-500 transition hover:bg-lavender-50 disabled:opacity-40">清空</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {loading ? (
            <div className="px-3 py-8 text-center text-sm text-ink-500">加载对话……</div>
          ) : filteredRows.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-ink-500">当前过滤条件下没有对话。</div>
          ) : (
            <ul className="flex flex-col gap-1">
              {filteredRows.map((row) => {
                const c = row.conversation;
                const isSelected = selected.has(c.id);
                const isCurrent = progress?.conversationId === c.id && running;
                return (
                  <li key={c.id}>
                    <label className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${isCurrent || isSelected ? 'border-lavender-300 bg-lavender-50' : 'border-transparent hover:bg-lavender-50/60'}`}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggle(c.id)} disabled={running} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-ink-900">{c.title || '（无标题）'}</span>
                          {c.memoryBackfilledAt && (
                            <span className="shrink-0 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-500">已抽过</span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-500">
                          <span className="rounded bg-lavender-50 px-1.5 py-0.5">{SOURCE_LABEL[c.source ?? 'native']}</span>
                          <span>{row.msgCount} 条</span>
                          <span>·</span>
                          <span>{relativeTime(c.updatedAt)}</span>
                        </div>
                      </div>
                      {isCurrent && progress && (
                        <span className="shrink-0 text-[11px] text-sky-500">
                          {progress.phase === 'embedding' ? '嵌入中' : '抽取中'} {progress.batchDone + 1}/{progress.batchTotal}
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-lavender-100 bg-lavender-50/40 px-5 py-3">
          {runError && <p className="mb-2 text-xs text-rose-500">{runError}</p>}
          {doneSummary && !running && (
            <p className="mb-2 text-xs text-sky-500">完成：处理 {doneSummary.convs} 个对话，新增 {doneSummary.facts} 条记忆。</p>
          )}
          {running && progress && (
            <div className="mb-2 text-xs text-ink-500">
              对话 {progress.conversationIndex + 1}/{progress.conversationTotal} · 批次 {progress.batchDone + 1}/{progress.batchTotal || 1} · 已添加 {progress.factsAddedTotal} 条事实
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-ink-500">
              {selectedRows.length > 0 ? `已选 ${selectedRows.length} 个对话 · 约 ${estimatedBatches} 次抽取调用` : '未选'}
            </div>
            <div className="flex gap-2">
              {running ? (
                <button type="button" onClick={abort}
                  className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-500 transition hover:bg-rose-100">
                  <Square size={12} fill="currentColor" /> 停止
                </button>
              ) : (
                <>
                  <button type="button" onClick={onClose}
                    className="rounded-lg border border-lavender-200 px-4 py-2 text-sm text-ink-700 transition hover:bg-lavender-50">关闭</button>
                  <button type="button" onClick={start} disabled={selectedRows.length === 0}
                    className="rounded-lg bg-lavender-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-300 disabled:opacity-50">开始抽取</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClaudeMemoryImportDialog({
  targetPersona,
  allPersonas,
  onClose,
}: {
  targetPersona: Persona;
  allPersonas: Persona[];
  onClose: () => void;
}) {
  const [personaId, setPersonaId] = useState(targetPersona.id);
  const [fileName, setFileName] = useState('');
  const [raw, setRaw] = useState<unknown>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{
    phase: string;
    done: number;
    total: number;
  } | null>(null);
  const [result, setResult] = useState<ImportClaudeMemoriesResult | null>(null);
  const [err, setErr] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function onPickFile(file: File | null) {
    setErr('');
    setResult(null);
    setRaw(null);
    setFileName('');
    if (!file) return;
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      setRaw(parsed);
    } catch (e) {
      setErr(
        `无法解析 JSON：${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async function start() {
    if (raw == null) return;
    setRunning(true);
    setErr('');
    setResult(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const r = await importClaudeMemories({
        personaId,
        raw,
        signal: controller.signal,
        onProgress: setProgress,
      });
      setResult(r);
      const settings = await getSettings();
      if (!settings.defaultPersonaId) {
        await saveSettings({ defaultPersonaId: personaId });
      }
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') {
        setErr('已取消');
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/30 backdrop-blur-sm md:items-center"
      onClick={running ? undefined : onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-lavender-100 px-5 py-4">
          <div>
            <h3 className="flex items-center gap-1.5 text-lg font-semibold text-ink-900">
              <Upload size={16} className="text-lavender-600" />
              导入 Claude 记忆
            </h3>
            <p className="mt-1 text-xs text-ink-500">
              选择 Claude 导出的 memories JSON（含 conversations_memory /
              project_memories）。会拆成独立事实写入当前人格；Other instructions
              与个人背景默认置顶。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="rounded-full p-1 text-ink-500 transition hover:bg-lavender-50 disabled:opacity-40"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-xs text-ink-500">归到</span>
            <select
              value={personaId}
              onChange={(e) => setPersonaId(e.target.value)}
              disabled={running}
              className="rounded-lg border border-lavender-200 bg-white px-2 py-1 text-sm"
            >
              {allPersonas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.avatar} {p.name}
                </option>
              ))}
            </select>
          </label>

          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            disabled={running}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg border border-dashed border-lavender-300 bg-lavender-50/50 px-3 py-6 text-center text-sm text-ink-700 transition hover:bg-lavender-50 disabled:opacity-50"
          >
            {fileName ? `已选：${fileName}` : '点此选择 memories_*.json'}
          </button>

          {err && <p className="text-xs text-rose-500">{err}</p>}
          {result && !running && (
            <p className="text-xs text-sky-500">
              解析 {result.parsed} 条 → 写入 {result.added} 条
              {result.skippedDupes
                ? `（跳过重复 ${result.skippedDupes}）`
                : ''}
              {result.embedded
                ? `，已嵌入 ${result.embedded}`
                : '（未嵌入：请配置嵌入模型后可再手工触发检索）'}
              {result.projectCount
                ? `；含 ${result.projectCount} 个 project`
                : ''}
              。
            </p>
          )}
          {running && progress && (
            <p className="text-xs text-ink-500">
              {progress.phase === 'parse' && '解析中…'}
              {progress.phase === 'embed' &&
                `嵌入 ${progress.done}/${progress.total}`}
              {progress.phase === 'write' &&
                `写入 ${progress.done}/${progress.total}`}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-lavender-100 px-5 py-3">
          {running ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-500 transition hover:bg-rose-100"
            >
              <Square size={12} fill="currentColor" /> 停止
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-lavender-200 px-4 py-2 text-sm text-ink-700 transition hover:bg-lavender-50"
              >
                关闭
              </button>
              <button
                type="button"
                onClick={() => void start()}
                disabled={raw == null}
                className="rounded-lg bg-lavender-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-300 disabled:opacity-50"
              >
                开始导入
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
