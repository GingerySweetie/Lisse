import { useMemo, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Brain,
  ChevronDown,
  ChevronRight,
  Database,
  MessageSquarePlus,
  Plus,
  Settings,
  Trash2,
  Users,
} from 'lucide-react';
import { db } from '../db';
import { createConversation, deleteConversation } from '../lib/chat';
import { relativeTime } from '../lib/format';
import type { Conversation, Persona } from '../types';

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const { conversationId: activeId } = useParams();

  const conversations = useLiveQuery(
    () => db.conversations.orderBy('updatedAt').reverse().toArray(),
    [],
    [],
  );
  const personas = useLiveQuery(() => db.personas.toArray(), [], []);

  // Track which group headers are collapsed. Default: all expanded.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  function toggle(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-lavender-100 px-4 py-3">
        <h1
          className="text-xl font-normal italic tracking-wider text-ink-900"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          Lisse
        </h1>
        <button
          type="button"
          onClick={() => handleNewInGroup(null)}
          className="flex items-center gap-1.5 rounded-full bg-lavender-200/60 px-3 py-1.5 text-sm font-normal text-lavender-600 ring-1 ring-lavender-300/40 backdrop-blur-sm transition hover:bg-lavender-300/70 hover:text-ink-900"
        >
          <MessageSquarePlus size={15} />
          新对话
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {groups.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-ink-500">
            还没有对话喵
            <br />
            点上面"新对话"开始
          </div>
        )}

        <div className="flex flex-col gap-1">
          {groups.map((g) => {
            const isCollapsed = collapsed[g.key] ?? false;
            return (
              <section key={g.key}>
                <header className="group/header flex items-center gap-1 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => toggle(g.key)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs uppercase tracking-wider text-ink-500 transition hover:text-ink-700"
                  >
                    {isCollapsed ? (
                      <ChevronRight size={12} className="shrink-0" />
                    ) : (
                      <ChevronDown size={12} className="shrink-0" />
                    )}
                    {g.persona && (
                      <span
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                        style={{ background: g.persona.color }}
                      >
                        {g.persona.avatar}
                      </span>
                    )}
                    <span className="truncate normal-case tracking-normal">
                      {g.label}
                    </span>
                    <span className="ml-auto shrink-0 rounded-full bg-lavender-50 px-1.5 py-0.5 text-[10px] font-light text-ink-500">
                      {g.conversations.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNewInGroup(g.personaId)}
                    className="rounded-full p-1 text-ink-500 opacity-0 transition hover:bg-lavender-100 hover:text-ink-900 group-hover/header:opacity-100 pointer-coarse:opacity-70"
                    aria-label={`在 ${g.label} 中新建对话`}
                    title={`在 ${g.label} 中新建对话`}
                  >
                    <Plus size={13} />
                  </button>
                </header>
                {!isCollapsed && (
                  <ul className="flex flex-col gap-0.5 pl-1">
                    {g.conversations.map((conv) => {
                      const isActive = conv.id === activeId;
                      return (
                        <li key={conv.id}>
                          <NavLink
                            to={`/chat/${conv.id}`}
                            onClick={() => onNavigate?.()}
                            className={`group flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition ${
                              isActive
                                ? 'bg-lavender-100 text-ink-900'
                                : 'text-ink-700 hover:bg-lavender-50'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-normal">
                                {conv.title}
                              </div>
                              <div className="text-xs font-light text-ink-500">
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

      <div className="flex flex-col gap-0.5 border-t border-lavender-100 px-2 py-2">
        <NavLink
          to="/personas"
          onClick={() => onNavigate?.()}
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
              isActive
                ? 'bg-lavender-100 text-ink-900'
                : 'text-ink-700 hover:bg-lavender-50'
            }`
          }
        >
          <Users size={16} />
          人格
        </NavLink>
        <NavLink
          to="/memory"
          onClick={() => onNavigate?.()}
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
              isActive
                ? 'bg-lavender-100 text-ink-900'
                : 'text-ink-700 hover:bg-lavender-50'
            }`
          }
        >
          <Brain size={16} />
          记忆
        </NavLink>
        <NavLink
          to="/data"
          onClick={() => onNavigate?.()}
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
              isActive
                ? 'bg-lavender-100 text-ink-900'
                : 'text-ink-700 hover:bg-lavender-50'
            }`
          }
        >
          <Database size={16} />
          导入 / 导出
        </NavLink>
        <NavLink
          to="/settings"
          onClick={() => onNavigate?.()}
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
              isActive
                ? 'bg-lavender-100 text-ink-900'
                : 'text-ink-700 hover:bg-lavender-50'
            }`
          }
        >
          <Settings size={16} />
          Endpoints
        </NavLink>
      </div>
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

  // Bucketize.
  const buckets = new Map<string, Conversation[]>();
  for (const c of conversations) {
    const key = c.personaId ?? '__none__';
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
