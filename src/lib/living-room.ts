import { db, getSettings } from '../db';
import { newId } from './id';
import type { Conversation } from '../types';

/**
 * Living room — singleton group conversation with 理理酱 + Rhema both
 * active. Lazily created on first visit; subsequent visits reuse the
 * same id. Hidden from the main conversation sidebar (room='living-room').
 *
 * Differs from bedroom: bedroom is one-on-one per persona; living room
 * is a single shared thread with both speaking.
 */

const LIVING_PERSONA_IDS = ['persona_ririchan', 'persona_rhema'];

export async function loadOrCreateLivingRoom(): Promise<Conversation> {
  const existing = await db.conversations
    .where('room')
    .equals('living-room')
    .first();
  if (existing) return existing;
  const settings = await getSettings();
  const now = Date.now();
  const conv: Conversation = {
    id: newId(),
    title: '客厅',
    currentLeafId: null,
    personaId: LIVING_PERSONA_IDS[0],
    personaIds: LIVING_PERSONA_IDS,
    defaultEndpointId: settings.defaultEndpointId ?? undefined,
    defaultModel: settings.defaultModel ?? undefined,
    styleId: settings.defaultStyleId ?? undefined,
    room: 'living-room',
    source: 'native',
    createdAt: now,
    updatedAt: now,
  };
  await db.conversations.add(conv);
  return conv;
}
