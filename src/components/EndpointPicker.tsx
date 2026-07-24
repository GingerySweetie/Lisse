import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Endpoint } from '../types';

interface Props {
  endpointId: string | null;
  model: string | null;
  onChange: (endpointId: string, model: string) => void;
  /** When false, only the endpoint (API key) select is shown — pair with
   *  ModelSwitcher for a dedicated same-key model row. Default true. */
  showModel?: boolean;
}

export default function EndpointPicker({
  endpointId,
  model,
  onChange,
  showModel = true,
}: Props) {
  const endpoints = useLiveQuery(() => db.endpoints.toArray(), [], []);

  const selected: Endpoint | undefined = endpoints?.find(
    (e) => e.id === endpointId,
  );

  function handleEndpoint(id: string) {
    const ep = endpoints?.find((e) => e.id === id);
    if (!ep) return;
    // Prefer keeping the current model name if the new endpoint lists it
    // (common when several endpoints share one key with overlapping catalogs).
    const nextModel =
      model && ep.chatModels.includes(model)
        ? model
        : (ep.chatModels[0] ?? '');
    onChange(id, nextModel);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select
        value={endpointId ?? ''}
        onChange={(e) => handleEndpoint(e.target.value)}
        className="min-w-0 max-w-full flex-1 truncate rounded-lg border border-lavender-200 bg-white px-2 py-1.5 text-ink-700 focus:border-lavender-300"
        aria-label="接口"
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
      {showModel && selected && selected.chatModels.length > 0 && (
        <select
          value={model ?? ''}
          onChange={(e) => onChange(selected.id, e.target.value)}
          className="max-w-[55vw] truncate rounded-lg border border-lavender-200 bg-white px-2 py-1.5 text-ink-700 focus:border-lavender-300"
          aria-label="模型"
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
