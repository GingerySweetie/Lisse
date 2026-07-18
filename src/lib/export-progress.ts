/** Shared progress shape for long-running exports. */
export interface ExportProgress {
  done: number;
  total: number;
  /** 0–100 */
  percent: number;
  label: string;
  phase: string;
}

export type ExportProgressCallback = (p: ExportProgress) => void;

export function makeProgress(
  done: number,
  total: number,
  label: string,
  phase: string,
): ExportProgress {
  const t = Math.max(total, 0);
  const percent =
    t <= 0 ? 0 : Math.min(100, Math.round((Math.min(done, t) / t) * 100));
  return { done, total: t, percent, label, phase };
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('导出已取消', 'AbortError');
  }
}

export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string };
  return (
    e.name === 'AbortError' ||
    e.message === '导出已取消' ||
    (typeof e.message === 'string' && e.message.includes('导出已取消'))
  );
}

export function yieldToUi(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}
