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

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <Wand2 size={14} className="shrink-0 text-ink-500" aria-hidden="true" />
      <select
        value={styleId ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded-lg border border-lavender-200 bg-white px-2 py-1.5 text-ink-700 focus:border-mint-300"
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
