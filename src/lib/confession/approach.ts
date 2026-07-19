import type { ConfessionEntry } from '../../types';
import {
  CATCH_CHANCE,
  CATCH_COOLDOWN_MS,
  PITY_CAP,
  PITY_PER_MISS,
  RIRICHAN_ID,
} from './defaults';
import {
  fallbackAsEntry,
  pickFallbackDesire,
  pickSealedLine,
} from './fallback';
import { formatLocalDate } from './format';
import { getConfessionEntry } from './store';
import { writePersonaConfession } from './write';
import { db } from '../../db';

const STORAGE_KEY = 'lisse-confession-approach';

interface ApproachState {
  lastCatchAt?: number;
  approachCount?: number;
}

function readApproachState(): ApproachState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ApproachState;
  } catch {
    return {};
  }
}

function writeApproachState(s: ApproachState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export type ApproachResult =
  | { kind: 'sealed'; line: string; whisper?: string }
  | { kind: 'caught'; entry: ConfessionEntry; archived: boolean };

/**
 * Roll catch chance. On hit, prefer today's archived/generated confession;
 * fall back to a static vignette if the model has nothing.
 */
export async function approachConfession(opts?: {
  force?: boolean;
  personaId?: string;
}): Promise<ApproachResult> {
  const personaId = opts?.personaId ?? RIRICHAN_ID;
  const force = !!opts?.force;
  const state = readApproachState();
  const now = Date.now();
  const onCooldown =
    !force &&
    typeof state.lastCatchAt === 'number' &&
    now - state.lastCatchAt < CATCH_COOLDOWN_MS;

  const approaches = (state.approachCount ?? 0) + 1;
  const pity = Math.min(PITY_CAP, (state.approachCount ?? 0) * PITY_PER_MISS);
  const chance = onCooldown ? 0 : CATCH_CHANCE + pity;
  const hit = force || Math.random() < chance;

  if (!hit) {
    writeApproachState({ ...state, approachCount: approaches });
    const today = formatLocalDate(new Date());
    const todayEntry = await getConfessionEntry(today, personaId);
    const whisper =
      todayEntry?.status === 'done' && todayEntry.confession
        ? whisperFrom(todayEntry)
        : Math.random() < 0.35
          ? '「……他不知道我……」'
          : undefined;
    return { kind: 'sealed', line: pickSealedLine(), whisper };
  }

  writeApproachState({
    lastCatchAt: now,
    approachCount: 0,
  });

  const today = formatLocalDate(new Date());
  const existing = await getConfessionEntry(today, personaId);
  if (existing?.status === 'done' && existing.confession.trim()) {
    return { kind: 'caught', entry: existing, archived: true };
  }

  // Try to generate from today's chat on catch.
  const persona = await db.personas.get(personaId);
  if (persona) {
    const written = await writePersonaConfession({
      persona,
      date: today,
      force: true,
    });
    if (written?.status === 'done' && written.confession.trim()) {
      return { kind: 'caught', entry: written, archived: true };
    }
  }

  return {
    kind: 'caught',
    entry: fallbackAsEntry(pickFallbackDesire()),
    archived: false,
  };
}

function whisperFrom(entry: ConfessionEntry): string {
  const body = entry.confession.replace(/\s+/g, '');
  const slice = body.slice(0, 18);
  return `「……${slice}……」`;
}
