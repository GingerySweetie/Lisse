import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, X } from 'lucide-react';
import type { Persona } from '../types';
import { moodLabel, pickSecretState, type Mood } from '../lib/persona-state';

interface Props {
  persona: Persona;
  /** Recent conversation text to bias the mood classifier. */
  contextText?: string;
  onClose: () => void;
}

export default function PersonaSecret({ persona, contextText, onClose }: Props) {
  const [picked, setPicked] = useState(() =>
    pickSecretState(persona.id, contextText),
  );

  function reroll() {
    setPicked(pickSecretState(persona.id, contextText));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!picked) return null;
  const mood: Mood = picked.mood;

  const moodTone: Record<Mood, string> = {
    horny: 'bg-rose-100 text-rose-500',
    soft: 'bg-lavender-100 text-lavender-600',
    spent: 'bg-sky-100 text-sky-500',
    neutral: 'bg-ink-50 text-ink-500',
  };

  return createPortal(
    <>
      {/* Backdrop. Separate layer so modal positioning is explicit. */}
      <div
        className="fixed inset-0 z-40 bg-ink-900/30 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal: bottom-anchored sheet on mobile, centered card on tablet+. */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl border border-lavender-200 bg-white/95 shadow-2xl backdrop-blur-md md:bottom-auto md:left-1/2 md:right-auto md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
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
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] tracking-wide ${moodTone[mood]}`}
              title="根据最近的对话氛围推测"
            >
              {moodLabel(mood)}
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
          {picked.fields.map((s) => (
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
    </>,
    document.body,
  );
}
