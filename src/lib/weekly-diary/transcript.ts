import { db } from '../../db';
import type { Message, Persona } from '../../types';
import { gatherDayTranscript } from '../diary/transcript';
import { MAX_WEEK_MATERIAL_CHARS } from './defaults';
import { weekBoundsFromStart } from './format';

export interface WeekMaterial {
  conversationIds: string[];
  diaryEntryIds: string[];
  text: string;
  assistantMsgs: Message[];
}

/**
 * Build source material for one week: prefer done daily diaries, fall back
 * to raw day transcripts when a day has no diary.
 */
export async function gatherWeekMaterial(
  persona: Persona,
  weekStart: string,
): Promise<WeekMaterial> {
  const { dates } = weekBoundsFromStart(weekStart);
  const blocks: string[] = [];
  const conversationIds = new Set<string>();
  const diaryEntryIds: string[] = [];
  const assistantMsgs: Message[] = [];

  for (const date of dates) {
    const diary = await db.diaryEntries.get(`${date}|${persona.id}`);
    if (diary?.status === 'done' && diary.content.trim()) {
      diaryEntryIds.push(diary.id);
      for (const id of diary.conversationIds) conversationIds.add(id);
      blocks.push(`### ${date}（日记）\n${diary.content.trim()}`);
      continue;
    }

    const day = await gatherDayTranscript(persona, date);
    if (!day.text.trim()) continue;
    for (const id of day.conversationIds) conversationIds.add(id);
    assistantMsgs.push(...day.assistantMsgs);
    blocks.push(`### ${date}（对话）\n${day.text}`);
  }

  let text = blocks.join('\n\n');
  if (text.length > MAX_WEEK_MATERIAL_CHARS) {
    text = text.slice(text.length - MAX_WEEK_MATERIAL_CHARS);
    text = '…（前文已省略）\n' + text;
  }

  return {
    conversationIds: [...conversationIds],
    diaryEntryIds,
    text,
    assistantMsgs,
  };
}
