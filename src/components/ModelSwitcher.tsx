import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';

/**
 * Switch chat models under the currently selected endpoint (same API key /
 * base URL). Shown as a compact chip row in the LeafMenu so users can
 * hop between models without re-picking the endpoint.
 */

interface Props {
  endpointId: string | null;
  model: string | null;
  onChange: (model: string) => void;
}

export default function ModelSwitcher({ endpointId, model, onChange }: Props) {
  const endpoints = useLiveQuery(() => db.endpoints.toArray(), [], []);
  const selected = endpoints?.find((e) => e.id === endpointId);
  const models = selected?.chatModels ?? [];

  if (!endpointId) {
    return (
      <span
        style={{
          fontSize: 11,
          color: 'hsla(268, 20%, 50%, 0.65)',
          fontFamily: 'var(--font-serif)',
        }}
      >
        先选接口
      </span>
    );
  }

  if (models.length === 0) {
    return (
      <span
        style={{
          fontSize: 11,
          color: 'hsla(268, 20%, 50%, 0.65)',
          fontFamily: 'var(--font-serif)',
        }}
      >
        此接口未配置模型
      </span>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        maxHeight: 120,
        overflowY: 'auto',
      }}
      role="listbox"
      aria-label="切换模型"
    >
      {models.map((m) => {
        const on = model === m;
        return (
          <button
            key={m}
            type="button"
            role="option"
            aria-selected={on}
            onClick={() => onChange(m)}
            title={m}
            style={{
              fontSize: 11,
              lineHeight: 1.2,
              letterSpacing: '0.02em',
              padding: '5px 9px',
              borderRadius: 999,
              border: on
                ? '1px solid hsla(268, 35%, 55%, 0.55)'
                : '1px solid hsla(270, 25%, 78%, 0.55)',
              background: on
                ? 'hsla(270, 40%, 92%, 0.98)'
                : 'hsla(270, 30%, 97%, 0.9)',
              color: on
                ? 'hsla(268, 35%, 32%, 0.95)'
                : 'hsla(268, 22%, 40%, 0.85)',
              cursor: 'pointer',
              fontFamily: 'var(--font-serif)',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {shortModelName(m)}
          </button>
        );
      })}
    </div>
  );
}

/** Trim common provider prefixes so chips stay readable in the narrow menu. */
function shortModelName(id: string): string {
  const trimmed = id.trim();
  if (trimmed.length <= 28) return trimmed;
  const parts = trimmed.split('/');
  const leaf = parts[parts.length - 1] || trimmed;
  return leaf.length <= 28 ? leaf : `${leaf.slice(0, 26)}…`;
}
