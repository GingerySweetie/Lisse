import { streamChat } from '../../api';
import { db } from '../../db';
import type { DiaryEntry, DiarySettings, Persona } from '../../types';
import { PENDING_STALE_MS, mergeDiaryCfg } from './defaults';
import { buildDiarySystemPrompt, buildDiaryUserPrompt } from './prompt';
import { resolvePersonaChatModel } from './resolve-model';
import {
  completeDiary,
  failDiary,
  getDiaryEntry,
  putPendingDiary,
  skipDiary,
} from './store';
import { gatherDayTranscript } from './transcript';

/**
 * Write (or skip) one persona's diary for a local calendar date.
 * Idempotent for done entries; retries stale pending / error rows.
 */
export async function writePersonaDiary(opts: {
  persona: Persona;
  date: string;
  force?: boolean;
}): Promise<DiaryEntry | null> {
  const { persona, date, force } = opts;
  const existing = await getDiaryEntry(date, persona.id);
  if (existing?.status === 'done' && !force) {
    return existing;
  }
  if (
    existing?.status === 'pending' &&
    !force &&
    Date.now() - existing.updatedAt < PENDING_STALE_MS
  ) {
    console.log('[diary] SKIP — already pending', date, persona.id);
    return existing;
  }

  const day = await gatherDayTranscript(persona, date);
  if (!day.text.trim() || day.conversationIds.length === 0) {
    // Keep a skipped marker so we don't hammer empty days every tick.
    await skipDiary({
      date,
      personaId: persona.id,
      reason: '当天没有相关对话',
    });
    console.log('[diary] SKIP — no chat', date, persona.name);
    return (await getDiaryEntry(date, persona.id)) ?? null;
  }
  // Previously skipped (no chat) but there is transcript now → write.

  const resolved = await resolvePersonaChatModel({
    personaId: persona.id,
    conversationIds: day.conversationIds,
    assistantMsgs: day.assistantMsgs,
  });
  if (!resolved) {
    console.log('[diary] SKIP — no endpoint/model', persona.name);
    return null;
  }

  const pending = await putPendingDiary({
    date,
    personaId: persona.id,
    model: resolved.model,
    endpointId: resolved.endpoint.id,
    conversationIds: day.conversationIds,
  });

  try {
    const content = await generateDiary({
      persona,
      date,
      transcript: day.text,
      endpoint: resolved.endpoint,
      model: resolved.model,
    });
    if (!content.trim()) {
      throw new Error('模型返回空日记');
    }
    await completeDiary(pending.id, content);
    console.log('[diary] DONE', date, persona.name, resolved.model);
    return (await getDiaryEntry(date, persona.id)) ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await failDiary(pending.id, msg);
    console.error('[diary] ERROR', date, persona.name, msg);
    return (await getDiaryEntry(date, persona.id)) ?? null;
  }
}

async function generateDiary(opts: {
  persona: Persona;
  date: string;
  transcript: string;
  endpoint: import('../../types').Endpoint;
  model: string;
}): Promise<string> {
  const system = buildDiarySystemPrompt(opts.persona);
  const user = buildDiaryUserPrompt({
    date: opts.date,
    personaName: opts.persona.name,
    transcript: opts.transcript,
  });

  let full = '';
  const stream = streamChat({
    endpoint: opts.endpoint,
    model: opts.model,
    maxTokens: 2048,
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
  // Strip accidental think blocks if a model wraps them.
  return full
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/g, '')
    .trim();
}

/** Personas that should write diaries under the current settings. */
export async function listDiaryPersonas(
  cfg?: DiarySettings | null,
): Promise<Persona[]> {
  const merged = mergeDiaryCfg(cfg);
  const all = await db.personas.toArray();
  if (merged.personaIds.length > 0) {
    const set = new Set(merged.personaIds);
    return all.filter((p) => set.has(p.id));
  }
  return all.filter((p) => p.id !== 'persona_default' && !!p.systemPrompt?.trim());
}
