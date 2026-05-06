import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { hasSecretState } from '../lib/persona-state';
import PersonaSecret from './PersonaSecret';

interface Props {
  personaId: string | null;
  onChange: (personaId: string | null) => void;
}

export default function PersonaPicker({ personaId, onChange }: Props) {
  const personas = useLiveQuery(() => db.personas.toArray(), [], []);
  const selected = personas?.find((p) => p.id === personaId);

  const avatarRef = useRef<HTMLButtonElement>(null);
  const [secretOpen, setSecretOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const secretEnabled = selected ? hasSecretState(selected.id) : false;

  function openSecret() {
    if (!secretEnabled) return;
    setAnchorRect(avatarRef.current?.getBoundingClientRect() ?? null);
    setSecretOpen(true);
  }

  return (
    <div className="flex items-center gap-1.5 text-sm">
      {selected && (
        <button
          ref={avatarRef}
          type="button"
          onClick={openSecret}
          tabIndex={secretEnabled ? 0 : -1}
          aria-label={
            secretEnabled
              ? `查看 ${selected.name} 的此刻`
              : selected.name
          }
          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white transition ${
            secretEnabled
              ? 'cursor-pointer hover:scale-110 hover:shadow-[0_0_0_2px_rgba(255,255,255,0.6)]'
              : 'cursor-default'
          }`}
          style={{ background: selected.color }}
        >
          {selected.avatar}
        </button>
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

      {secretOpen && selected && (
        <PersonaSecret
          persona={selected}
          anchorRect={anchorRect}
          onClose={() => setSecretOpen(false)}
        />
      )}
    </div>
  );
}
