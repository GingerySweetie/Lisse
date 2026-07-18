import JSZip from 'jszip';
import { db } from '../db';
import type { Conversation, MemoryFact, Message, Persona } from '../types';
import { getActiveBranch } from './branch';
import { saveFile } from './save-file';

const CATEGORY_LABEL: Record<MemoryFact['category'], string> = {
  user_fact: '事实',
  preference: '偏好',
  relationship: '关系',
  event: '事件',
  context: '语境',
  other: '其他',
};

export type ConversationFormat = 'markdown' | 'text' | 'json';

export interface ConversationExportOptions {
  /** Active branch (default) vs full tree (includes alternate branches). */
  scope?: 'branch' | 'tree';
  format: ConversationFormat;
  /** Persona to render in headings if conversation has one. */
  persona?: Persona;
  /** Include token usage details. */
  includeUsage?: boolean;
}

export interface ExportedConversation {
  filename: string;
  mime: string;
  content: string;
}

export async function exportConversation(
  conversation: Conversation,
  opts: ConversationExportOptions,
): Promise<ExportedConversation> {
  const messages =
    opts.scope === 'tree'
      ? await db.messages
          .where({ conversationId: conversation.id })
          .sortBy('createdAt')
      : await getActiveBranch(conversation);

  const safeTitle = sanitizeFilename(conversation.title || '对话');
  const dateTag = formatDateTag(conversation.updatedAt);

  switch (opts.format) {
    case 'markdown': {
      const content = renderMarkdown(conversation, messages, opts);
      return {
        filename: `${safeTitle}-${dateTag}.md`,
        mime: 'text/markdown;charset=utf-8',
        content,
      };
    }
    case 'text': {
      const content = renderText(conversation, messages, opts);
      return {
        filename: `${safeTitle}-${dateTag}.txt`,
        mime: 'text/plain;charset=utf-8',
        content,
      };
    }
    case 'json': {
      const content = JSON.stringify(
        {
          __lisse: 'conversation',
          version: 1,
          conversation,
          messages,
        },
        null,
        2,
      );
      return {
        filename: `${safeTitle}-${dateTag}.json`,
        mime: 'application/json;charset=utf-8',
        content,
      };
    }
  }
}

function renderMarkdown(
  conversation: Conversation,
  messages: Message[],
  opts: ConversationExportOptions,
): string {
  const lines: string[] = [];
  lines.push(`# ${conversation.title || '对话'}\n`);
  const meta: string[] = [];
  meta.push(`- 创建：${formatDateTime(conversation.createdAt)}`);
  meta.push(`- 更新：${formatDateTime(conversation.updatedAt)}`);
  if (opts.persona) meta.push(`- 人格：${opts.persona.avatar} ${opts.persona.name}`);
  if (conversation.source && conversation.source !== 'native')
    meta.push(`- 来源：${conversation.source}`);
  meta.push(`- 消息数：${messages.length}`);
  lines.push(meta.join('\n'));
  lines.push('\n---\n');

  for (const m of messages) {
    if (m.role === 'system') continue;
    const heading = m.role === 'user' ? '## 👤 你' : '## 🤖 助手';
    const time = `*${formatDateTime(m.createdAt)}*`;
    lines.push(`${heading}  ${time}`);
    if (m.status === 'error') {
      lines.push(`> ⚠️ 出错：${m.errorMessage ?? '未知错误'}\n`);
    } else if (m.content) {
      lines.push(m.content);
    }
    if (
      opts.includeUsage &&
      m.role === 'assistant' &&
      m.usage &&
      (m.usage.inputTokens !== undefined || m.usage.outputTokens !== undefined)
    ) {
      const u = m.usage;
      const parts: string[] = [];
      if (u.inputTokens !== undefined) parts.push(`输入 ${u.inputTokens}`);
      if (u.outputTokens !== undefined) parts.push(`输出 ${u.outputTokens}`);
      if (u.cacheReadTokens) parts.push(`缓存命中 ${u.cacheReadTokens}`);
      lines.push(`<sub>${parts.join(' · ')}</sub>`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function renderText(
  conversation: Conversation,
  messages: Message[],
  opts: ConversationExportOptions,
): string {
  const lines: string[] = [];
  lines.push(conversation.title || '对话');
  lines.push('='.repeat(Math.max(8, (conversation.title || '对话').length * 2)));
  lines.push(`创建：${formatDateTime(conversation.createdAt)}`);
  lines.push(`更新：${formatDateTime(conversation.updatedAt)}`);
  if (opts.persona) lines.push(`人格：${opts.persona.name}`);
  lines.push('');

  for (const m of messages) {
    if (m.role === 'system') continue;
    const who = m.role === 'user' ? '【你】' : '【助手】';
    lines.push(`${who} ${formatDateTime(m.createdAt)}`);
    lines.push(m.status === 'error' ? `[错误] ${m.errorMessage ?? ''}` : m.content);
    lines.push('');
    lines.push('-'.repeat(40));
    lines.push('');
  }
  return lines.join('\n');
}

/** One month in milliseconds — used by "recent month" presets. */
export const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export interface ConversationsJsonBundle {
  __lisse: 'conversations';
  version: 1;
  exportedAt: number;
  scope: 'branch' | 'tree';
  items: Array<{ conversation: Conversation; messages: Message[] }>;
}

/**
 * Resolve conversations for selective export.
 * - `conversationIds` wins when provided (explicit checklist).
 * - else `sinceMs` filters by `updatedAt` (indexed).
 * - else all conversations, newest first.
 */
export async function resolveConversationsForExport(opts?: {
  conversationIds?: string[];
  sinceMs?: number;
}): Promise<Conversation[]> {
  if (opts?.conversationIds?.length) {
    const idSet = new Set(opts.conversationIds);
    const rows = await db.conversations.bulkGet([...idSet]);
    return rows
      .filter((c): c is Conversation => !!c)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  if (opts?.sinceMs != null) {
    const rows = await db.conversations
      .where('updatedAt')
      .aboveOrEqual(opts.sinceMs)
      .toArray();
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return db.conversations.orderBy('updatedAt').reverse().toArray();
}

/**
 * Export selected / recent conversations as one re-importable JSON bundle.
 * Format marker: `__lisse: "conversations"`.
 */
export async function exportConversationsJson(opts?: {
  conversationIds?: string[];
  sinceMs?: number;
  scope?: 'branch' | 'tree';
}): Promise<ExportedConversation & { count: number }> {
  const scope = opts?.scope ?? 'branch';
  const conversations = await resolveConversationsForExport(opts);
  if (conversations.length === 0) {
    throw new Error('没有可导出的对话');
  }

  const items: ConversationsJsonBundle['items'] = [];
  for (const conversation of conversations) {
    const messages =
      scope === 'tree'
        ? await db.messages
            .where({ conversationId: conversation.id })
            .sortBy('createdAt')
        : await getActiveBranch(conversation);
    items.push({ conversation, messages });
  }

  const exportedAt = Date.now();
  const bundle: ConversationsJsonBundle = {
    __lisse: 'conversations',
    version: 1,
    exportedAt,
    scope,
    items,
  };

  const tag =
    opts?.conversationIds?.length
      ? `selected-${conversations.length}`
      : opts?.sinceMs != null
        ? 'recent-1m'
        : 'all';

  return {
    filename: `lisse-conversations-${tag}-${formatDateTag(exportedAt)}.json`,
    mime: 'application/json;charset=utf-8',
    content: JSON.stringify(bundle, null, 2),
    count: conversations.length,
  };
}

/**
 * Bulk export: every conversation as a Markdown file zipped together.
 */
export async function exportAllConversationsZip(opts?: {
  scope?: 'branch' | 'tree';
  format?: ConversationFormat;
  includeUsage?: boolean;
  /** When set, only these conversation ids are exported. */
  conversationIds?: string[];
  /** When set (and no conversationIds), only conversations updated since this ms. */
  sinceMs?: number;
}): Promise<{ blob: Blob; filename: string; count: number }> {
  const format = opts?.format ?? 'markdown';
  const scope = opts?.scope ?? 'branch';

  const [conversations, personas] = await Promise.all([
    resolveConversationsForExport({
      conversationIds: opts?.conversationIds,
      sinceMs: opts?.sinceMs,
    }),
    db.personas.toArray(),
  ]);
  const personaMap = new Map(personas.map((p) => [p.id, p]));

  const zip = new JSZip();
  // Use a folder so unzipping doesn't litter the user's downloads dir.
  const root = zip.folder('lisse-conversations');
  if (!root) throw new Error('failed to create zip folder');

  const usedNames = new Set<string>();

  let count = 0;
  for (const conv of conversations) {
    const persona = conv.personaId ? personaMap.get(conv.personaId) : undefined;
    const exported = await exportConversation(conv, {
      scope,
      format,
      persona,
      includeUsage: opts?.includeUsage,
    });
    const filename = uniqueName(usedNames, exported.filename);
    root.file(filename, exported.content);
    count++;
  }

  // Manifest
  root.file(
    'README.txt',
    `Lisse conversation export
exported_at: ${new Date().toISOString()}
count: ${count}
format: ${format}
scope: ${scope}
`,
  );

  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = `lisse-conversations-${formatDateTag(Date.now())}.zip`;
  return { blob, filename, count };
}

/**
 * Memory export: one persona's facts as readable markdown.
 */
export async function exportPersonaMemoryMarkdown(
  personaId: string,
): Promise<ExportedConversation> {
  const [persona, facts] = await Promise.all([
    db.personas.get(personaId),
    db.memoryFacts.where({ personaId }).reverse().sortBy('createdAt'),
  ]);
  if (!persona) throw new Error('persona not found');

  const lines: string[] = [];
  lines.push(`# 记忆 · ${persona.avatar} ${persona.name}\n`);
  lines.push(`- 导出时间：${formatDateTime(Date.now())}`);
  lines.push(`- 共 ${facts.length} 条记忆`);
  lines.push('');

  // Group by category
  const byCategory = new Map<MemoryFact['category'], MemoryFact[]>();
  for (const f of facts) {
    if (f.archived) continue;
    const arr = byCategory.get(f.category) ?? [];
    arr.push(f);
    byCategory.set(f.category, arr);
  }

  for (const [cat, items] of byCategory) {
    lines.push(`\n## ${CATEGORY_LABEL[cat]}\n`);
    for (const f of items) {
      const tag = f.pinned ? '📌 ' : '';
      lines.push(`- ${tag}${f.text}`);
    }
  }

  if (byCategory.size === 0) {
    lines.push('\n*（暂无活跃记忆）*');
  }

  const archived = facts.filter((f) => f.archived);
  if (archived.length > 0) {
    lines.push(`\n---\n## 归档（${archived.length}）\n`);
    for (const f of archived) {
      lines.push(`- ~~${f.text}~~`);
    }
  }

  return {
    filename: `memory-${sanitizeFilename(persona.name)}-${formatDateTag(Date.now())}.md`,
    mime: 'text/markdown;charset=utf-8',
    content: lines.join('\n'),
  };
}

export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  await saveFile(blob, filename);
}

export async function downloadText(content: string, filename: string, mime: string): Promise<void> {
  await saveFile(new Blob([content], { type: mime }), filename);
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|\n\r\t]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || '未命名';
}

function uniqueName(used: Set<string>, name: string): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const base = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? '' : name.slice(dot);
  let n = 2;
  while (used.has(`${base}-${n}${ext}`)) n++;
  const final = `${base}-${n}${ext}`;
  used.add(final);
  return final;
}

function formatDateTag(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
