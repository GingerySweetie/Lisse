/**
 * Cursor Cloud Agent runner for 炼金工房.
 * Creates an agent (or follow-up run), streams SSE with poll fallback.
 */

import {
  cancelCursorRun,
  createCursorAgent,
  createCursorFollowUp,
  getCursorAgentUsage,
  getCursorRun,
  isTerminalRunStatus,
  streamCursorRun,
  type CursorAgent,
  type CursorGitBranch,
  type CursorRun,
  type CursorTokenUsage,
  type CreateAgentInput,
} from './cursor-api';

export interface CursorAgentResult {
  errored: boolean;
  errorMessage?: string;
  summary: string;
  agent: CursorAgent;
  run: CursorRun;
  branches: CursorGitBranch[];
  usage?: CursorTokenUsage;
  durationMs?: number;
}

export type CursorLogFn = (
  message: string,
  type?: 'info' | 'success' | 'error' | 'tool' | 'system',
) => void;

const POLL_MS = 2500;

export async function runCursorCloudAgent(opts: {
  apiKey: string;
  baseUrl?: string;
  taskText: string;
  repoUrl: string;
  startingRef?: string;
  modelId?: string;
  modelParams?: Array<{ id: string; value: string }>;
  autoCreatePR?: boolean;
  mode?: 'agent' | 'plan';
  /** Resume / follow-up on an existing agent */
  agentId?: string;
  signal?: AbortSignal;
  onLog?: CursorLogFn;
  onAgent?: (agent: CursorAgent, run: CursorRun) => void;
}): Promise<CursorAgentResult> {
  const log = opts.onLog ?? (() => {});
  let agent: CursorAgent;
  let run: CursorRun;

  if (opts.agentId) {
    log(`发送跟进到 Agent ${opts.agentId.slice(0, 12)}…`, 'system');
    const follow = await createCursorFollowUp(
      opts.apiKey,
      opts.agentId,
      opts.taskText,
      { mode: opts.mode, baseUrl: opts.baseUrl },
    );
    run = follow.run;
    agent = {
      id: opts.agentId,
      name: opts.agentId,
      status: 'ACTIVE',
      url: `https://cursor.com/agents/${opts.agentId}`,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      latestRunId: run.id,
    };
  } else {
    const input: CreateAgentInput = {
      prompt: opts.taskText,
      repoUrl: opts.repoUrl,
      startingRef: opts.startingRef,
      modelId: opts.modelId,
      modelParams: opts.modelParams,
      autoCreatePR: opts.autoCreatePR ?? true,
      mode: opts.mode ?? 'agent',
      name: opts.taskText.trim().slice(0, 80),
    };
    log(`创建 Cursor Cloud Agent…`, 'system');
    const created = await createCursorAgent(opts.apiKey, input, opts.baseUrl);
    agent = created.agent;
    run = created.run;
  }

  opts.onAgent?.(agent, run);
  log(`Agent: ${agent.name || agent.id}`, 'info');
  log(`打开: ${agent.url}`, 'info');
  log(`Run ${run.id.slice(0, 12)}… · ${run.status}`, 'info');

  // Cancel wiring
  const onAbort = () => {
    void cancelCursorRun(opts.apiKey, agent.id, run.id, opts.baseUrl).catch(
      () => {},
    );
  };
  opts.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const streamed = await consumeStreamOrPoll({
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl,
      agentId: agent.id,
      runId: run.id,
      signal: opts.signal,
      onLog: log,
    });
    run = streamed.run;

    let usage: CursorTokenUsage | undefined;
    try {
      const u = await getCursorAgentUsage(
        opts.apiKey,
        agent.id,
        run.id,
        opts.baseUrl,
      );
      usage = u.totalUsage;
      if (usage && usage.totalTokens > 0) {
        log(
          `用量: ${usage.totalTokens.toLocaleString()} tokens（含缓存）`,
          'info',
        );
      }
    } catch {
      // usage endpoint is best-effort
    }

    const branches = run.git?.branches ?? [];
    for (const b of branches) {
      if (b.branch) log(`分支: ${b.branch}`, 'success');
      if (b.prUrl) log(`PR: ${b.prUrl}`, 'success');
    }

    const errored = run.status === 'ERROR' || run.status === 'EXPIRED';
    const cancelled = run.status === 'CANCELLED';
    const summary =
      run.result?.trim() ||
      (errored
        ? 'Cursor Agent 运行失败'
        : cancelled
          ? '已取消'
          : 'Cursor Agent 已完成');

    if (errored) log(summary, 'error');
    else if (cancelled) log(summary, 'info');
    else log(summary.slice(0, 200), 'success');

    return {
      errored: errored || cancelled,
      errorMessage: errored ? summary : cancelled ? 'cancelled' : undefined,
      summary,
      agent,
      run,
      branches,
      usage,
      durationMs: run.durationMs,
    };
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

async function consumeStreamOrPoll(opts: {
  apiKey: string;
  baseUrl?: string;
  agentId: string;
  runId: string;
  signal?: AbortSignal;
  onLog: CursorLogFn;
}): Promise<{ run: CursorRun }> {
  let assistantBuf = '';
  let lastToolLine = '';

  try {
    for await (const ev of streamCursorRun(
      opts.apiKey,
      opts.agentId,
      opts.runId,
      { signal: opts.signal, baseUrl: opts.baseUrl },
    )) {
      if (opts.signal?.aborted) break;
      switch (ev.type) {
        case 'status':
          opts.onLog(`状态: ${ev.status}`, 'info');
          break;
        case 'assistant':
          assistantBuf += ev.text;
          // Log short chunks only when we hit a newline / length threshold
          if (assistantBuf.includes('\n') || assistantBuf.length > 120) {
            const line = assistantBuf.trim().slice(0, 160);
            if (line) opts.onLog(line, 'info');
            assistantBuf = '';
          }
          break;
        case 'tool_call': {
          const line =
            ev.status === 'running'
              ? `🔧 ${ev.name}`
              : `✓ ${ev.name}`;
          if (line !== lastToolLine) {
            opts.onLog(line, 'tool');
            lastToolLine = line;
          }
          break;
        }
        case 'result': {
          if (assistantBuf.trim()) {
            opts.onLog(assistantBuf.trim().slice(0, 160), 'info');
            assistantBuf = '';
          }
          const run: CursorRun = {
            id: ev.runId || opts.runId,
            agentId: opts.agentId,
            status: ev.status,
            createdAt: '',
            updatedAt: new Date().toISOString(),
            durationMs: ev.durationMs,
            result: ev.text,
            git: ev.git,
          };
          // Prefer authoritative GET for full fields
          try {
            return {
              run: await getCursorRun(
                opts.apiKey,
                opts.agentId,
                opts.runId,
                opts.baseUrl,
              ),
            };
          } catch {
            return { run };
          }
        }
        case 'error':
          opts.onLog(`流错误: ${ev.message}`, 'error');
          break;
        case 'done':
          break;
        default:
          break;
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    opts.onLog(`${msg} · 改用轮询`, 'info');
  }

  return pollUntilDone(opts);
}

async function pollUntilDone(opts: {
  apiKey: string;
  baseUrl?: string;
  agentId: string;
  runId: string;
  signal?: AbortSignal;
  onLog: CursorLogFn;
}): Promise<{ run: CursorRun }> {
  let lastStatus = '';
  while (true) {
    if (opts.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const run = await getCursorRun(
      opts.apiKey,
      opts.agentId,
      opts.runId,
      opts.baseUrl,
    );
    if (run.status !== lastStatus) {
      opts.onLog(`状态: ${run.status}`, 'info');
      lastStatus = run.status;
    }
    if (isTerminalRunStatus(run.status)) {
      return { run };
    }
    await sleep(POLL_MS, opts.signal);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}
