import { streamChat } from '../../api';
import { db } from '../../db';
import type { Persona, WeeklyDiaryEntry, WeeklyDiarySettings } from '../../types';
import { resolvePersonaChatModel } from '../diary/resolve-model';
import { PENDING_STALE_MS, mergeWeeklyDiaryCfg } from './defaults';
import { extractMemoryFromWeeklyDiary } from './memory';
import {
  buildWeeklyDiarySystemPrompt,
  buildWeeklyDiaryUserPrompt,
} from './prompt';
import {
  completeWeeklyDiary,
  failWeeklyDiary,
  getWeeklyDiaryEntry,
  putPendingWeeklyDiary,
  skipWeeklyDiary,
  weekBoundsFromStart,
} from './store';
import { gatherWeekMaterial } from './transcript';

/**
 * Write (or skip) one persona's weekly diary for a weekStart date.
 * Idempotent for done entries; retries stale pending / error rows.
 */
export async function writePersonaWeeklyDiary(opts: {
  persona: Persona;
  weekStart: string;
  force?: boolean;
}): Promise<WeeklyDiaryEntry | null> {
  const { persona, weekStart, force } = opts;
  const { weekEnd } = weekBoundsFromStart(weekStart);
  const existing = await getWeeklyDiaryEntry(weekStart, persona.id);

  if (existing?.status === 'done' && !force) {
    return existing;
  }
  if (
    existing?.status === 'pending' &&
    !force &&
    Date.now() - existing.updatedAt < PENDING_STALE_MS
  ) {
    console.log('[weekly-diary] SKIP — already pending', weekStart, persona.id);
    return existing;
  }

  const material = await gatherWeekMaterial(persona, weekStart);
  if (!material.text.trim()) {
    await skipWeeklyDiary({
      weekStart,
      weekEnd,
      personaId: persona.id,
      reason: '本周没有相关对话或日记',
    });
    console.log('[weekly-diary] SKIP — no material', weekStart, persona.name);
    return (await getWeeklyDiaryEntry(weekStart, persona.id)) ?? null;
  }

  const resolved = await resolvePersonaChatModel({
    personaId: persona.id,
    conversationIds: material.conversationIds,
    assistantMsgs: material.assistantMsgs,
  });
  if (!resolved) {
    console.log('[weekly-diary] SKIP — no endpoint/model', persona.name);
    return null;
  }

  const pending = await putPendingWeeklyDiary({
    weekStart,
    weekEnd,
    personaId: persona.id,
    model: resolved.model,
    endpointId: resolved.endpoint.id,
    conversationIds: material.conversationIds,
    diaryEntryIds: material.diaryEntryIds,
  });

  try {
    const content = await generateWeeklyDiary({
      persona,
      weekStart,
      weekEnd,
      material: material.text,
      endpoint: resolved.endpoint,
      model: resolved.model,
    });
    if (!content.trim()) {
      throw new Error('模型返回空周记');
    }
    await completeWeeklyDiary(pending.id, content);
    console.log('[weekly-diary] DONE', weekStart, persona.name, resolved.model);

    const done = (await getWeeklyDiaryEntry(weekStart, persona.id)) ?? null;
    if (done?.status === 'done') {
      // Soft-fail memory extract — never block the diary write.
      void extractMemoryFromWeeklyDiary({ persona, entry: done }).catch(
        (e) => console.warn('[weekly-diary] memory extract failed', e),
      );
    }
    return done;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await failWeeklyDiary(pending.id, msg);
    console.error('[weekly-diary] ERROR', weekStart, persona.name, msg);
    return (await getWeeklyDiaryEntry(weekStart, persona.id)) ?? null;
  }
}

async function generateWeeklyDiary(opts: {
  persona: Persona;
  weekStart: string;
  weekEnd: string;
  material: string;
  endpoint: import('../../types').Endpoint;
  model: string;
}): Promise<string> {
  const system = buildWeeklyDiarySystemPrompt(opts.persona);
  const user = buildWeeklyDiaryUserPrompt({
    weekStart: opts.weekStart,
    weekEnd: opts.weekEnd,
    personaName: opts.persona.name,
    material: opts.material,
  });

  let full = '';
  const stream = streamChat({
    endpoint: opts.endpoint,
    model: opts.model,
    maxTokens: 1536,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  for await (const ev of stream) {
    if (ev.type === 'delta' && ev.delta) full += ev.delta;
    if (ev.type === 'error') {
      throw new Error(ev.errorMessage ?? 'streamChat error');
    }
  }
  return full
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/g, '')
    .trim();
}

/** Personas that should write weekly diaries under current settings. */
export async function listWeeklyDiaryPersonas(
  cfg?: WeeklyDiarySettings | null,
): Promise<Persona[]> {
  const merged = mergeWeeklyDiaryCfg(cfg);
  const all = await db.personas.toArray();
  if (merged.personaIds.length > 0) {
    const set = new Set(merged.personaIds);
    return all.filter((p) => set.has(p.id));
  }
  return all.filter(
    (p) => p.id !== 'persona_default' && !!p.systemPrompt?.trim(),
  );
}
