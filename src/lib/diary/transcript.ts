import { db } from '../../db';
import type { Conversation, Message, Persona } from '../../types';
import { MAX_TRANSCRIPT_CHARS } from './defaults';
import { localDayBounds } from './store';

export interface DayTranscript {
  conversationIds: string[];
  text: string;
  /** Assistant messages attributed to this persona today (for model voting). */
  assistantMsgs: Message[];
}

/**
 * Collect a persona's chat activity for one local calendar day.
 * Includes 1:1 chats, group chats they're in, and their bedroom room.
 */
export async function gatherDayTranscript(
  persona: Persona,
  date: string,
): Promise<DayTranscript> {
  const { start, end } = localDayBounds(date);
  const conversations = await db.conversations.toArray();
  const relevant = conversations.filter((c) => conversationInvolves(c, persona.id));
  if (relevant.length === 0) {
    return { conversationIds: [], text: '', assistantMsgs: [] };
  }

  const blocks: string[] = [];
  const conversationIds: string[] = [];
  const assistantMsgs: Message[] = [];

  for (const conv of relevant) {
    const msgs = await db.messages
      .where('conversationId')
      .equals(conv.id)
      .filter((m) => m.createdAt >= start && m.createdAt <= end)
      .sortBy('createdAt');
    if (msgs.length === 0) continue;

    const lines: string[] = [];
    for (const m of msgs) {
      if (m.role !== 'user' && m.role !== 'assistant') continue;
      const content = (m.content ?? '').trim();
      if (!content) continue;
      // Skip internal nudge / system-ish prefixes that aren't real chat.
      if (m.role === 'user' && content.startsWith('[nudge]')) continue;

      if (m.role === 'assistant') {
        if (!assistantBelongsToPersona(m, conv, persona.id)) continue;
        assistantMsgs.push(m);
        lines.push(`${persona.name}：${clip(content, 800)}`);
      } else {
        lines.push(`她：${clip(content, 800)}`);
      }
    }
    if (lines.length === 0) continue;
    conversationIds.push(conv.id);
    const title = conv.title?.trim() || '未命名对话';
    const roomTag = conv.room ? `（${conv.room}）` : '';
    blocks.push(`### ${title}${roomTag}\n${lines.join('\n')}`);
  }

  let text = blocks.join('\n\n');
  if (text.length > MAX_TRANSCRIPT_CHARS) {
    text = text.slice(text.length - MAX_TRANSCRIPT_CHARS);
    text = '…（前文已省略）\n' + text;
  }

  return { conversationIds, text, assistantMsgs };
}

function conversationInvolves(c: Conversation, personaId: string): boolean {
  if (c.personaId === personaId) return true;
  if (c.personaIds?.includes(personaId)) return true;
  if (c.room === 'bedroom' && c.personaId === personaId) return true;
  return false;
}

function assistantBelongsToPersona(
  m: Message,
  conv: Conversation,
  personaId: string,
): boolean {
  if (m.personaId) return m.personaId === personaId;
  // 1:1 / bedroom: conversation persona owns untagged assistant turns.
  if (!conv.personaIds || conv.personaIds.length <= 1) {
    return conv.personaId === personaId;
  }
  // Group chat without personaId on the message — can't safely attribute.
  return false;
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}
