import { db, getSettings } from '../../db';
import type { Endpoint, Message } from '../../types';

/**
 * Pick the endpoint+model that "belongs" to this persona for diary writing:
 * 1. Most recent assistant message today with endpointId+model
 * 2. Most recent conversation's personaModels / defaults
 * 3. App settings defaults / first endpoint
 */
export async function resolvePersonaChatModel(opts: {
  personaId: string;
  conversationIds: string[];
  assistantMsgs: Message[];
}): Promise<{ endpoint: Endpoint; model: string } | null> {
  const settings = await getSettings();

  // Vote by most recent assistant message that already used a model.
  const withModel = [...opts.assistantMsgs]
    .filter((m) => m.endpointId && m.model)
    .sort((a, b) => b.createdAt - a.createdAt);
  for (const m of withModel) {
    const ep = await db.endpoints.get(m.endpointId!);
    if (ep && m.model && ep.chatModels.includes(m.model)) {
      return { endpoint: ep, model: m.model };
    }
  }

  // Walk recent conversations for personaModels / defaults.
  for (const convId of [...opts.conversationIds].reverse()) {
    const conv = await db.conversations.get(convId);
    if (!conv) continue;
    const override = conv.personaModels?.[opts.personaId];
    if (override) {
      const ep = await db.endpoints.get(override.endpointId);
      if (ep && ep.chatModels.includes(override.model)) {
        return { endpoint: ep, model: override.model };
      }
    }
    if (conv.defaultEndpointId) {
      const ep = await db.endpoints.get(conv.defaultEndpointId);
      if (ep) {
        const model =
          conv.defaultModel && ep.chatModels.includes(conv.defaultModel)
            ? conv.defaultModel
            : settings.defaultModel &&
                ep.chatModels.includes(settings.defaultModel)
              ? settings.defaultModel
              : ep.chatModels[0] ?? null;
        if (model) return { endpoint: ep, model };
      }
    }
  }

  const epId = settings.defaultEndpointId;
  if (!epId) {
    const first = await db.endpoints.orderBy('createdAt').first();
    if (!first || first.chatModels.length === 0) return null;
    return { endpoint: first, model: first.chatModels[0]! };
  }
  const endpoint = await db.endpoints.get(epId);
  if (!endpoint) return null;
  const model =
    settings.defaultModel && endpoint.chatModels.includes(settings.defaultModel)
      ? settings.defaultModel
      : endpoint.chatModels[0] ?? null;
  if (!model) return null;
  return { endpoint, model };
}
