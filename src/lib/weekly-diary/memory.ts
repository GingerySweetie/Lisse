/**
 * After a weekly diary is written, extract lasting personal facts
 * (身体不适 / 体检 / 具体事件等) into memoryFacts when memory is configured.
 */
import { streamChat } from '../../api';
import { embed } from '../../api/embedding';
import { db, getSettings } from '../../db';
import type {
  Endpoint,
  FactCategory,
  MemoryFact,
  Persona,
  WeeklyDiaryEntry,
} from '../../types';
import { newId } from '../id';

const WEEKLY_EXTRACTOR_SYSTEM = `You extract lasting personal facts from a weekly diary (周记).

Output ONLY a JSON object, no markdown:
{
  "facts": [
    {"text": "...", "category": "user_fact" | "preference" | "relationship" | "event" | "context" | "other"}
  ]
}

Extract ONLY when the diary mentions:
- 身体不适、症状、疼痛、失眠等健康状况
- 身体检查、就医、复诊、化验、体检结果
- 具体事件（约会、出差、搬家、重要约会/截止日期、纪念日等）
- 其他稳定的个人信息（工作变动、住址、关系状态等）

Skip: moods, fluff, generic chat topics, the persona's own feelings.
Write each fact self-contained in 中文. One atom per fact.
If nothing qualifies, return {"facts": []}.`;

const VALID_CATEGORIES: FactCategory[] = [
  'user_fact',
  'preference',
  'relationship',
  'event',
  'context',
  'other',
];

export async function extractMemoryFromWeeklyDiary(opts: {
  persona: Persona;
  entry: WeeklyDiaryEntry;
}): Promise<{ added: number; error?: string }> {
  const { persona, entry } = opts;
  if (!entry.content.trim() || entry.status !== 'done') {
    return { added: 0 };
  }

  try {
    const settings = await getSettings();
    if (!settings.memoryEnabled) return { added: 0 };

    const extractorEp = settings.extractorEndpointId
      ? await db.endpoints.get(settings.extractorEndpointId)
      : undefined;
    const extractorModel = settings.extractorModel;
    if (!extractorEp || !extractorModel) {
      return { added: 0, error: 'extractor not configured' };
    }

    const facts = await runWeeklyExtractor(
      extractorEp,
      extractorModel,
      persona.name,
      entry,
    );
    if (facts.length === 0) return { added: 0 };

    const embeddingEp = settings.embeddingEndpointId
      ? await db.endpoints.get(settings.embeddingEndpointId)
      : undefined;
    const embeddingModel = settings.embeddingModel;
    if (!embeddingEp || !embeddingModel) {
      return { added: 0, error: 'embedding not configured' };
    }

    const { vectors } = await embed({
      endpoint: embeddingEp,
      model: embeddingModel,
      inputs: facts.map((f) => f.text),
    });

    const conversationId = `weekly-diary:${entry.weekStart}`;
    const now = Date.now();

    // De-dupe: skip facts already stored from this same weekly entry.
    const existing = await db.memoryFacts
      .where('personaId')
      .equals(persona.id)
      .filter((f) => f.messageId === entry.id && !f.archived)
      .toArray();
    if (existing.length > 0) {
      return { added: 0 };
    }

    const rows: MemoryFact[] = facts.map((f, i) => ({
      id: newId(),
      personaId: persona.id,
      conversationId,
      messageId: entry.id,
      text: f.text,
      category: f.category,
      embedding: vectors[i]!,
      embeddingModel,
      createdAt: now + i,
      updatedAt: now + i,
    }));
    await db.memoryFacts.bulkAdd(rows);
    console.log(
      '[weekly-diary] memory facts',
      entry.weekStart,
      persona.name,
      rows.length,
    );
    return { added: rows.length };
  } catch (err) {
    return {
      added: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runWeeklyExtractor(
  endpoint: Endpoint,
  model: string,
  personaName: string,
  entry: WeeklyDiaryEntry,
): Promise<Array<{ text: string; category: FactCategory }>> {
  const userPrompt =
    `Persona: ${personaName}\n` +
    `周记周期：${entry.weekStart} ~ ${entry.weekEnd}\n\n` +
    `${entry.content.trim()}\n\n` +
    `Emit JSON now.`;

  let acc = '';
  for await (const evt of streamChat({
    endpoint,
    model,
    messages: [
      { role: 'system', content: WEEKLY_EXTRACTOR_SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    maxTokens: 1024,
    temperature: 0.2,
  })) {
    if (evt.type === 'delta' && evt.delta) acc += evt.delta;
    else if (evt.type === 'error') {
      throw new Error(evt.errorMessage ?? 'weekly memory extractor error');
    }
  }
  return parseFacts(acc);
}

function parseFacts(
  text: string,
): Array<{ text: string; category: FactCategory }> {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];
  const facts = Array.isArray((parsed as { facts?: unknown }).facts)
    ? ((parsed as { facts: unknown[] }).facts)
    : [];
  const out: Array<{ text: string; category: FactCategory }> = [];
  for (const f of facts) {
    if (!f || typeof f !== 'object') continue;
    const o = f as Record<string, unknown>;
    if (typeof o.text !== 'string' || !o.text.trim()) continue;
    const cat = typeof o.category === 'string' ? o.category : 'other';
    const category: FactCategory = (
      VALID_CATEGORIES as string[]
    ).includes(cat)
      ? (cat as FactCategory)
      : 'other';
    out.push({ text: o.text.trim(), category });
  }
  return out;
}
