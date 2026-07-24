import { useEffect, useRef, useState } from 'react';
import { BEDROOM_THEMES } from '../lib/bedroom-themes';

/**
 * Chat-skin picker — the four bedroom “灯色” palettes, now selectable from
 * the general chat LeafMenu as 皮肤. Null clears back to the default
 * wisteria chat look.
 */

interface Props {
  value?: string | null;
  onChange: (next: string | null) => void;
}

export default function SkinPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = BEDROOM_THEMES.find((t) => t.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 items-center gap-1.5 rounded-full px-1.5 text-ink-500 transition hover:bg-lavender-50 hover:text-ink-700"
        aria-label="聊天皮肤"
        title="聊天皮肤"
      >
        <span
          className="h-3.5 w-3.5 rounded-full ring-1 ring-lavender-200"
          style={{
            background: current
              ? `linear-gradient(135deg, ${current.bg}, ${current.ac})`
              : 'linear-gradient(135deg, hsl(268,32%,93%), hsl(272,28%,78%))',
          }}
        />
        <span
          style={{
            fontSize: 11,
            letterSpacing: '0.04em',
            fontFamily: 'var(--font-serif)',
            color: 'hsla(268, 22%, 40%, 0.85)',
          }}
        >
          {current?.name ?? '默认'}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 flex w-44 flex-col gap-2 rounded-2xl border border-lavender-100 bg-white/95 p-3 shadow-lg backdrop-blur-md">
          <div className="text-[11px] font-light text-ink-500">
            挑一副皮肤（对话独立）
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[12px] transition hover:bg-lavender-50 ${
              !current ? 'ring-1 ring-ink-400' : ''
            }`}
          >
            <span
              className="h-5 w-5 shrink-0 rounded-full ring-1 ring-lavender-200"
              style={{
                background:
                  'linear-gradient(135deg, hsl(268,32%,93%), hsl(272,28%,78%))',
              }}
            />
            <span>默认</span>
          </button>
          {BEDROOM_THEMES.map((t) => {
            const isOn = current?.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onChange(isOn ? null : t.id);
                  setOpen(false);
                }}
                className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[12px] transition hover:bg-lavender-50 ${
                  isOn ? 'ring-1 ring-ink-400' : ''
                }`}
                title={t.name}
              >
                <span
                  className="h-5 w-5 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{
                    background: `linear-gradient(135deg, ${t.bg}, ${t.ac})`,
                  }}
                />
                <span style={{ color: isOn ? t.ac : undefined }}>{t.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
