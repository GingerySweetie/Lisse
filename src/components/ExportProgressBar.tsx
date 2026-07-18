import type { ExportProgress } from '../lib/export-progress';

export default function ExportProgressBar({
  progress,
  className,
}: {
  progress: ExportProgress;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, progress.percent));
  return (
    <div className={className ?? ''}>
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-ink-500">
        <span className="truncate">{progress.label}</span>
        <span className="shrink-0 font-mono tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-lavender-100">
        <div
          className="h-full rounded-full bg-lavender-400 transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      {progress.total > 0 && progress.phase !== 'save' && progress.phase !== 'done' && (
        <p className="mt-1 text-[10px] text-ink-400">
          {progress.done}/{progress.total}
        </p>
      )}
    </div>
  );
}
