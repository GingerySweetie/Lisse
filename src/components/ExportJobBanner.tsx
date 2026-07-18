import { Link, useLocation } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Square,
  X,
} from 'lucide-react';
import ExportProgressBar from './ExportProgressBar';
import {
  cancelExportJob,
  dismissExportJob,
  useExportJob,
} from '../lib/export-job';

/**
 * Global chip for long-running exports. Keeps running when the user leaves
 * /data; shows progress / result until dismissed.
 */
export default function ExportJobBanner() {
  const job = useExportJob();
  const location = useLocation();

  if (!job) return null;

  // On /data, inline section UI already shows the running progress bar —
  // hide the floating chip while running to avoid duplication. Finished /
  // failed jobs still surface here until dismissed (e.g. after returning
  // from another page).
  const onDataPage = location.pathname === '/data';
  if (onDataPage && job.status === 'running') return null;

  const bottomStyle = {
    bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
  } as const;

  return (
    <div
      style={bottomStyle}
      className="pointer-events-auto fixed inset-x-0 z-[95] mx-auto w-[min(94vw,26rem)] rounded-2xl border border-lavender-300 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0 text-lavender-500">
          {job.status === 'running' && <Download size={15} className="animate-pulse" />}
          {job.status === 'done' && <CheckCircle2 size={15} className="text-sky-500" />}
          {(job.status === 'fail' || job.status === 'cancelled') && (
            <AlertCircle size={15} className="text-rose-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium text-ink-900">
              {job.title}
              {job.status === 'running' && (
                <span className="ml-1.5 text-xs font-normal text-ink-400">
                  后台导出中
                </span>
              )}
            </p>
            {job.status !== 'running' && (
              <button
                type="button"
                onClick={() => dismissExportJob()}
                className="rounded-md p-0.5 text-ink-400 transition hover:bg-lavender-50 hover:text-ink-600"
                aria-label="关闭"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {job.status === 'running' && (
            <ExportProgressBar progress={job.progress} className="mt-1.5" />
          )}
          {job.status === 'done' && (
            <p className="mt-0.5 text-xs text-sky-600">{job.resultLabel ?? '已完成'}</p>
          )}
          {(job.status === 'fail' || job.status === 'cancelled') && (
            <p className="mt-0.5 break-all text-xs text-rose-500">
              {job.errorLabel ?? '导出失败'}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {job.status === 'running' && (
              <button
                type="button"
                onClick={() => cancelExportJob()}
                className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-600 transition hover:bg-rose-100"
              >
                <Square size={10} fill="currentColor" />
                取消
              </button>
            )}
            {!onDataPage && (
              <Link
                to="/data"
                className="rounded-lg border border-lavender-200 bg-lavender-50 px-2 py-1 text-[11px] text-ink-700 transition hover:bg-lavender-100"
              >
                打开导入/导出
              </Link>
            )}
            {onDataPage && job.status === 'running' && (
              <span className="text-[11px] text-ink-400">
                可离开本页，任务会继续
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
