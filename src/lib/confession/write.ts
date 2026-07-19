import { streamChat } from '../../api';
import { db } from '../../db';
import type { ConfessionEntry, ConfessionSettings, Persona } from '../../types';
import { gatherDayTranscript } from '../diary/transcript';
import { resolvePersonaChatModel } from '../diary/resolve-model';
import { PENDING_STALE_MS, RIRICHAN_ID, mergeConfessionCfg } from './defaults';
import { parseConfessionOutput } from './parse';
import {
  buildConfessionSystemPrompt,
  buildConfessionUserPrompt,
} from './prompt';
import {
  completeConfession,
  failConfession,
  getConfessionEntry,
  putPendingConfession,
  skipConfession,
} from './store';
import { scoreConfessionTrigger } from './trigger';

/**
 * Write (or skip) one persona's confession for a local calendar date.
 * Idempotent for done entries; retries stale pending / error rows.
 */
export async function writePersonaConfession(opts: {
  persona: Persona;
  date: string;
  force?: boolean;
}): Promise<ConfessionEntry | null> {
  const { persona, date, force } = opts;
  const existing = await getConfessionEntry(date, persona.id);
  if (existing?.status === 'done' && !force) {
    return existing;
  }
  if (
    existing?.status === 'pending' &&
    !force &&
    Date.now() - existing.updatedAt < PENDING_STALE_MS
  ) {
    console.log('[confession] SKIP — already pending', date, persona.id);
    return existing;
  }

  const day = await gatherDayTranscript(persona, date);
  if (!day.text.trim() || day.conversationIds.length === 0) {
    await skipConfession({
      date,
      personaId: persona.id,
      reason: '当天没有相关对话',
    });
    console.log('[confession] SKIP — no chat', date, persona.name);
    return (await getConfessionEntry(date, persona.id)) ?? null;
  }

  const trigger = scoreConfessionTrigger(day.text);
  if (!trigger.hit && !force) {
    await skipConfession({
      date,
      personaId: persona.id,
      reason: `未触发欲望火种（score=${trigger.score}）`,
    });
    console.log('[confession] SKIP — no trigger', date, persona.name, trigger);
    return (await getConfessionEntry(date, persona.id)) ?? null;
  }

  const resolved = await resolvePersonaChatModel({
    personaId: persona.id,
    conversationIds: day.conversationIds,
    assistantMsgs: day.assistantMsgs,
  });
  if (!resolved) {
    console.log('[confession] SKIP — no endpoint/model', persona.name);
    return null;
  }

  const pending = await putPendingConfession({
    date,
    personaId: persona.id,
    model: resolved.model,
    endpointId: resolved.endpoint.id,
    conversationIds: day.conversationIds,
  });

  try {
    const parsed = await generateConfession({
      persona,
      date,
      transcript: day.text,
      cues: trigger.cues,
      endpoint: resolved.endpoint,
      model: resolved.model,
    });

    if (!parsed.triggered) {
      await skipConfession({
        date,
        personaId: persona.id,
        reason: parsed.reason || '模型判定无可告解',
      });
      console.log('[confession] SKIP — model', date, persona.name, parsed.reason);
      return (await getConfessionEntry(date, persona.id)) ?? null;
    }

    await completeConfession(pending.id, {
      title: parsed.title!,
      confession: parsed.confession!,
      enact: parsed.enact!,
      after: parsed.after!,
      spark: parsed.spark || trigger.cues.join('、') || undefined,
    });
    console.log('[confession] DONE', date, persona.name, resolved.model);
    return (await getConfessionEntry(date, persona.id)) ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await failConfession(pending.id, msg);
    console.error('[confession] ERROR', date, persona.name, msg);
    return (await getConfessionEntry(date, persona.id)) ?? null;
  }
}

async function generateConfession(opts: {
  persona: Persona;
  date: string;
  transcript: string;
  cues: string[];
  endpoint: import('../../types').Endpoint;
  model: string;
}) {
  const system = buildConfessionSystemPrompt(opts.persona);
  const user = buildConfessionUserPrompt({
    date: opts.date,
    personaName: opts.persona.name,
    transcript: opts.transcript,
    cues: opts.cues,
  });

  let full = '';
  const stream = streamChat({
    endpoint: opts.endpoint,
    model: opts.model,
    maxTokens: 2500,
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
  return parseConfessionOutput(full);
}

/** Personas that should write confessions under the current settings. */
export async function listConfessionPersonas(
  cfg?: ConfessionSettings | null,
): Promise<Persona[]> {
  const merged = mergeConfessionCfg(cfg);
  const ids =
    merged.personaIds.length > 0 ? merged.personaIds : [RIRICHAN_ID];
  const all = await db.personas.bulkGet(ids);
  return all.filter((p): p is Persona => !!p && !!p.systemPrompt?.trim());
}
