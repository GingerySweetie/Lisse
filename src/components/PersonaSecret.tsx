import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import type { Persona } from '../types';
import { pickSecretState } from '../lib/persona-state';

interface Props {
  persona: Persona;
  onClose: () => void;
}

export default function PersonaSecret({ persona, onClose }: Props) {
  const [state, setState] = useState(() => pickSecretState(persona.id));

  function reroll() {
    setState(pickSecretState(persona.id));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!state) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/30 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl border border-lavender-200 bg-white/95 shadow-2xl backdrop-blur-md md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-lavender-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ background: persona.color }}
            >
              {persona.avatar}
            </span>
            <span
              className="text-base font-normal italic text-ink-900"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {persona.name}的此刻
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

        <ul className="flex-1 overflow-y-auto px-4 py-3">
          {state.map((s) => (
            <li
              key={s.label}
              className="flex items-start gap-3 border-b border-lavender-100/60 py-3 last:border-b-0"
            >
              <span className="mt-0.5 shrink-0 text-xl leading-none">
                {s.glyph}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-light tracking-wide text-ink-500">
                  {s.label}
                </div>
                <div
                  className="mt-1 text-[15px] italic leading-relaxed text-ink-900"
                  style={{ fontFamily: 'var(--font-serif)' }}
                >
                  {s.value}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex justify-end gap-2 border-t border-lavender-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-ink-500 transition hover:bg-lavender-50"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={reroll}
            className="flex items-center gap-1.5 rounded-lg bg-lavender-200/70 px-3 py-1.5 text-sm text-lavender-600 ring-1 ring-lavender-300/50 transition hover:bg-lavender-300/80 hover:text-ink-900"
          >
            <RefreshCw size={14} />
            再换一组
          </button>
        </div>
      </div>
    </div>
  );
}
