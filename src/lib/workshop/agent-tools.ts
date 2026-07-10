/**
 * 炼金工房 · Agent 工具定义
 *
 * 这些工具让 AI agent 可以读取/修改 GitHub 仓库文件。
 * 遵循 Anthropic tool_use 格式，通过 streamChat 调用。
 */

import type { ToolDef } from '../../api/types';
import type { GitHubConfig, RepoFile } from './github';
import { readFile } from './github';

// ─── 工具定义（schema）─────────────────────────────────────────────

export const WORKSHOP_TOOL_DEFS: ToolDef[] = [
  {
    name: 'list_files',
    description:
      '列出仓库中的文件。可以按路径前缀过滤，返回文件路径列表。用于了解项目结构。',
    parameters: {
      type: 'object',
      properties: {
        prefix: {
          type: 'string',
          description: '可选：只列出以此路径开头的文件，如 "src/components"',
        },
        extensions: {
          type: 'array',
          items: { type: 'string' },
          description: '可选：只列出特定扩展名的文件，如 [".ts", ".tsx"]',
        },
        limit: {
          type: 'number',
          description: '返回文件数量上限，默认100',
        },
      },
      required: [],
    },
  },
  {
    name: 'read_file',
    description:
      '读取仓库中某个文件的完整内容。如果文件很大（>50KB），会截断返回。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '文件的完整路径，如 "src/components/Button.tsx"',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_text',
    description:
      '在仓库文件中搜索包含特定文本的文件路径。只匹配文件名/路径，不搜索内容（用 read_file 读内容）。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '要搜索的文本（大小写不敏感），匹配文件路径',
        },
        in_content_hint: {
          type: 'string',
          description: '可选：提示性内容关键词（实际上会在已读取的文件缓存中搜索）',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'write_file',
    description:
      '暂存一个文件的修改内容。所有 write_file 调用会被收集，最后一次性提交到 GitHub。不会立即写入——需要用户确认后才会真正提交。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '文件路径',
        },
        content: {
          type: 'string',
          description: '文件的完整新内容（不是 diff，是完整内容）',
        },
        reason: {
          type: 'string',
          description: '说明为什么要做这个修改',
        },
      },
      required: ['path', 'content', 'reason'],
    },
  },
  {
    name: 'task_done',
    description:
      '当所有代码修改都已完成（所有需要改的文件都调用了 write_file），调用此工具告知用户任务完成。',
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: '简要说明做了哪些修改以及为什么这样做',
        },
        files_changed: {
          type: 'array',
          items: { type: 'string' },
          description: '修改了哪些文件的路径列表',
        },
      },
      required: ['summary', 'files_changed'],
    },
  },
];

// ─── 工具执行上下文 ─────────────────────────────────────────────────

export interface WorkshopContext {
  cfg: GitHubConfig;
  fileTree: RepoFile[];
  /** 已读取文件的内容缓存 */
  fileCache: Map<string, string>;
  /** 暂存的文件变更（等待用户确认后提交） */
  stagedChanges: Map<string, { content: string; reason: string }>;
  /** 日志回调 */
  onLog?: (msg: string, type?: 'info' | 'success' | 'error' | 'tool') => void;
}

// ─── 工具处理器 ─────────────────────────────────────────────────────

export type ToolHandler = (
  input: unknown,
  ctx: WorkshopContext,
) => Promise<unknown>;

export const WORKSHOP_TOOL_HANDLERS: Record<string, ToolHandler> = {
  async list_files(input, ctx) {
    const inp = input as {
      prefix?: string;
      extensions?: string[];
      limit?: number;
    };
    const prefix = inp.prefix?.toLowerCase() ?? '';
    const exts = inp.extensions?.map((e) => e.toLowerCase()) ?? [];
    const limit = inp.limit ?? 100;

    let files = ctx.fileTree;
    if (prefix) {
      files = files.filter((f) => f.path.toLowerCase().startsWith(prefix));
    }
    if (exts.length > 0) {
      files = files.filter((f) => {
        const ext = f.path.slice(f.path.lastIndexOf('.')).toLowerCase();
        return exts.includes(ext);
      });
    }
    files = files.slice(0, limit);

    ctx.onLog?.(
      `列出文件: ${prefix || '/'} (${files.length} 个)`,
      'tool',
    );
    return {
      files: files.map((f) => ({
        path: f.path,
        size: f.size,
      })),
      total: files.length,
      truncated: files.length === limit,
    };
  },

  async read_file(input, ctx) {
    const inp = input as { path: string };
    const path = inp.path;

    // 先查缓存
    if (ctx.fileCache.has(path)) {
      ctx.onLog?.(`读取文件 (缓存): ${path}`, 'tool');
      const content = ctx.fileCache.get(path)!;
      return { path, content: truncateContent(content), size: content.length };
    }

    ctx.onLog?.(`读取文件: ${path}`, 'tool');
    try {
      const file = await readFile(ctx.cfg, path);
      ctx.fileCache.set(path, file.content);
      return {
        path,
        content: truncateContent(file.content),
        size: file.content.length,
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },

  async search_text(input, ctx) {
    const inp = input as { query: string; in_content_hint?: string };
    const q = inp.query.toLowerCase();

    // 在文件路径中搜索
    const pathMatches = ctx.fileTree
      .filter((f) => f.path.toLowerCase().includes(q))
      .slice(0, 20)
      .map((f) => f.path);

    // 在已缓存的文件内容中搜索
    const contentMatches: string[] = [];
    if (inp.in_content_hint) {
      const hint = inp.in_content_hint.toLowerCase();
      for (const [path, content] of ctx.fileCache) {
        if (content.toLowerCase().includes(hint) && !pathMatches.includes(path)) {
          contentMatches.push(path);
          if (contentMatches.length >= 10) break;
        }
      }
    }

    ctx.onLog?.(`搜索: "${inp.query}" → ${pathMatches.length + contentMatches.length} 个匹配`, 'tool');
    return {
      path_matches: pathMatches,
      content_matches: contentMatches,
      total: pathMatches.length + contentMatches.length,
    };
  },

  async write_file(input, ctx) {
    const inp = input as { path: string; content: string; reason: string };
    ctx.stagedChanges.set(inp.path, {
      content: inp.content,
      reason: inp.reason,
    });
    ctx.onLog?.(`暂存修改: ${inp.path}`, 'success');
    return {
      staged: true,
      path: inp.path,
      note: '文件已暂存，等待用户确认后提交到 GitHub',
    };
  },

  async task_done(input, ctx) {
    const inp = input as { summary: string; files_changed: string[] };
    ctx.onLog?.(`✨ 任务完成: ${inp.summary}`, 'success');
    return {
      done: true,
      summary: inp.summary,
      staged_count: ctx.stagedChanges.size,
    };
  },
};

// ─── 辅助函数 ────────────────────────────────────────────────────────

const MAX_FILE_CHARS = 80_000;

function truncateContent(content: string): string {
  if (content.length <= MAX_FILE_CHARS) return content;
  return (
    content.slice(0, MAX_FILE_CHARS) +
    `\n\n... [文件过大，已截断。原始大小: ${Math.round(content.length / 1024)}KB]`
  );
}

// ─── Agent 系统提示 ─────────────────────────────────────────────────

export function buildSystemPrompt(
  repoName: string,
  fileTree: RepoFile[],
  branch: string,
): string {
  // 文件树摘要（前200个文件）
  const treeSummary = fileTree
    .slice(0, 200)
    .map((f) => `  ${f.path}`)
    .join('\n');
  const truncated = fileTree.length > 200 ? `\n  ... 还有 ${fileTree.length - 200} 个文件` : '';

  return `你是炼金工房——一个能自主修改代码的 AI 编程 Agent。

## 当前仓库
- 仓库: ${repoName}
- 分支: ${branch}
- 文件总数: ${fileTree.length}

## 文件树（部分）
${treeSummary}${truncated}

## 工作流程
1. 用 list_files / read_file 了解代码结构
2. 分析需要修改哪些文件
3. 用 write_file 暂存所有修改（写完整文件内容，不是 diff）
4. 用 task_done 告知任务完成

## 重要规则
- write_file 必须写文件的**完整内容**，不是 diff，不是片段
- 保持代码风格与原始代码一致（缩进、引号、注释语言等）
- 优先修改最少的文件实现目标，不要过度修改
- 如果文件超过 80KB，只读取并修改必要部分
- 中文注释保持中文，英文注释保持英文
- 不要修改 lock 文件、.git 目录、二进制文件

## 省钱提示
你在省钱模式下运行。尽量减少不必要的 read_file 调用，
优先通过文件路径和名字推断文件用途，只读取真正需要的文件。`;
}
