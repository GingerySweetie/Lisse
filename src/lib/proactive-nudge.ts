import { db, getSettings } from '../db';
import { sendMessage } from './chat';

/**
 * Proactive Nudge — client-side scheduler.
 *
 * Mirrors the logic from https://github.com/Shitsuten/proactive-nudge but
 * runs entirely in the browser using Dexie instead of a Node worker hitting
 * HTTP APIs. Because all data lives in IndexedDB we can query it directly.
 *
 * Flow:
 *  1. bootstrapProactiveNudge() is called once on app mount (Layout.tsx).
 *  2. After FIRST_CHECK_MS (3 min) the first check runs.
 *  3. Each cycle: read settings → find target conversation → find last user
 *     message timestamp → if silence ≥ intervalMin, inject "[nudge] …" via
 *     sendMessage() → schedule next check at intervalMin..intervalMax mins.
 *  4. If silence has not reached intervalMin yet, schedule next check at the
 *     remaining gap (so we don't always wait a full interval from now).
 *
 * Default interval: 300 minutes (5 hours).
 */

const FIRST_CHECK_MS = 3 * 60 * 1000; // 3 minutes after boot
const DEFAULT_INTERVAL_MIN = 300;      // 5 hours
const DEFAULT_INTERVAL_MAX = 300;      // 5 hours (fixed)

let loopTimer: ReturnType<typeof setTimeout> | null = null;

/** Call once on app mount. Idempotent — subsequent calls are no-ops. */
export function bootstrapProactiveNudge(): void {
  if (loopTimer !== null) return;
  loopTimer = setTimeout(() => void loop(), FIRST_CHECK_MS);
}

async function loop(): Promise<void> {
  loopTimer = null;
  const nextDelayMs = await proactiveCheck();
  loopTimer = setTimeout(() => void loop(), nextDelayMs);
}

async function proactiveCheck(): Promise<number> {
  try {
    const settings = await getSettings();
    const cfg = settings.proactiveNudge;

    if (!cfg?.enabled) {
      return defaultIntervalMs(cfg);
    }

    const nudgeMessage = (cfg.message ?? '').trim();
    if (!nudgeMessage) {
      console.log('[nudge] SKIP — empty message');
      return defaultIntervalMs(cfg);
    }

    const conversationId =
      cfg.conversationId?.trim() || (await getMostRecentConversationId());
    if (!conversationId) {
      console.log('[nudge] SKIP — no conversation');
      return defaultIntervalMs(cfg);
    }

    const conversation = await db.conversations.get(conversationId);
    if (!conversation) {
      console.log('[nudge] SKIP — conversation not found:', conversationId);
      return defaultIntervalMs(cfg);
    }

    // Find last user message (any role=user, including prior [nudge] turns).
    const allMsgs = await db.messages
      .where('conversationId')
      .equals(conversationId)
      .sortBy('createdAt');
    const lastUserMsg = [...allMsgs].reverse().find((m) => m.role === 'user');

    const intervalMin = cfg.intervalMin ?? DEFAULT_INTERVAL_MIN;
    if (lastUserMsg) {
      const elapsedMinutes = (Date.now() - lastUserMsg.createdAt) / 60_000;
      if (elapsedMinutes < intervalMin) {
        const remainingMs = Math.max(
          60_000,
          Math.ceil((intervalMin - elapsedMinutes) * 60_000),
        );
        console.log(
          `[nudge] SKIP — too recent (${Math.round(elapsedMinutes)}m ago); ` +
            `next check in ${Math.round(remainingMs / 60_000)}m`,
        );
        return remainingMs;
      }
    }

    // Silence threshold reached — find endpoint + model for this conversation.
    const epId =
      conversation.defaultEndpointId ?? settings.defaultEndpointId ?? null;
    if (!epId) {
      console.log('[nudge] SKIP — no endpoint configured');
      return defaultIntervalMs(cfg);
    }
    const endpoint = await db.endpoints.get(epId);
    if (!endpoint) {
      console.log('[nudge] SKIP — endpoint not found:', epId);
      return defaultIntervalMs(cfg);
    }

    const modelCandidate =
      conversation.defaultModel &&
      endpoint.chatModels.includes(conversation.defaultModel)
        ? conversation.defaultModel
        : settings.defaultModel &&
            endpoint.chatModels.includes(settings.defaultModel)
          ? settings.defaultModel
          : endpoint.chatModels[0] ?? null;
    if (!modelCandidate) {
      console.log('[nudge] SKIP — no model available on endpoint');
      return defaultIntervalMs(cfg);
    }

    const persona = conversation.personaId
      ? await db.personas.get(conversation.personaId)
      : undefined;
    // settings.defaultStyleId is the single source of truth (same as Chat/Read).
    // conversation.styleId is legacy and may be stale/null after StylePicker changes.
    const style = settings.defaultStyleId
      ? await db.writingStyles.get(settings.defaultStyleId)
      : undefined;

    console.log('[nudge] SEND — injecting nudge into', conversationId);
    await sendMessage({
      conversation,
      endpoint,
      model: modelCandidate,
      userText: `[nudge] ${nudgeMessage}`,
      persona,
      style,
    });
    console.log('[nudge] DONE');
  } catch (e) {
    console.error('[nudge] ERROR:', e);
  }

  return defaultIntervalMs((await getSettings()).proactiveNudge);
}

/** Pick the most-recently-updated regular (non-room) conversation. */
async function getMostRecentConversationId(): Promise<string | null> {
  const conv = await db.conversations
    .orderBy('updatedAt')
    .reverse()
    .filter((c) => !c.room)
    .first();
  return conv?.id ?? null;
}

/**
 * Compute next wait duration in ms from config. Falls back to defaults when
 * config is absent.  intervalMax === intervalMin means fixed interval;
 * otherwise uniform random in [min, max].
 */
function defaultIntervalMs(
  cfg?: { intervalMin?: number; intervalMax?: number } | null,
): number {
  const min = cfg?.intervalMin ?? DEFAULT_INTERVAL_MIN;
  const max = Math.max(min, cfg?.intervalMax ?? DEFAULT_INTERVAL_MAX);
  return (min + Math.random() * (max - min)) * 60_000;
}
