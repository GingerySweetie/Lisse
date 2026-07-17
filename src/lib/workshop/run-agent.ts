/**
 * Shared workshop agent runner — used by Workshop page and CLWD handoff jobs.
 */

import type { ChatTurn } from '../../api/types';
import type { Endpoint } from '../../types';
import type { Tool } from '../tools';
import { runToolLoop } from '../tools/loop';
import {
  WORKSHOP_TOOL_DEFS,
  WORKSHOP_TOOL_HANDLERS,
  buildSystemPrompt,
  type WorkshopContext,
} from './agent-tools';
import type { GitHubConfig, RepoFile } from './github';

export interface StagedChange {
  path: string;
  content: string;
  reason: string;
}

export interface WorkshopRunResult {
  errored: boolean;
  errorMessage?: string;
  summary: string;
  stagedChanges: StagedChange[];
  usage?: { inputTokens: number; outputTokens: number };
}

export async function runWorkshopAgent(opts: {
  endpoint: Endpoint;
  model: string;
  taskText: string;
  cfg: GitHubConfig;
  fileTree: RepoFile[];
  defaultBranch: string;
  repoFullName: string;
  signal?: AbortSignal;
  onLog?: (msg: string, type?: 'info' | 'success' | 'error' | 'tool') => void;
  maxRounds?: number;
}): Promise<WorkshopRunResult> {
  const fileCache = new Map<string, string>();
  const staged = new Map<string, { content: string; reason: string }>();

  const workshopCtx: WorkshopContext = {
    cfg: opts.cfg,
    fileTree: opts.fileTree,
    fileCache,
    stagedChanges: staged,
    onLog: opts.onLog,
  };

  const workshopTools: Tool[] = WORKSHOP_TOOL_DEFS.map((def) => ({
    def,
    handler: async (input: unknown) => {
      const fn = WORKSHOP_TOOL_HANDLERS[def.name];
      return fn(input, workshopCtx);
    },
  }));

  const systemPrompt = buildSystemPrompt(
    opts.repoFullName,
    opts.fileTree,
    opts.defaultBranch,
  );

  const initialTurns: ChatTurn[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: opts.taskText.trim() },
  ];

  let summary = '';

  const result = await runToolLoop({
    endpoint: opts.endpoint,
    model: opts.model,
    initialTurns,
    tools: workshopTools,
    ctx: { conversationId: 'workshop' },
    signal: opts.signal,
    maxRounds: opts.maxRounds ?? 20,
    callbacks: {
      onTextDelta: () => {},
      onToolCallResolved: (call) => {
        if (call.name === 'task_done') {
          const inp = call.input as { summary?: string };
          if (inp.summary) summary = inp.summary;
        }
      },
    },
  });

  const stagedChanges: StagedChange[] = Array.from(staged.entries()).map(
    ([path, v]) => ({ path, content: v.content, reason: v.reason }),
  );

  if (!summary) {
    summary =
      result.text?.trim().slice(0, 800) ||
      (stagedChanges.length > 0
        ? `已暂存 ${stagedChanges.length} 个文件修改。`
        : '任务结束，无文件修改。');
  }

  return {
    errored: !!result.errored,
    errorMessage: result.errorMessage,
    summary,
    stagedChanges,
    usage: result.usage
      ? {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
        }
      : undefined,
  };
}

/** Build a CLWD result content string from a workshop run. */
export function formatHandoffResult(opts: {
  title: string;
  summary: string;
  stagedChanges: StagedChange[];
  errored?: boolean;
  errorMessage?: string;
}): string {
  const lines: string[] = [`# ${opts.title}`, '', opts.summary];
  if (opts.stagedChanges.length > 0) {
    lines.push('', '## 暂存修改');
    for (const c of opts.stagedChanges) {
      lines.push(`- \`${c.path}\`: ${c.reason}`);
    }
  }
  if (opts.errored) {
    lines.push('', `## 错误`, opts.errorMessage || 'unknown');
  }
  lines.push(
    '',
    '（完整文件内容已在炼金工房暂存；可在炼金工房页面确认后提交到 GitHub。）',
  );
  return lines.join('\n');
}
