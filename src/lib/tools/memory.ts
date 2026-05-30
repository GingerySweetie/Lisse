import { db, getSettings } from '../../db';
import { embed } from '../../api/embedding';
import { newId } from '../id';
import { retrieveFacts } from '../memory/retrieve';
import type { FactCategory, MemoryFact } from '../../types';
import type { Tool, ToolContext } from './index';

/**
 * remember(text, category?) — write a new memory fact scoped to the
 *   current persona's pool. Embeds the text via the configured
 *   embedding endpoint and inserts a MemoryFact row.
 *
 * recall(query, k?) — semantic search the persona's memory pool, return
 *   up to k matching facts with text+category. Bypasses similarity
 *   threshold (the model asked explicitly so trust the intent).
 */

const VALID: FactCategory[] = [
  'user_fact',
  'preference',
  'relationship',
  'event',
  'context',
  'other',
];

export async function memoryTools(ctx: ToolContext): Promise<Tool[]> {
  if (!ctx.persona) return [];
  const settings = await getSettings();
  if (!settings.memoryEnabled) return [];
  if (!settings.embeddingEndpointId || !settings.embeddingModel) return [];
  return [rememberTool(), recallTool()];
}

function rememberTool(): Tool {
  return {
    def: {
      name: 'remember',
      description:
        '把一条值得跨对话保留的事实写入这个人格的记忆池。只有跨越当前对话仍然成立的、关于她或她身边的人/偏好/状况的事实才值得记。瞬时心情、当下天气、刚才的话题不要记。每条事实自含上下文（"她在苏州一家会员店做零售岗，14:00–22:45 排班" 而不是 "她有班"）。',
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
      const category: FactCategory = (VALID as string[]).includes(
        args.category ?? '',
      )
        ? (args.category as FactCategory)
        : 'other';
      const settings = await getSettings();
      const ep = settings.embeddingEndpointId
        ? await db.endpoints.get(settings.embeddingEndpointId)
        : undefined;
      if (!ep || !settings.embeddingModel || !ctx.persona) {
        return { added: false, error: 'embedding not configured' };
      }
      const { vectors } = await embed({
        endpoint: ep,
        model: settings.embeddingModel,
        inputs: [text],
      });
      const now = Date.now();
      const row: MemoryFact = {
        id: newId(),
        personaId: ctx.persona.id,
        conversationId: ctx.conversationId,
        messageId: '',
        text,
        category,
        embedding: vectors[0],
        embeddingModel: settings.embeddingModel,
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
        '从这个人格的记忆池里按语义搜索过去记下的事实。你想确认/对照/参考某件之前的事时调它。query 用自然语言描述你想找什么。',
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
          text: r.fact.text,
          category: r.fact.category,
          pinned: !!r.pinned,
        })),
      };
    },
  };
}
