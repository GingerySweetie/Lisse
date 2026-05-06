import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Brain, Database, MessageSquarePlus, Settings, Trash2, Users } from 'lucide-react';
import { db } from '../db';
import { createConversation, deleteConversation } from '../lib/chat';
import { relativeTime } from '../lib/format';

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const { conversationId } = useParams();

  const conversations = useLiveQuery(
    () => db.conversations.orderBy('updatedAt').reverse().toArray(),
    [],
    [],
  );

  async function handleNew() {
    const conv = await createConversation();
    navigate(`/chat/${conv.id}`);
    onNavigate?.();
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('删除这个对话？此操作不可撤销喵。')) return;
    await deleteConversation(id);
    if (conversationId === id) navigate('/chat');
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-lavender-100 px-4 py-3">
        <h1 className="font-semibold text-ink-900">Lisse</h1>
        <button
          type="button"
          onClick={handleNew}
          className="flex items-center gap-1.5 rounded-lg bg-mint-200 px-3 py-1.5 text-sm font-medium text-ink-700 transition hover:bg-mint-300"
        >
          <MessageSquarePlus size={16} />
          新对话
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {conversations && conversations.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-ink-500">
            还没有对话喵
            <br />
            点上面"新对话"开始
          </div>
        )}
        <ul className="flex flex-col gap-1">
          {conversations?.map((conv) => {
            const isActive = conv.id === conversationId;
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
                    <div className="truncate font-medium">{conv.title}</div>
                    <div className="text-xs text-ink-500">
                      {relativeTime(conv.updatedAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(conv.id, e)}
                    className="invisible shrink-0 rounded p-1 text-ink-500 transition hover:bg-white hover:text-rose-500 group-hover:visible"
                    aria-label="删除对话"
                  >
                    <Trash2 size={14} />
                  </button>
                </NavLink>
              </li>
            );
          })}
        </ul>
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
