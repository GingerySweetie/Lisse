import { useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Trash2,
  ListChecks,
  X,
  Check,
} from 'lucide-react';
import { db } from '../db';
import { createConversation, deleteConversation } from '../lib/chat';
import { rememberConversationPresence } from '../lib/data-presence';
import { relativeTime } from '../lib/format';
import type { Conversation, Persona } from '../types';
import DataLossRecoverBanner from './DataLossRecoverBanner';
import WisteriaMark from './WisteriaMark';

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const { conversationId: activeId } = useParams();

  // No default `[]` — undefined means "still loading" so we don't flash an
  // empty list (which looks like a wipe and panics people into replace-import).
  const conversations = useLiveQuery(() =>
    db.conversations.orderBy('updatedAt').reverse().toArray(),
  );
  const personas = useLiveQuery(() => db.personas.toArray(), [], []);

  useEffect(() => {
    if (conversations && conversations.length > 0) {
      rememberConversationPresence(conversations.length);
    }
  }, [conversations]);

  // Track which conversation group headers are collapsed. Default: all expanded.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  function toggleCollapse(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

  // Track whether the bottom nav is collapsed. Persisted to localStorage.
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-nav-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  function toggleNav() {
    setNavCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem('sidebar-nav-collapsed', String(next));
      } catch {}
      return next;
    });
  }

  // ── Edit / multi-select mode ──────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [movePersonaId, setMovePersonaId] = useState<string>('');

  // All visible conversation ids (bedroom rooms are hidden in the sidebar).
  const allVisibleIds = useMemo(
    () =>
      (conversations ?? [])
        .filter((c) => c.room !== 'bedroom' && c.room !== 'consult')
        .map((c) => c.id),
    [conversations],
  );

  function enterEditMode() {
    setEditMode(true);
    setSelected(new Set());
    setMovePersonaId('');
  }

  function exitEditMode() {
    setEditMode(false);
    setSelected(new Set());
    setMovePersonaId('');
  }

  function toggleSelectConv(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(allVisibleIds));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  /** Toggle all conversations in a group: if all are already selected, deselect them. */
  function toggleGroupSelect(groupConvIds: string[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = groupConvIds.every((id) => next.has(id));
      if (allSelected) {
        groupConvIds.forEach((id) => next.delete(id));
      } else {
        groupConvIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (
      !confirm(
        `确定要删除选中的 ${selected.size} 条对话吗？此操作不可撤销喵。`,
      )
    )
      return;
    const ids = [...selected];
    // One transaction so a mid-loop kill (OOM / WebView reclaim) can't leave
    // "half my conversations disappeared".
    await db.transaction('rw', db.conversations, db.messages, async () => {
      for (const id of ids) {
        await db.messages.where({ conversationId: id }).delete();
        await db.conversations.delete(id);
      }
    });
    if (activeId && selected.has(activeId)) navigate('/chat');
    setSelected(new Set());
  }

  async function handleMoveToPersona() {
    if (selected.size === 0 || !movePersonaId) return;
    const now = Date.now();
    await db.transaction('rw', db.conversations, async () => {
      for (const id of selected) {
        await db.conversations.update(id, {
          personaId: movePersonaId,
          updatedAt: now,
        });
      }
    });
    setSelected(new Set());
  }

  // ─────────────────────────────────────────────────────────────────────────

  // Group conversations by persona id; order groups by latest activity
  // within each group, but pin the built-in personas to the top.
  const groups = useMemo(
    () => groupConversations(conversations ?? [], personas ?? []),
    [conversations, personas],
  );

  async function handleNewInGroup(personaId: string | null) {
    const conv = await createConversation({
      personaId: personaId ?? undefined,
    });
    navigate(`/chat/${conv.id}`);
    onNavigate?.();
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('删除这个对话？此操作不可撤销喵。')) return;
    await deleteConversation(id);
    if (activeId === id) navigate('/chat');
  }

  const isAllSelected =
    allVisibleIds.length > 0 &&
    allVisibleIds.every((id) => selected.has(id));

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="border-b border-lavender-100/70 px-5 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <WisteriaMark size={28} tone="inline" />
            <span
              className="text-[20px] italic tracking-wider text-[#5a4060]"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 500,
              }}
            >
              Wisteria
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* Edit mode toggle */}
            {editMode ? (
              <button
                type="button"
                onClick={exitEditMode}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-500 transition hover:bg-lavender-100 hover:text-ink-700"
                aria-label="退出选择模式"
              >
                <X size={13} strokeWidth={1.5} />
                取消
              </button>
            ) : (
              <button
                type="button"
                onClick={enterEditMode}
                className="rounded-lg p-1.5 text-ink-400 transition hover:bg-lavender-100 hover:text-ink-700"
                aria-label="进入选择模式（多选删除 / 移动）"
                title="多选"
              >
                <ListChecks size={15} strokeWidth={1.5} />
              </button>
            )}
            {/* Close sidebar (mobile) */}
            {!editMode && (
              <button
                type="button"
                onClick={() => onNavigate?.()}
                className="text-lg text-ink-500/80 transition hover:text-ink-700 md:hidden"
                aria-label="关闭"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {!editMode && (
          <button
            type="button"
            onClick={() => handleNewInGroup(null)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(176,138,204,0.2)] bg-[rgba(176,138,204,0.12)] px-4 py-2.5 text-[13px] font-light text-[#7a5a88] transition hover:bg-[rgba(176,138,204,0.18)]"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            <span className="text-base font-light">＋</span>
            新对话
          </button>
        )}
      </div>

      {/* ── Conversation list ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <DataLossRecoverBanner onNavigate={onNavigate} />
        {conversations === undefined && (
          <div className="px-3 py-8 text-center text-sm text-ink-500">
            加载对话中…
          </div>
        )}
        {conversations !== undefined && groups.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-ink-500">
            还没有对话喵
            <br />
            点上面"新对话"开始
          </div>
        )}

        <div className="flex flex-col">
          {conversations !== undefined && groups.map((g) => {
            const isCollapsed = collapsed[g.key] ?? false;
            const dotColor = g.persona?.color ?? '#a0a0a0';
            const groupIds = g.conversations.map((c) => c.id);
            const groupAllSelected =
              groupIds.length > 0 && groupIds.every((id) => selected.has(id));
            const groupSomeSelected = groupIds.some((id) => selected.has(id));

            return (
              <section key={g.key} className="group/section">
                <header className="flex items-center gap-2 px-5 py-2">
                  {/* Group-level checkbox in edit mode */}
                  {editMode && groupIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleGroupSelect(groupIds)}
                      className="shrink-0 text-[#9a80aa] transition hover:text-[#5a4060]"
                      aria-label={groupAllSelected ? '取消全选该分组' : '全选该分组'}
                    >
                      {groupAllSelected ? (
                        <span className="flex h-4 w-4 items-center justify-center rounded bg-[rgba(176,138,204,0.5)] text-white">
                          <Check size={10} strokeWidth={3} />
                        </span>
                      ) : groupSomeSelected ? (
                        <span className="flex h-4 w-4 items-center justify-center rounded border border-[rgba(176,138,204,0.6)] bg-[rgba(176,138,204,0.15)]">
                          <span className="h-1.5 w-2.5 rounded-sm bg-[rgba(176,138,204,0.8)]" />
                        </span>
                      ) : (
                        <span className="flex h-4 w-4 items-center justify-center rounded border border-[rgba(176,138,204,0.3)]" />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleCollapse(g.key)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px] text-[#6a5070] transition hover:text-ink-700"
                  >
                    <ChevronRight
                      size={10}
                      strokeWidth={1.4}
                      className={`shrink-0 transition-transform duration-200 ${
                        isCollapsed ? '' : 'rotate-90'
                      }`}
                    />
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: dotColor, opacity: 0.7 }}
                    />
                    <span
                      className="truncate font-normal"
                      style={{ fontFamily: 'var(--font-serif)' }}
                    >
                      {g.label}
                    </span>
                  </button>
                  <span className="rounded-lg bg-[rgba(176,138,204,0.1)] px-2 py-0.5 text-[11px] font-light text-[#b0a0b8]">
                    {g.conversations.length}
                  </span>
                  {!editMode && (
                    <button
                      type="button"
                      onClick={() => handleNewInGroup(g.personaId)}
                      className="rounded-full p-1 text-ink-500/70 opacity-0 transition hover:bg-lavender-100 hover:text-ink-900 group-hover/section:opacity-100 pointer-coarse:opacity-70"
                      aria-label={`在 ${g.label} 中新建对话`}
                      title={`在 ${g.label} 中新建对话`}
                    >
                      <span className="text-sm">＋</span>
                    </button>
                  )}
                </header>

                {!isCollapsed && (
                  <ul className="flex flex-col">
                    {g.conversations.map((conv) => {
                      const isActive = conv.id === activeId;
                      const isChecked = selected.has(conv.id);

                      if (editMode) {
                        // In edit mode: clickable row that toggles checkbox
                        return (
                          <li key={conv.id}>
                            <button
                              type="button"
                              onClick={() => toggleSelectConv(conv.id)}
                              className={`flex w-full items-center gap-3 px-5 py-2.5 pl-11 text-left transition ${
                                isChecked
                                  ? 'bg-[rgba(176,138,204,0.12)]'
                                  : 'hover:bg-[rgba(176,138,204,0.06)]'
                              }`}
                            >
                              {/* Checkbox */}
                              <span className="shrink-0">
                                {isChecked ? (
                                  <span className="flex h-4 w-4 items-center justify-center rounded bg-[rgba(176,138,204,0.6)] text-white">
                                    <Check size={10} strokeWidth={3} />
                                  </span>
                                ) : (
                                  <span className="flex h-4 w-4 items-center justify-center rounded border border-[rgba(176,138,204,0.35)]" />
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[14px] font-light leading-tight text-[#4a3550]">
                                  {conv.title}
                                </div>
                                <div className="mt-1 text-[11px] font-light text-[#b8a8c0]">
                                  {relativeTime(conv.updatedAt)}
                                  {conv.source && conv.source !== 'native' && (
                                    <span className="ml-1.5 rounded bg-[rgba(176,138,204,0.15)] px-1 py-0.5 text-[10px] text-[#9a80aa]">
                                      {conv.source === 'claude' ? 'Claude' : conv.source === 'chatgpt' ? 'ChatGPT' : conv.source}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      }

                      // Normal mode: NavLink with trash on hover
                      return (
                        <li key={conv.id}>
                          <NavLink
                            to={`/chat/${conv.id}`}
                            onClick={() => onNavigate?.()}
                            className={`group flex items-center justify-between gap-2 px-5 py-2.5 pl-11 transition ${
                              isActive
                                ? 'bg-[rgba(176,138,204,0.1)]'
                                : 'hover:bg-[rgba(176,138,204,0.06)]'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[14px] font-light leading-tight text-[#4a3550]">
                                {conv.title}
                              </div>
                              <div className="mt-1 text-[11px] font-light text-[#b8a8c0]">
                                {relativeTime(conv.updatedAt)}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => handleDelete(conv.id, e)}
                              className="invisible shrink-0 rounded p-1 text-ink-500 transition hover:bg-white hover:text-rose-500 group-hover:visible pointer-coarse:visible"
                              aria-label="删除对话"
                            >
                              <Trash2 size={14} />
                            </button>
                          </NavLink>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {/* ── Edit mode action bar ────────────────────────────────────────── */}
      {editMode && (
        <div className="border-t border-lavender-100/70 bg-white/80 px-3 py-3 backdrop-blur">
          {/* Select-all row */}
          <div className="mb-2.5 flex items-center justify-between">
            <button
              type="button"
              onClick={isAllSelected ? clearSelection : selectAll}
              className="flex items-center gap-1.5 text-[12px] text-[#7a5a88] transition hover:text-[#5a4060]"
            >
              {isAllSelected ? (
                <span className="flex h-4 w-4 items-center justify-center rounded bg-[rgba(176,138,204,0.6)] text-white">
                  <Check size={10} strokeWidth={3} />
                </span>
              ) : (
                <span className="flex h-4 w-4 items-center justify-center rounded border border-[rgba(176,138,204,0.4)]" />
              )}
              全选
            </button>
            <span className="text-[12px] text-[#b0a0b8]">
              {selected.size > 0 ? `已选 ${selected.size} 条` : '未选'}
            </span>
          </div>

          {/* Delete button */}
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={selected.size === 0}
            className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-[13px] font-light text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            <Trash2 size={13} />
            删除选中 {selected.size > 0 ? `(${selected.size})` : ''}
          </button>

          {/* Move to persona */}
          <div className="flex gap-2">
            <select
              value={movePersonaId}
              onChange={(e) => setMovePersonaId(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-[rgba(176,138,204,0.3)] bg-white px-2 py-1.5 text-[12px] text-[#5a4060] focus:border-[rgba(176,138,204,0.6)] focus:outline-none"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              <option value="">移动到人格…</option>
              {personas?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.avatar} {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleMoveToPersona}
              disabled={selected.size === 0 || !movePersonaId}
              className="flex shrink-0 items-center gap-1 rounded-xl border border-[rgba(176,138,204,0.3)] bg-[rgba(176,138,204,0.1)] px-3 py-1.5 text-[12px] text-[#7a5a88] transition hover:bg-[rgba(176,138,204,0.2)] disabled:cursor-not-allowed disabled:opacity-40"
              style={{ fontFamily: 'var(--font-serif)' }}
              title="移动到所选人格"
            >
              确认
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom nav ──────────────────────────────────────────────────── */}
      {!editMode && (
        <div className="border-t border-lavender-100/70">
          <button
            type="button"
            onClick={toggleNav}
            className="flex w-full items-center justify-between px-5 py-2.5 text-[12px] text-[#a090aa] transition hover:text-[#7a5a88]"
            style={{ fontFamily: 'var(--font-serif)' }}
            aria-label={navCollapsed ? '展开功能菜单' : '收起功能菜单'}
          >
            <span>功能</span>
            {navCollapsed ? (
              <ChevronUp size={12} strokeWidth={1.5} />
            ) : (
              <ChevronDown size={12} strokeWidth={1.5} />
            )}
          </button>

          {!navCollapsed && (
            <div className="pb-5">
              {[
                { to: '/home', glyph: '⌂', label: '玄関' },
                { to: '/search', glyph: '⌕', label: '搜索' },
                { to: '/circle', glyph: '○', label: 'OnlyCircle' },
                { to: '/travel', glyph: '☁', label: '阳台' },
                { to: '/consult', glyph: '◈', label: '咨询室' },
                { to: '/body', glyph: '♡', label: '身体' },
                { to: '/billing', glyph: '¥', label: '账单' },
                { to: '/personas', glyph: '◇', label: '人格' },
                { to: '/books', glyph: '☷', label: '书架' },
                { to: '/music', glyph: '♪', label: '音乐' },
                { to: '/styles', glyph: '✦', label: '写作风格' },
                { to: '/memory', glyph: '◎', label: '记忆' },
                { to: '/workshop', glyph: '⚗', label: '炼金工房' },
                { to: '/mcp', glyph: '⌬', label: 'MCP' },
                { to: '/browser', glyph: '◗', label: '浏览器' },
                { to: '/data', glyph: '⇄', label: '导入 / 导出' },
                { to: '/settings', glyph: '⊙', label: 'Endpoints' },
              ].map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => onNavigate?.()}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-5 py-2 text-[13px] transition ${
                      isActive
                        ? 'bg-[rgba(176,138,204,0.08)] text-[#5a4060]'
                        : 'text-[#7a6a82] hover:bg-[rgba(176,138,204,0.04)] hover:text-[#5a4060]'
                    }`
                  }
                  style={{ fontFamily: 'var(--font-serif)' }}
                >
                  <span className="text-sm opacity-60">{item.glyph}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ConversationGroup {
  key: string;
  /** Display name. */
  label: string;
  /** Persona id used when creating new conversations in this group. */
  personaId: string | null;
  persona: Persona | undefined;
  conversations: Conversation[];
}

function groupConversations(
  conversations: Conversation[],
  personas: Persona[],
): ConversationGroup[] {
  const personaById = new Map(personas.map((p) => [p.id, p]));

  // Bucketize. Multi-persona conversations go into '__group__'.
  // Bedroom conversations are hidden — they live on /bedroom/:personaId.
  const buckets = new Map<string, Conversation[]>();
  for (const c of conversations) {
    if (c.room === 'bedroom' || c.room === 'consult') continue;
    let key: string;
    if (c.personaIds && c.personaIds.length >= 2) key = '__group__';
    else key = c.personaId ?? '__none__';
    const arr = buckets.get(key) ?? [];
    arr.push(c);
    buckets.set(key, arr);
  }

  const groups: ConversationGroup[] = [];

  // Always show built-in personas first, in a fixed order, even if empty.
  const pinnedOrder = ['persona_ririchan', 'persona_rhema', 'persona_default'];
  for (const id of pinnedOrder) {
    const persona = personaById.get(id);
    if (!persona) continue;
    const list = (buckets.get(id) ?? []).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
    groups.push({
      key: id,
      label: persona.name,
      personaId: id,
      persona,
      conversations: list,
    });
    buckets.delete(id);
  }

  // Group chats (multi-persona) section, after pinned personas.
  const groupList = buckets.get('__group__');
  if (groupList && groupList.length > 0) {
    groups.push({
      key: '__group__',
      label: '群聊',
      personaId: null,
      persona: undefined,
      conversations: groupList.sort((a, b) => b.updatedAt - a.updatedAt),
    });
    buckets.delete('__group__');
  }

  // Other custom personas next.
  for (const [id, list] of buckets) {
    if (id === '__none__') continue;
    const persona = personaById.get(id);
    groups.push({
      key: id,
      label: persona?.name ?? '未知人格',
      personaId: id,
      persona,
      conversations: list.sort((a, b) => b.updatedAt - a.updatedAt),
    });
  }

  // Conversations with no persona last.
  const noneList = buckets.get('__none__');
  if (noneList && noneList.length > 0) {
    groups.push({
      key: '__none__',
      label: '未分组',
      personaId: null,
      persona: undefined,
      conversations: noneList.sort((a, b) => b.updatedAt - a.updatedAt),
    });
  }

  // Hide groups that are empty AND not pinned.
  return groups.filter(
    (g) => g.conversations.length > 0 || pinnedOrder.includes(g.key),
  );
}
