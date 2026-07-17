/**
 * CLWD Return Shelf — job progress + selective result pickup for chat.
 */

import { useLiveQuery } from 'dexie-react-hooks';
import {
  CheckCircle2,
  FlaskConical,
  Loader2,
  XCircle,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { listJobsForConversation, toggleJobSelected } from '../lib/workshop/handoff-store';
import type { HandoffJob } from '../lib/workshop/handoff-protocol';

interface Props {
  conversationId: string;
  disabled?: boolean;
}

function statusIcon(job: HandoffJob) {
  switch (job.status) {
    case 'queued':
      return <AlertCircle size={14} className="text-amber-600" />;
    case 'running':
      return <Loader2 size={14} className="animate-spin text-amber-700" />;
    case 'completed':
      return <CheckCircle2 size={14} className="text-emerald-600" />;
    case 'failed':
      return <XCircle size={14} className="text-rose-600" />;
  }
}

function statusLabel(job: HandoffJob): string {
  if (job.status === 'queued' && job.progress?.phase === 'waiting_github') {
    return '等待连接仓库';
  }
  if (job.status === 'queued' && job.progress?.phase === 'waiting_model') {
    return '等待配置模型';
  }
  switch (job.status) {
    case 'queued':
      return '排队中';
    case 'running':
      return '施工中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
  }
}

export default function HandoffReturnShelf({ conversationId, disabled }: Props) {
  const jobs = useLiveQuery(
    () => listJobsForConversation(conversationId),
    [conversationId],
    [],
  );

  // Show recent / active jobs — hide fully injected completed ones that
  // aren't selected (keep shelf focused).
  const visible = (jobs ?? []).filter((j) => {
    if (j.status === 'queued' || j.status === 'running' || j.status === 'failed') {
      return true;
    }
    if (j.status === 'completed') {
      return j.selected || j.injection_count === 0;
    }
    return false;
  }).slice(0, 8);

  if (visible.length === 0) return null;

  const selectedCount = visible.filter((j) => j.selected).length;

  async function onToggle(job: HandoffJob) {
    if (disabled || job.status !== 'completed') return;
    try {
      await toggleJobSelected(job.id, !job.selected);
    } catch {
      /* incomplete jobs cannot be selected */
    }
  }

  return (
    <div className="handoff-shelf mx-3 mb-2 md:mx-6">
      <div className="flex items-center gap-2 px-1 pb-1.5">
        <FlaskConical size={14} className="text-amber-700" />
        <span className="text-xs font-medium text-ink-600">炼金返回架</span>
        {selectedCount > 0 && (
          <span className="text-[11px] text-amber-800">
            已勾选 {selectedCount} 项 · 随下一条消息带回
          </span>
        )}
        <Link
          to="/workshop"
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-500 hover:text-ink-700"
        >
          打开工房
          <ExternalLink size={11} />
        </Link>
      </div>
      <ul className="space-y-1.5">
        {visible.map((job) => {
          const preview =
            job.status === 'completed'
              ? (job.result?.content || '').slice(0, 120)
              : job.progress?.detail || job.error?.message || job.request.slice(0, 80);
          return (
            <li key={job.id}>
              <button
                type="button"
                disabled={disabled || job.status !== 'completed'}
                onClick={() => onToggle(job)}
                className={[
                  'handoff-shelf-item w-full text-left',
                  job.selected ? 'handoff-shelf-item--selected' : '',
                  job.status === 'completed' ? 'cursor-pointer' : 'cursor-default',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">{statusIcon(job)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink-800">
                        {job.title}
                      </span>
                      <span className="shrink-0 text-[10px] text-ink-500">
                        {statusLabel(job)}
                      </span>
                      {job.selected && (
                        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-px text-[10px] text-amber-800">
                          将带回
                        </span>
                      )}
                    </div>
                    {preview && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-ink-500">
                        {preview}
                      </p>
                    )}
                  </div>
                  {job.status === 'completed' && (
                    <span
                      className={[
                        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                        job.selected
                          ? 'border-amber-600 bg-amber-500 text-white'
                          : 'border-ink-300 bg-white',
                      ].join(' ')}
                      aria-hidden
                    >
                      {job.selected ? '✓' : ''}
                    </span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
