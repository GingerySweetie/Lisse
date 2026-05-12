import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, Users } from 'lucide-react';
import { db } from '../db';

interface Props {
  /** Currently active persona ids in this conversation. */
  personaIds: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
}

export default function GroupSetup({ personaIds, onChange, onClose }: Props) {
  const personas = useLiveQuery(() => db.personas.toArray(), [], []);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(personaIds),
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function apply() {
    onChange(Array.from(selected));
    onClose();
  }

  const count = selected.size;
  const summary =
    count === 0
      ? '没人在场'
      : count === 1
        ? '单人对话'
        : `${count} 人群聊`;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40 bg-ink-900/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl border border-lavender-200 bg-white/95 shadow-2xl backdrop-blur-md md:bottom-auto md:left-1/2 md:right-auto md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-lavender-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-lavender-600" />
            <span
              className="text-base font-normal italic text-ink-900"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              这个对话里有谁
            </span>
            <span className="rounded-full bg-lavender-100 px-2 py-0.5 text-xs text-lavender-600">
              {summary}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-ink-500 transition hover:bg-lavender-50"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {personas?.map((p) => {
            const isOn = selected.has(p.id);
            return (
              <button
                type="button"
                key={p.id}
                onClick={() => toggle(p.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                  isOn ? 'bg-lavender-50' : 'hover:bg-lavender-50/60'
                }`}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{ background: p.color }}
                >
                  {p.avatar}
                </span>
                <span className="flex-1 truncate text-sm text-ink-900">
                  {p.name}
                </span>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    isOn
                      ? 'bg-lavender-300 text-white'
                      : 'border border-lavender-200'
                  }`}
                >
                  {isOn && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2.5 6L5 8.5L9.5 3.5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 border-t border-lavender-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-ink-500 transition hover:bg-lavender-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={apply}
            className="rounded-lg bg-lavender-200/70 px-4 py-1.5 text-sm text-lavender-600 ring-1 ring-lavender-300/50 transition hover:bg-lavender-300/80 hover:text-ink-900"
          >
            应用
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
