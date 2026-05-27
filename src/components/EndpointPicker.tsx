import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Endpoint } from '../types';

interface Props {
  endpointId: string | null;
  model: string | null;
  onChange: (endpointId: string, model: string) => void;
}

export default function EndpointPicker({ endpointId, model, onChange }: Props) {
  const endpoints = useLiveQuery(() => db.endpoints.toArray(), [], []);

  const selected: Endpoint | undefined = endpoints?.find(
    (e) => e.id === endpointId,
  );

  function handleEndpoint(id: string) {
    const ep = endpoints?.find((e) => e.id === id);
    if (!ep) return;
    const firstModel = ep.chatModels[0] ?? '';
    onChange(id, firstModel);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select
        value={endpointId ?? ''}
        onChange={(e) => handleEndpoint(e.target.value)}
        className="rounded-lg border border-lavender-200 bg-white px-2 py-1.5 text-ink-700 focus:border-lavender-300"
      >
        <option value="" disabled>
          选 endpoint
        </option>
        {endpoints?.map((ep) => (
          <option key={ep.id} value={ep.id}>
            {ep.name}
          </option>
        ))}
      </select>
      {selected && selected.chatModels.length > 0 && (
        <select
          value={model ?? ''}
          onChange={(e) => onChange(selected.id, e.target.value)}
          className="max-w-[55vw] truncate rounded-lg border border-lavender-200 bg-white px-2 py-1.5 text-ink-700 focus:border-lavender-300"
        >
          {selected.chatModels.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
