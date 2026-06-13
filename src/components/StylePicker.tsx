import { useLiveQuery } from 'dexie-react-hooks';
import { Wand2 } from 'lucide-react';
import { db } from '../db';

interface Props {
  styleId: string | null;
  onChange: (styleId: string | null) => void;
}

export default function StylePicker({ styleId, onChange }: Props) {
  const styles = useLiveQuery(
    () => db.writingStyles.orderBy('createdAt').toArray(),
    [],
    [],
  );

  const active = styles?.find((s) => s.id === styleId) ?? null;
  const activeLabel = active?.shortLabel ?? active?.name ?? '默认';

  return (
    <div className="flex items-center gap-2 text-sm">
      {/* Active-style chip — mirrors the persona row's leading avatar,
          so "current style" is visible at a glance instead of having
          to read the dropdown's current option. */}
      <span
        className="flex shrink-0 items-center gap-1 rounded-full bg-lavender-100 px-2 py-0.5 text-xs text-ink-700"
        title={active?.description ?? activeLabel}
      >
        <Wand2 size={11} className="text-lavender-600" aria-hidden="true" />
        <span className="max-w-[5em] truncate">{activeLabel}</span>
      </span>
      <select
        value={styleId ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="min-w-0 flex-1 rounded-lg border border-lavender-200 bg-white px-2 py-1.5 text-ink-700 focus:border-lavender-300"
        aria-label="写作风格"
      >
        <option value="">默认</option>
        {styles?.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
