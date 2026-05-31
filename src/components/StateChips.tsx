import { useEffect, useState } from 'react';
import {
  QUICK_STATES,
  clearQuickState,
  getActiveQuickState,
  setQuickState,
  type QuickStateKey,
  type QuickStateEntry,
} from '../lib/behavior';

const ORDER: QuickStateKey[] = [
  'tired',
  'wired',
  'period',
  'hungry',
  'sad',
  'energetic',
];

/**
 * Tiny 1-tap mood chips, shown in a horizontal row above the chat input.
 * Tapping sets a state with a 6h TTL that gets injected into the system
 * prompt by inferStatus(). Tapping the active state again clears it.
 */
export default function StateChips() {
  const [active, setActive] = useState<QuickStateEntry | null>(null);

  useEffect(() => {
    setActive(getActiveQuickState());
    const t = setInterval(() => setActive(getActiveQuickState()), 60_000);
    return () => clearInterval(t);
  }, []);

  function toggle(key: QuickStateKey) {
    if (active?.key === key) {
      clearQuickState();
      setActive(null);
      return;
    }
    setQuickState(key);
    setActive(getActiveQuickState());
  }

  return (
    <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 py-1 text-xs">
      {ORDER.map((k) => {
        const def = QUICK_STATES[k];
        const isOn = active?.key === k;
        return (
          <button
            key={k}
            type="button"
            onClick={() => toggle(k)}
            className={`quick-tag shrink-0 ${isOn ? 'is-on' : ''}`}
            style={
              isOn
                ? {
                    fontFamily: 'var(--font-serif)',
                    background: 'var(--lav-200)',
                    color: 'var(--lav-700)',
                  }
                : { fontFamily: 'var(--font-serif)' }
            }
          >
            {def.label}
          </button>
        );
      })}
    </div>
  );
}
