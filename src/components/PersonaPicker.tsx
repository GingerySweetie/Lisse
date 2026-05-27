import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Users } from 'lucide-react';
import { db } from '../db';
import { hasSecretState } from '../lib/persona-state';
import PersonaSecret from './PersonaSecret';
import GroupSetup from './GroupSetup';

interface Props {
  /** Currently active responder persona id. */
  personaId: string | null;
  onChange: (personaId: string | null) => void;
  /** When non-empty, the conversation is in group mode; only these
   *  personas appear in the responder dropdown. */
  groupPersonaIds?: string[];
  onChangeGroup?: (next: string[]) => void;
  /** Recent conversation text used to mood-bias the persona-state popover. */
  contextText?: string;
}

export default function PersonaPicker({
  personaId,
  onChange,
  groupPersonaIds,
  onChangeGroup,
  contextText,
}: Props) {
  const personas = useLiveQuery(() => db.personas.toArray(), [], []);
  const selected = personas?.find((p) => p.id === personaId);

  const [secretOpen, setSecretOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const secretEnabled = selected ? hasSecretState(selected.id) : false;

  const inGroup = (groupPersonaIds ?? []).length >= 2;
  const visiblePersonas = inGroup
    ? (personas ?? []).filter((p) => groupPersonaIds!.includes(p.id))
    : personas ?? [];

  return (
    <div className="flex items-center gap-1.5 text-sm">
      {selected && (
        <button
          type="button"
          onClick={() => secretEnabled && setSecretOpen(true)}
          tabIndex={secretEnabled ? 0 : -1}
          aria-label={
            secretEnabled ? `查看 ${selected.name} 的此刻` : selected.name
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
        className="rounded-lg border border-lavender-200 bg-white px-2 py-1.5 text-ink-700 focus:border-lavender-300"
      >
        {!inGroup && <option value="">无人格</option>}
        {visiblePersonas.map((p) => (
          <option key={p.id} value={p.id}>
            {inGroup ? `→ ${p.name}` : p.name}
          </option>
        ))}
      </select>
      {onChangeGroup && (
        <button
          type="button"
          onClick={() => setGroupOpen(true)}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition ${
            inGroup
              ? 'bg-lavender-200/70 text-lavender-600 ring-1 ring-lavender-300/50'
              : 'text-ink-500 hover:bg-lavender-50 hover:text-ink-700'
          }`}
          aria-label="管理群聊成员"
          title={inGroup ? '管理群聊成员' : '加人变成群聊'}
        >
          <Users size={14} />
        </button>
      )}

      {secretOpen && selected && (
        <PersonaSecret
          persona={selected}
          contextText={contextText}
          onClose={() => setSecretOpen(false)}
        />
      )}

      {groupOpen && onChangeGroup && (
        <GroupSetup
          personaIds={groupPersonaIds ?? (personaId ? [personaId] : [])}
          onChange={onChangeGroup}
          onClose={() => setGroupOpen(false)}
        />
      )}
    </div>
  );
}
