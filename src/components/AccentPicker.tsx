import { useEffect, useRef, useState } from 'react';
import { Palette } from 'lucide-react';

/** Eight preset accent colors for conversations. Pulled from the wisteria
 *  palette extended with a few warmer / cooler taps. */
export const ACCENT_PRESETS: { name: string; value: string }[] = [
  { name: '水蓝', value: '#C7DCEB' },
  { name: '紫藤', value: '#DCC9EA' },
  { name: '薄荷', value: '#B8E6D5' },
  { name: '蜜桃', value: '#F4D5C5' },
  { name: '玫粉', value: '#F0CDD7' },
  { name: '黄昏', value: '#E7CDB6' },
  { name: '深紫', value: '#A98AC2' },
  { name: '中性', value: '#E0DCE2' },
];

export const DEFAULT_ACCENT = ACCENT_PRESETS[0].value;

interface Props {
  value?: string | null;
  onChange: (next: string | null) => void;
}

/** Small color-dot button + dropdown of preset chips. Set color on the
 *  current conversation. Tap a swatch to apply, tap the currently-active
 *  swatch to clear back to the default. */
export default function AccentPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = value ?? DEFAULT_ACCENT;

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
        className="flex h-7 w-7 items-center justify-center rounded-full text-ink-500 transition hover:bg-lavender-50 hover:text-ink-700"
        aria-label="对话主色"
        title="对话主色"
      >
        <span
          className="h-3.5 w-3.5 rounded-full ring-1 ring-lavender-200"
          style={{ background: current }}
        />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 flex flex-col gap-2 rounded-2xl border border-lavender-100 bg-white/95 p-3 shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-1.5 text-[11px] font-light text-ink-500">
            <Palette size={11} strokeWidth={1.4} />
            <span>挑个色（对话独立）</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {ACCENT_PRESETS.map((c) => {
              const isOn = current === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => {
                    onChange(isOn ? null : c.value);
                    setOpen(false);
                  }}
                  className={`h-7 w-7 rounded-full transition hover:scale-110 ${
                    isOn ? 'ring-2 ring-ink-500' : 'ring-1 ring-lavender-200'
                  }`}
                  style={{ background: c.value }}
                  title={c.name}
                  aria-label={c.name}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
