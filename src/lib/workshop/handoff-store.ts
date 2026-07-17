/**
 * Durable CLWD handoff job store (Dexie) + enqueue helpers.
 */

import { db } from '../../db';
import { newId } from '../id';
import {
  createJob,
  extractTaskDeclarations,
  markResultsInjected,
  setJobProgress,
  setResultSelected,
  transitionJob,
  type HandoffJob,
  type HandoffTaskDeclaration,
} from './handoff-protocol';

export function workspaceIdForConversation(conversationId: string): string {
  return `work_${conversationId}`;
}

export async function listJobsForConversation(
  conversationId: string,
): Promise<HandoffJob[]> {
  return db.handoffJobs
    .where('source.conversation_id')
    .equals(conversationId)
    .reverse()
    .sortBy('created_at');
}

export async function listJobsForAssistant(
  assistantMessageId: string,
): Promise<HandoffJob[]> {
  return db.handoffJobs
    .where('source.assistant_node_id')
    .equals(assistantMessageId)
    .sortBy('created_at');
}

export async function getSelectedJobIds(
  conversationId: string,
): Promise<string[]> {
  const jobs = await db.handoffJobs
    .where('source.conversation_id')
    .equals(conversationId)
    .filter((j) => j.selected && j.status === 'completed')
    .toArray();
  return jobs.map((j) => j.id);
}

export async function putJob(job: HandoffJob): Promise<void> {
  await db.handoffJobs.put(job);
}

export async function updateJob(
  id: string,
  mutator: (job: HandoffJob) => HandoffJob,
): Promise<HandoffJob | null> {
  const current = await db.handoffJobs.get(id);
  if (!current) return null;
  const next = mutator(current);
  await db.handoffJobs.put(next);
  return next;
}

export async function toggleJobSelected(
  id: string,
  selected: boolean,
): Promise<HandoffJob | null> {
  return updateJob(id, (job) => setResultSelected(job, selected));
}

export async function enqueueTasksFromAssistant(opts: {
  assistantText: string;
  conversationId: string;
  assistantMessageId: string;
  turnId?: string;
  dispatch: { account: string; model: string };
}): Promise<{ cleanText: string; jobs: HandoffJob[] }> {
  const { visibleText, tasks } = extractTaskDeclarations(opts.assistantText);
  if (tasks.length === 0) {
    return { cleanText: visibleText, jobs: [] };
  }

  const workspaceConversationId = workspaceIdForConversation(
    opts.conversationId,
  );
  const jobs: HandoffJob[] = [];

  for (const task of tasks) {
    const job = createJob({
      id: `job_${newId()}`,
      task,
      source: {
        conversationId: opts.conversationId,
        turnId: opts.turnId,
        assistantNodeId: opts.assistantMessageId,
      },
      dispatch: opts.dispatch,
      workspaceConversationId,
    });
    await db.handoffJobs.put(job);
    jobs.push(job);
  }

  return { cleanText: visibleText, jobs };
}

export async function enqueueManualTask(opts: {
  conversationId: string;
  task: HandoffTaskDeclaration;
  dispatch: { account: string; model: string };
}): Promise<HandoffJob> {
  const job = createJob({
    id: `job_${newId()}`,
    task: opts.task,
    source: { conversationId: opts.conversationId },
    dispatch: opts.dispatch,
    workspaceConversationId: workspaceIdForConversation(opts.conversationId),
  });
  await db.handoffJobs.put(job);
  return job;
}

export async function markJobRunning(id: string): Promise<HandoffJob | null> {
  return updateJob(id, (job) =>
    setJobProgress(transitionJob(job, 'running'), 'running', '炼金工房施工中'),
  );
}

export async function markJobCompleted(
  id: string,
  result: {
    content: string;
    artifacts?: Array<{ name: string; path?: string; url?: string }>;
    model?: string;
  },
): Promise<HandoffJob | null> {
  return updateJob(id, (job) =>
    transitionJob(job, 'completed', {
      result: {
        content: result.content,
        artifacts: result.artifacts,
        model: result.model,
      },
    }),
  );
}

export async function markJobFailed(
  id: string,
  message: string,
): Promise<HandoffJob | null> {
  return updateJob(id, (job) =>
    transitionJob(job, 'failed', { error: { message } }),
  );
}

export async function requeueJob(id: string): Promise<HandoffJob | null> {
  return updateJob(id, (job) => transitionJob(job, 'queued'));
}

export async function applyInjectionReceipt(opts: {
  conversationId: string;
  jobIds: string[];
  userMessageId: string;
}): Promise<void> {
  const jobs = await db.handoffJobs.bulkGet(opts.jobIds);
  const owned = jobs.filter(
    (j): j is HandoffJob =>
      !!j &&
      j.source.conversation_id === opts.conversationId &&
      j.status === 'completed',
  );
  if (owned.length === 0) return;

  const updated = markResultsInjected(owned);
  await db.handoffJobs.bulkPut(updated);

  const receipt = {
    clwdResultsInjected: updated.map((j) => ({ id: j.id, title: j.title })),
    clwdResultsInjectedAt: Date.now(),
  };
  await db.messages.update(opts.userMessageId, receipt);
}

export async function nextQueuedJob(
  conversationId?: string,
): Promise<HandoffJob | undefined> {
  if (conversationId) {
    const jobs = await db.handoffJobs
      .where('source.conversation_id')
      .equals(conversationId)
      .filter((j) => j.status === 'queued')
      .sortBy('created_at');
    return jobs[0];
  }
  return db.handoffJobs.where('status').equals('queued').first();
}

export async function hasRunningJob(conversationId: string): Promise<boolean> {
  const n = await db.handoffJobs
    .where('source.conversation_id')
    .equals(conversationId)
    .filter((j) => j.status === 'running')
    .count();
  return n > 0;
}
