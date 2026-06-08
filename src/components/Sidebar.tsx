import { useMemo, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Trash2 } from 'lucide-react';
import { db } from '../db';
import { createConversation, deleteConversation } from '../lib/chat';
import { relativeTime } from '../lib/format';
import type { Conversation, Persona } from '../types';
import WisteriaMark from './WisteriaMark';

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
          <button
            type="button"
            onClick={() => onNavigate?.()}
            className="text-lg text-ink-500/80 transition hover:text-ink-700 md:hidden"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <button
          type="button"
          onClick={() => handleNewInGroup(null)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(176,138,204,0.2)] bg-[rgba(176,138,204,0.12)] px-4 py-2.5 text-[13px] font-light text-[#7a5a88] transition hover:bg-[rgba(176,138,204,0.18)]"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          <span className="text-base font-light">＋</span>
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

        <div className="flex flex-col">
          {groups.map((g) => {
            const isCollapsed = collapsed[g.key] ?? false;
            const dotColor = g.persona?.color ?? '#a0a0a0';
            return (
              <section key={g.key} className="group/section">
                <header className="flex items-center gap-2 px-5 py-2">
                  <button
                    type="button"
                    onClick={() => toggle(g.key)}
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
                  <button
                    type="button"
                    onClick={() => handleNewInGroup(g.personaId)}
                    className="rounded-full p-1 text-ink-500/70 opacity-0 transition hover:bg-lavender-100 hover:text-ink-900 group-hover/section:opacity-100 pointer-coarse:opacity-70"
                    aria-label={`在 ${g.label} 中新建对话`}
                    title={`在 ${g.label} 中新建对话`}
                  >
                    <span className="text-sm">＋</span>
                  </button>
                </header>
                {!isCollapsed && (
                  <ul className="flex flex-col">
                    {g.conversations.map((conv) => {
                      const isActive = conv.id === activeId;
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

      <div className="border-t border-lavender-100/70 py-2 pb-5">
        {[
          { to: '/home', glyph: '⌂', label: '玄関' },
          { to: '/body', glyph: '♡', label: '身体' },
          { to: '/billing', glyph: '¥', label: '账单' },
          { to: '/personas', glyph: '◇', label: '人格' },
          { to: '/books', glyph: '☷', label: '书架' },
          { to: '/styles', glyph: '✦', label: '写作风格' },
          { to: '/memory', glyph: '◎', label: '记忆' },
          { to: '/data', glyph: '⇄', label: '导入 / 导出' },
          { to: '/settings', glyph: '⊙', label: 'Endpoints' },
        ].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => onNavigate?.()}
            className={({ isActive }) =>
              `flex items-center gap-3 px-5 py-2.5 text-[13px] transition ${
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
    if (c.room === 'bedroom') continue;
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
