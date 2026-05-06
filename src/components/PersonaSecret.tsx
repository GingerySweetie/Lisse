import { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import type { Persona } from '../types';
import { pickSecretState } from '../lib/persona-state';

interface Props {
  persona: Persona;
  onClose: () => void;
  /** Anchor element for positioning; pop appears below it. */
  anchorRect: DOMRect | null;
}

export default function PersonaSecret({ persona, onClose, anchorRect }: Props) {
  const [state, setState] = useState(() => pickSecretState(persona.id));
  const ref = useRef<HTMLDivElement>(null);

  function reroll() {
    setState(pickSecretState(persona.id));
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (!state) return null;

  const top = anchorRect ? anchorRect.bottom + 6 : 80;
  const left = anchorRect
    ? Math.max(8, Math.min(window.innerWidth - 320, anchorRect.left))
    : 12;

  return (
    <div
      ref={ref}
      className="fixed z-50 w-[min(20rem,calc(100vw-1rem))] rounded-2xl border border-lavender-200 bg-white/95 p-4 shadow-xl backdrop-blur-md"
      style={{ top, left }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ background: persona.color }}
          >
            {persona.avatar}
          </span>
          <span
            className="text-sm font-normal italic text-ink-900"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {persona.name}的此刻
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-ink-500 transition hover:bg-lavender-50"
          aria-label="关闭"
        >
          <X size={14} />
        </button>
      </div>

      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {state.map((s) => (
          <li key={s.label} className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-base leading-none">
              {s.glyph}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-light tracking-wide text-ink-500">
                {s.label}
              </div>
              <div
                className="text-[14px] italic leading-relaxed text-ink-900"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                {s.value}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={reroll}
          className="flex items-center gap-1.5 rounded-full bg-lavender-100 px-3 py-1 text-xs text-lavender-600 transition hover:bg-lavender-200/80"
        >
          <RefreshCw size={12} />
          再换一组
        </button>
      </div>
    </div>
  );
}
