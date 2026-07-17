/**
 * Serial CLWD handoff job runner.
 *
 * One source conversation → one workspace session → jobs run one at a time.
 * Requires GitHub config in localStorage (same keys as Workshop page).
 */

import { db, getSettings } from '../../db';
import {
  getFileTree,
  getRepo,
  parseRepoInput,
  verifyToken,
  type GitHubConfig,
} from './github';
import {
  hasRunningJob,
  markJobCompleted,
  markJobFailed,
  markJobRunning,
  nextQueuedJob,
  putJob,
  updateJob,
} from './handoff-store';
import { setJobProgress, type HandoffJob } from './handoff-protocol';
import { formatHandoffResult, runWorkshopAgent } from './run-agent';

const GH_TOKEN_KEY = 'workshop_gh_token';
const GH_REPO_KEY = 'workshop_gh_repo';

/** Per-conversation run locks to keep jobs serial. */
const runningConversations = new Set<string>();
const abortControllers = new Map<string, AbortController>();

export function getWorkshopGitHubConfig(): {
  token: string;
  repoInput: string;
  cfg: GitHubConfig | null;
} {
  const token = localStorage.getItem(GH_TOKEN_KEY) ?? '';
  const repoInput = localStorage.getItem(GH_REPO_KEY) ?? '';
  const parsed = parseRepoInput(repoInput);
  if (!token || !parsed) {
    return { token, repoInput, cfg: null };
  }
  return { token, repoInput, cfg: { token, ...parsed } };
}

export async function pumpHandoffQueue(
  conversationId?: string,
): Promise<void> {
  // Prefer a specific conversation; otherwise drain any queued job.
  const seed =
    conversationId ??
    (await nextQueuedJob())?.source.conversation_id;
  if (!seed) return;
  if (runningConversations.has(seed)) return;
  if (await hasRunningJob(seed)) {
    runningConversations.add(seed);
    return;
  }

  runningConversations.add(seed);
  try {
    while (true) {
      const job = await nextQueuedJob(seed);
      if (!job) break;
      await executeJob(job);
    }
  } finally {
    runningConversations.delete(seed);
  }
}

async function executeJob(job: HandoffJob): Promise<void> {
  const { cfg } = getWorkshopGitHubConfig();
  if (!cfg) {
    await updateJob(job.id, (j) =>
      setJobProgress(
        j,
        'waiting_github',
        '请先在炼金工房连接 GitHub 仓库，任务会自动继续',
      ),
    );
    return;
  }

  const settings = await getSettings();
  const endpointId =
    settings.workshopEndpointId || settings.defaultEndpointId;
  const model =
    job.dispatch.model ||
    settings.workshopModel ||
    settings.defaultModel ||
    '';

  if (!endpointId || !model) {
    await updateJob(job.id, (j) =>
      setJobProgress(
        j,
        'waiting_model',
        '请在设置中配置炼金工房 worker 模型',
      ),
    );
    return;
  }

  const endpoint = await db.endpoints.get(endpointId);
  if (!endpoint) {
    await markJobFailed(job.id, 'worker endpoint 不存在');
    return;
  }

  const started = await markJobRunning(job.id);
  if (!started) return;

  const ctrl = new AbortController();
  abortControllers.set(job.id, ctrl);

  try {
    await verifyToken(cfg.token);
    const info = await getRepo(cfg);
    const tree = await getFileTree(cfg, info.defaultBranch);

    await updateJob(job.id, (j) =>
      setJobProgress(j, 'agent', `在 ${info.fullName} 施工中`),
    );

    const result = await runWorkshopAgent({
      endpoint,
      model,
      taskText: job.request,
      cfg,
      fileTree: tree,
      defaultBranch: info.defaultBranch,
      repoFullName: info.fullName,
      signal: ctrl.signal,
      onLog: async (msg, type) => {
        if (type === 'error') {
          await updateJob(job.id, (j) =>
            setJobProgress(j, 'agent', msg),
          );
        }
      },
    });

    // Persist staged changes onto the job for Workshop page pickup.
    const content = formatHandoffResult({
      title: job.title,
      summary: result.summary,
      stagedChanges: result.stagedChanges,
      errored: result.errored,
      errorMessage: result.errorMessage,
    });

    if (result.errored && result.stagedChanges.length === 0) {
      await markJobFailed(
        job.id,
        result.errorMessage || 'worker_failed',
      );
      return;
    }

    const completed = await markJobCompleted(job.id, {
      content,
      artifacts: result.stagedChanges.map((c) => ({
        name: c.path,
        path: c.path,
      })),
      model,
    });

    // Stash full staged file bodies in kv for Workshop commit UI.
    if (completed && result.stagedChanges.length > 0) {
      await db.kv.put({
        key: `handoff_staged_${job.id}`,
        value: result.stagedChanges,
      });
    }
  } catch (e) {
    if ((e as { name?: string }).name === 'AbortError') {
      await markJobFailed(job.id, '已取消');
    } else {
      await markJobFailed(
        job.id,
        e instanceof Error ? e.message : String(e),
      );
    }
  } finally {
    abortControllers.delete(job.id);
  }
}

export function abortHandoffJob(jobId: string): void {
  abortControllers.get(jobId)?.abort();
}

/** Resume any jobs stuck waiting on GitHub / model after config changes. */
export async function resumeWaitingJobs(): Promise<void> {
  const waiting = await db.handoffJobs
    .where('status')
    .equals('queued')
    .toArray();
  const byConv = new Set(waiting.map((j) => j.source.conversation_id));
  for (const id of byConv) {
    void pumpHandoffQueue(id);
  }
}

export async function loadStagedForJob(
  jobId: string,
): Promise<Array<{ path: string; content: string; reason: string }> | null> {
  const row = await db.kv.get(`handoff_staged_${jobId}`);
  if (!row) return null;
  return row.value as Array<{ path: string; content: string; reason: string }>;
}

/** Re-export put for progress updates from UI. */
export { putJob };
