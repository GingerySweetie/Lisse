import { db, getSettings } from '../../db';
import { embed } from '../../api/embedding';
import { newId } from '../id';
import { retrieveFacts } from '../memory/retrieve';
import type { FactCategory, MemoryFact } from '../../types';
import type { Tool, ToolContext } from './index';

/**
 * Memory tools exposed to the chat model when memory + embeddings are on.
 *
 * remember(text, category?) — write a lasting fact (or refresh a near-duplicate).
 * recall(query, k?) — semantic search; returns ids so the model can edit/forget.
 * update_memory(id, text, category?) — rewrite an existing fact and re-embed.
 * forget_memory(id) — archive a fact that is wrong / outdated / superseded.
 *
 * The model is expected to call these proactively mid-conversation when the
 * user reveals lasting information or corrects something previously stored.
 */

const VALID: FactCategory[] = [
  'user_fact',
  'preference',
  'relationship',
  'event',
  'context',
  'other',
];

/** Cosine threshold above which remember() refreshes an existing fact
 *  instead of inserting a near-duplicate. */
const REMEMBER_MERGE_THRESHOLD = 0.92;

export async function memoryTools(ctx: ToolContext): Promise<Tool[]> {
  if (!ctx.persona) return [];
  const settings = await getSettings();
  if (!settings.memoryEnabled) return [];
  if (!settings.embeddingEndpointId || !settings.embeddingModel) return [];
  return [
    rememberTool(),
    recallTool(),
    updateMemoryTool(),
    forgetMemoryTool(),
  ];
}

function rememberTool(): Tool {
  return {
    def: {
      name: 'remember',
      description:
        '主动把一条值得跨对话保留的事实写入这个人格的记忆池。对话中一旦出现稳定、可复用的信息（工作/住址/偏好/身边的人/持续状况等），应立刻调用，不必等用户说「记一下」。瞬时心情、当下天气、刚才的闲聊不要记。每条事实自含上下文（「她在苏州一家会员店做零售岗，14:00–22:45 排班」而不是「她有班」）。若池里已有高度相似的旧事实，会自动更新那条而不是重复插入。',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: '要记住的事实，用中文，写完整一句话。',
          },
          category: {
            type: 'string',
            enum: VALID,
            description:
              'user_fact: 稳定事实（工作/位置/特征）。preference: 喜好。relationship: 她身边的人。event: 有日期的具体事件。context: 持续中的情境。other: 其他。',
          },
        },
        required: ['text'],
      },
    },
    handler: async (input, ctx) => {
      const args = input as { text?: string; category?: string };
      const text = (args.text ?? '').trim();
      if (!text) return { added: false, error: 'empty text' };
      const category = parseCategory(args.category);
      if (!ctx.persona) return { added: false, error: 'no persona' };

      const emb = await embedText(text);
      if (!emb) return { added: false, error: 'embedding not configured' };

      // Near-duplicate → refresh in place so the pool stays clean.
      // Score locally (don't use retrieveFacts): pinned facts there always
      // report score=1 and would falsely trigger merges.
      const closest = await findClosestFact(
        ctx.persona.id,
        emb.vector,
        emb.model,
      );
      if (closest && closest.score >= REMEMBER_MERGE_THRESHOLD) {
        const now = Date.now();
        await db.memoryFacts.update(closest.fact.id, {
          text,
          category,
          embedding: emb.vector,
          embeddingModel: emb.model,
          conversationId: ctx.conversationId,
          updatedAt: now,
        });
        return {
          added: false,
          updated: true,
          id: closest.fact.id,
          category,
          previousText: closest.fact.text,
        };
      }

      const now = Date.now();
      const row: MemoryFact = {
        id: newId(),
        personaId: ctx.persona.id,
        conversationId: ctx.conversationId,
        messageId: '',
        text,
        category,
        embedding: emb.vector,
        embeddingModel: emb.model,
        createdAt: now,
        updatedAt: now,
      };
      await db.memoryFacts.add(row);
      return { added: true, id: row.id, category };
    },
  };
}

function recallTool(): Tool {
  return {
    def: {
      name: 'recall',
      description:
        '从这个人格的记忆池里按语义搜索过去记下的事实。想确认/对照/参考某件之前的事，或准备 update_memory / forget_memory 前需要先拿到 id 时调用。query 用自然语言描述你想找什么。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '自然语言查询，写完整一句话。',
          },
          k: {
            type: 'integer',
            description: '最多返回几条（默认 5，最多 12）。',
            minimum: 1,
            maximum: 12,
          },
        },
        required: ['query'],
      },
    },
    handler: async (input, ctx) => {
      const args = input as { query?: string; k?: number };
      const query = (args.query ?? '').trim();
      if (!query || !ctx.persona) {
        return { facts: [] };
      }
      const k = Math.max(1, Math.min(12, args.k ?? 5));
      const facts = await retrieveFacts(ctx.persona.id, query, {
        topK: k,
        threshold: 0,
      });
      return {
        facts: facts.map((r) => ({
          id: r.fact.id,
          text: r.fact.text,
          category: r.fact.category,
          pinned: !!r.pinned,
          score: Math.round(r.score * 1000) / 1000,
        })),
      };
    },
  };
}

function updateMemoryTool(): Tool {
  return {
    def: {
      name: 'update_memory',
      description:
        '改写记忆池里已有的一条事实。当用户纠正旧信息、情况发生变化、或你发现旧记忆过时/不准确时主动调用。先用 recall 拿到 id，再传入完整的新文本（自含上下文）。会重新嵌入；置顶状态保留。',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: '要更新的记忆 id（来自 recall 的返回值）。',
          },
          text: {
            type: 'string',
            description: '更新后的完整事实文本，用中文，写完整一句话。',
          },
          category: {
            type: 'string',
            enum: VALID,
            description: '可选；不传则保持原分类。',
          },
        },
        required: ['id', 'text'],
      },
    },
    handler: async (input, ctx) => {
      const args = input as { id?: string; text?: string; category?: string };
      const id = (args.id ?? '').trim();
      const text = (args.text ?? '').trim();
      if (!id || !text) return { updated: false, error: 'id and text required' };
      if (!ctx.persona) return { updated: false, error: 'no persona' };

      const fact = await getPersonaFact(ctx.persona.id, id);
      if (!fact) return { updated: false, error: 'fact not found' };

      const emb = await embedText(text);
      if (!emb) return { updated: false, error: 'embedding not configured' };

      const category =
        args.category !== undefined && args.category !== ''
          ? parseCategory(args.category)
          : fact.category;
      const previousText = fact.text;
      await db.memoryFacts.update(id, {
        text,
        category,
        embedding: emb.vector,
        embeddingModel: emb.model,
        conversationId: ctx.conversationId,
        updatedAt: Date.now(),
      });
      return {
        updated: true,
        id,
        category,
        previousText,
        text,
      };
    },
  };
}

function forgetMemoryTool(): Tool {
  return {
    def: {
      name: 'forget_memory',
      description:
        '归档（软删除）一条错误、过时、或已被新事实取代的记忆，使其不再被检索到。用户明确说「忘掉这个」/「那条不对」、或你确认旧记忆已失效时调用。先用 recall 拿到 id。不会物理删除，可在记忆页恢复。',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: '要遗忘的记忆 id（来自 recall 的返回值）。',
          },
          reason: {
            type: 'string',
            description: '可选；简短说明为何遗忘（仅写入工具结果，便于自查）。',
          },
        },
        required: ['id'],
      },
    },
    handler: async (input, ctx) => {
      const args = input as { id?: string; reason?: string };
      const id = (args.id ?? '').trim();
      if (!id) return { forgotten: false, error: 'id required' };
      if (!ctx.persona) return { forgotten: false, error: 'no persona' };

      const fact = await getPersonaFact(ctx.persona.id, id);
      if (!fact) return { forgotten: false, error: 'fact not found' };

      await db.memoryFacts.update(id, {
        archived: true,
        updatedAt: Date.now(),
      });
      return {
        forgotten: true,
        id,
        text: fact.text,
        reason: (args.reason ?? '').trim() || undefined,
      };
    },
  };
}

function parseCategory(raw?: string): FactCategory {
  return (VALID as string[]).includes(raw ?? '')
    ? (raw as FactCategory)
    : 'other';
}

async function getPersonaFact(
  personaId: string,
  id: string,
): Promise<MemoryFact | undefined> {
  const fact = await db.memoryFacts.get(id);
  if (!fact || fact.personaId !== personaId || fact.archived) return undefined;
  return fact;
}

async function embedText(
  text: string,
): Promise<{ vector: number[]; model: string } | null> {
  const settings = await getSettings();
  const ep = settings.embeddingEndpointId
    ? await db.endpoints.get(settings.embeddingEndpointId)
    : undefined;
  if (!ep || !settings.embeddingModel) return null;
  const { vectors } = await embed({
    endpoint: ep,
    model: settings.embeddingModel,
    inputs: [text],
  });
  return { vector: vectors[0], model: settings.embeddingModel };
}

/** Best cosine match among active facts that share the embedding model. */
async function findClosestFact(
  personaId: string,
  vector: number[],
  model: string,
): Promise<{ fact: MemoryFact; score: number } | null> {
  const facts = await db.memoryFacts
    .where({ personaId })
    .filter((f) => !f.archived && f.embeddingModel === model)
    .toArray();
  let best: { fact: MemoryFact; score: number } | null = null;
  for (const fact of facts) {
    const score = cosine(vector, fact.embedding);
    if (!best || score > best.score) best = { fact, score };
  }
  return best;
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return -1;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
