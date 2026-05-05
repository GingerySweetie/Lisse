import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';

interface Props {
  personaId: string | null;
  onChange: (personaId: string | null) => void;
}

export default function PersonaPicker({ personaId, onChange }: Props) {
  const personas = useLiveQuery(() => db.personas.toArray(), [], []);
  const selected = personas?.find((p) => p.id === personaId);

  return (
    <div className="flex items-center gap-1.5 text-sm">
      {selected && (
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold"
          style={{ background: selected.color, color: 'white' }}
          aria-hidden="true"
        >
          {selected.avatar}
        </span>
      )}
      <select
        value={personaId ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded-lg border border-lavender-200 bg-white px-2 py-1.5 text-ink-700 focus:border-mint-300"
      >
        <option value="">无人格</option>
        {personas?.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
