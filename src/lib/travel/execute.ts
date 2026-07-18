/**
 * Lower layer — LLM execution.
 *
 * Stateless per trip: fresh turns, no chat history. Read-only tools only
 * (find_real_image). permissionMode conceptually = dontAsk: unknown tools
 * simply aren't offered.
 */

import { streamChat } from '../../api';
import type { ChatTurn } from '../../api';
import { thinkingOptsFromEndpoint } from '../../api/thinking';
import { db, getSettings } from '../../db';
import type {
  Endpoint,
  Persona,
  TravelDaemonSettings,
  TravelTrip,
} from '../../types';
import { runToolLoop } from '../tools/loop';
import type { Tool } from '../tools/index';
import { DEFAULT_TRAVEL_DAEMON } from './defaults';
import { travelImageTools } from './images';
import {
  buildTravelSystemPrompt,
  buildTravelUserPrompt,
  defaultIdentitySummary,
} from './prompt';
import { parseTravelJson, type TravelJsonResult } from './parse';
import {
  completeTrip,
  createRunningTrip,
  failTrip,
  listRecentLocations,
  markEvent,
} from './store';

export type { TravelJsonResult };
export { parseTravelJson };

export async function resolveTravelEndpoint(
  cfg: TravelDaemonSettings,
): Promise<{ endpoint: Endpoint; model: string } | null> {
  const settings = await getSettings();
  const epId = cfg.endpointId ?? settings.defaultEndpointId;
  if (!epId) return null;
  const endpoint = await db.endpoints.get(epId);
  if (!endpoint) return null;
  const model =
    cfg.model && endpoint.chatModels.includes(cfg.model)
      ? cfg.model
      : settings.defaultModel &&
          endpoint.chatModels.includes(settings.defaultModel)
        ? settings.defaultModel
        : endpoint.chatModels[0] ?? null;
  if (!model) return null;
  return { endpoint, model };
}

export async function runTravelTrip(opts: {
  persona: Persona;
  cfg: TravelDaemonSettings;
  endpoint: Endpoint;
  model: string;
  signal?: AbortSignal;
  onCreated?: (tripId: string) => Promise<void> | void;
}): Promise<TravelTrip> {
  const { persona, cfg, endpoint, model, signal, onCreated } = opts;
  const trip = await createRunningTrip({ personaId: persona.id, model });
  await onCreated?.(trip.id);
  await markEvent('travel_started', '开始出行', { model }, trip.id);

  try {
    const recent = await listRecentLocations(
      persona.id,
      cfg.antiRepeatCount ?? DEFAULT_TRAVEL_DAEMON.antiRepeatCount,
    );
    const system = buildTravelSystemPrompt({
      now: new Date(),
      personaName: persona.name,
      identitySummary: defaultIdentitySummary(persona.name),
      recentLocations: recent,
    });
    const user = buildTravelUserPrompt();
    const turns: ChatTurn[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];

    const tools: Tool[] = travelImageTools();
    const maxTurns = cfg.maxTurns ?? DEFAULT_TRAVEL_DAEMON.maxTurns;
    // Mirror chat.ts: never pin temperature. Thinking / adaptive Claude
    // models reject any value other than 1 (or omitted).
    const thinking = thinkingOptsFromEndpoint(endpoint);

    let rawText: string;
    if (tools.length > 0) {
      const result = await runToolLoop({
        endpoint,
        model,
        initialTurns: turns,
        tools,
        ctx: { persona, conversationId: `travel:${trip.id}` },
        signal,
        maxRounds: maxTurns,
        thinking,
        maxTokens: 2048,
      });
      if (result.errored) {
        throw new Error(result.errorMessage ?? 'tool loop error');
      }
      rawText = result.text;
    } else {
      rawText = await streamAccumulate(endpoint, model, turns, signal, thinking);
    }

    const parsed = parseTravelJson(rawText);
    if (!parsed) {
      throw new Error('模型未返回合法旅行 JSON');
    }

    const completed = await completeTrip(trip.id, {
      monologue: parsed.monologue,
      location: parsed.trip.location,
      era: parsed.trip.era,
      feeling: parsed.trip.feeling,
      imageUrl: parsed.trip.imageUrl,
      imageSource: parsed.trip.imageSource,
      gift: parsed.trip.gift,
      invite: parsed.invite,
      message: parsed.message,
      emotionalScore: parsed.emotionalScore,
      memoryLabel: parsed.invite ? 'shared' : 'alone',
    });

    await markEvent(
      'travel_completed',
      `完成：${completed.location} · ${completed.gift}`,
      {
        invite: completed.invite,
        memoryLabel: completed.memoryLabel,
        model,
      },
      completed.id,
    );

    return completed;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await failTrip(trip.id, msg);
    await markEvent('travel_error', msg, undefined, trip.id);
    throw e;
  }
}

async function streamAccumulate(
  endpoint: Endpoint,
  model: string,
  messages: ChatTurn[],
  signal?: AbortSignal,
  thinking?: {
    enabled: boolean;
    budgetTokens?: number;
    effort?: 'low' | 'medium' | 'high' | 'max';
  },
): Promise<string> {
  let acc = '';
  for await (const evt of streamChat({
    endpoint,
    model,
    messages,
    maxTokens: 2048,
    thinking,
    signal,
  })) {
    if (evt.type === 'delta' && evt.delta) acc += evt.delta;
    else if (evt.type === 'error') {
      throw new Error(evt.errorMessage ?? 'stream error');
    }
  }
  return acc;
}

export function mergeTravelCfg(
  partial?: Partial<TravelDaemonSettings> | null,
): TravelDaemonSettings {
  return {
    ...DEFAULT_TRAVEL_DAEMON,
    ...partial,
    quietHours: {
      ...DEFAULT_TRAVEL_DAEMON.quietHours,
      ...partial?.quietHours,
    },
  };
}
