import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, Users, AlertCircle } from 'lucide-react';
import { db } from '../db';
import { newId } from '../lib/id';
import type { Conversation } from '../types';

interface Props {
  onClose: () => void;
  onCreated: (conv: Conversation) => void;
}

/**
 * 新建群聊：选 2+ 个 persona，给每个 persona 单独配 endpoint + model，
 * 然后开一个新会话。和卧室/客厅 singleton 不同——每次点都开新的，
 * 历史进侧栏。第一个被选中的 persona 是默认发言者。
 *
 * 模型不预填——群聊的卖点就是"一个人格一条模型"，强制手动挑，
 * 顺便检测重复并警告。
 */
export default function GroupChatSetup({ onClose, onCreated }: Props) {
  const personas = useLiveQuery(() => db.personas.toArray(), [], []);
  const endpoints = useLiveQuery(() => db.endpoints.toArray(), [], []);

  const [selected, setSelected] = useState<string[]>([]);
  const [models, setModels] = useState<
    Record<string, { endpointId: string; model: string }>
  >({});
  const [busy, setBusy] = useState(false);

  function toggle(personaId: string) {
    setSelected((prev) => {
      if (prev.includes(personaId)) {
        const next = prev.filter((id) => id !== personaId);
        setModels((m) => {
          const { [personaId]: _, ...rest } = m;
          return rest;
        });
        return next;
      }
      return [...prev, personaId];
    });
  }

  function setPersonaModel(personaId: string, epId: string, model: string) {
    setModels((m) => ({ ...m, [personaId]: { endpointId: epId, model } }));
  }

  /** Set of (endpointId|model) keys that appear more than once. */
  const dupedKeys = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const id of selected) {
      const m = models[id];
      if (!m || !m.endpointId || !m.model) continue;
      const k = `${m.endpointId}|${m.model}`;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return new Set(Object.entries(counts).filter(([, n]) => n > 1).map(([k]) => k));
  }, [selected, models]);

  const hasDupes = dupedKeys.size > 0;

  const canCreate = useMemo(
    () =>
      selected.length >= 2 &&
      selected.every((id) => {
        const m = models[id];
        return m && m.endpointId && m.model;
      }),
    [selected, models],
  );

  async function create() {
    if (!canCreate || busy) return;
    setBusy(true);
    try {
      const orderedPersonas = (personas ?? []).filter((p) => selected.includes(p.id));
      const first = orderedPersonas[0];
      const firstModel = models[first.id];
      const title = orderedPersonas.map((p) => p.name).join(' · ');
      const now = Date.now();
      const conv: Conversation = {
        id: newId(),
        title,
        currentLeafId: null,
        personaId: first.id,
        personaIds: orderedPersonas.map((p) => p.id),
        personaModels: models,
        defaultEndpointId: firstModel.endpointId,
        defaultModel: firstModel.model,
        source: 'native',
        createdAt: now,
        updatedAt: now,
      };
      await db.conversations.add(conv);
      onCreated(conv);
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/30 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white/95 shadow-xl backdrop-blur-md md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-lavender-100 px-5 py-4">
          <div>
            <h3 className="flex items-center gap-1.5 text-lg font-semibold text-ink-900">
              <Users size={16} className="text-lavender-600" /> 新建群聊
            </h3>
            <p className="mt-1 text-xs text-ink-500">
              挑两个或更多 persona，每个独立选模型。每次新建都是新会话。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full p-1 text-ink-500 transition hover:bg-lavender-50 disabled:opacity-40"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {!personas || personas.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-ink-500">
              还没有人格。先去「人格」页加几个。
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {personas.map((p) => {
                const on = selected.includes(p.id);
                const cfg = models[p.id];
                const ep = endpoints?.find((e) => e.id === cfg?.endpointId);
                const isDuped =
                  on &&
                  cfg?.endpointId &&
                  cfg?.model &&
                  dupedKeys.has(`${cfg.endpointId}|${cfg.model}`);
                return (
                  <li
                    key={p.id}
                    className={`flex flex-col gap-2 rounded-xl border px-3 py-2.5 transition ${
                      isDuped
                        ? 'border-amber-300 bg-amber-50/60'
                        : on
                          ? 'border-lavender-300 bg-lavender-50/70'
                          : 'border-lavender-100 bg-white'
                    }`}
                  >
                    <label className="flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(p.id)}
                        disabled={busy}
                        className="h-4 w-4 accent-lavender-400"
                      />
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                        style={{ background: p.color }}
                      >
                        {p.avatar}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-ink-900">{p.name}</div>
                        {on && selected[0] === p.id && (
                          <div className="text-[10px] text-lavender-600">
                            ★ 默认发言者
                          </div>
                        )}
                      </div>
                    </label>
                    {on && (
                      <div className="flex flex-wrap items-center gap-2 pl-7">
                        <select
                          value={cfg?.endpointId ?? ''}
                          onChange={(e) => {
                            const epId = e.target.value;
                            const target = endpoints?.find((x) => x.id === epId);
                            const firstModel = target?.chatModels[0] ?? '';
                            setPersonaModel(p.id, epId, firstModel);
                          }}
                          disabled={busy}
                          className="max-w-[40%] truncate rounded-lg border border-lavender-200 bg-white px-2 py-1 text-xs focus:border-lavender-300"
                        >
                          <option value="">选 endpoint</option>
                          {endpoints?.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={cfg?.model ?? ''}
                          onChange={(e) =>
                            setPersonaModel(p.id, cfg?.endpointId ?? '', e.target.value)
                          }
                          disabled={busy || !ep}
                          className="max-w-[55%] flex-1 truncate rounded-lg border border-lavender-200 bg-white px-2 py-1 text-xs focus:border-lavender-300 disabled:opacity-50"
                        >
                          <option value="">选 model</option>
                          {ep?.chatModels.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-lavender-100 bg-lavender-50/40 px-5 py-3">
          {hasDupes && (
            <div className="mb-2 flex items-start gap-1.5 text-xs text-amber-600">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>
                有重复模型——群聊建议一个人格一条模型，区分度会更高。
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-ink-500">
              {selected.length === 0
                ? '至少选 2 个 persona'
                : selected.length === 1
                  ? '再选一个 persona'
                  : `已选 ${selected.length} 个`}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-lg border border-lavender-200 px-4 py-2 text-sm text-ink-700 transition hover:bg-lavender-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={create}
                disabled={!canCreate || busy}
                className="rounded-lg bg-lavender-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-300 disabled:opacity-50"
              >
                {busy ? '开聊…' : '开聊'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
