import { useEffect, useState } from 'react';
import {
  downloadBackup,
  suggestedBackupFilename,
} from './backup';
import {
  clearBackupFolder,
  getValidBackupFolder,
  isBackupFolderPickerAvailable,
} from './backup-location';
import { formatExportSaveLabel } from './export-save-result';
import {
  downloadConfigBundle,
  type ConfigExportOptions,
} from './config-export';
import {
  downloadBlob,
  downloadText,
  exportAllConversationsZip,
  exportConversationsJson,
  type ConversationFormat,
} from './export';
import {
  isAbortError,
  makeProgress,
  type ExportProgress,
} from './export-progress';
import { newId } from './id';

export type ExportJobKind =
  | 'backup'
  | 'conversations-json'
  | 'conversations-zip'
  | 'config';

export type ExportJobStatus = 'running' | 'done' | 'fail' | 'cancelled';

export interface ExportJobState {
  id: string;
  kind: ExportJobKind;
  title: string;
  status: ExportJobStatus;
  progress: ExportProgress;
  resultLabel?: string;
  errorLabel?: string;
  startedAt: number;
  finishedAt?: number;
}

export type ExportJobSpec =
  | { kind: 'backup' }
  | {
      kind: 'conversations-json';
      conversationIds?: string[];
      sinceMs?: number;
      scope?: 'branch' | 'tree';
      /** Optional label suffix, e.g. "近一月". */
      titleHint?: string;
    }
  | {
      kind: 'conversations-zip';
      format?: ConversationFormat;
      scope?: 'branch' | 'tree';
      includeUsage?: boolean;
      conversationIds?: string[];
      sinceMs?: number;
    }
  | {
      kind: 'config';
      includeEndpoints?: boolean;
      includePersonas?: boolean;
      includeWritingStyles?: boolean;
      includeDefaults?: boolean;
    };

type Listener = (job: ExportJobState | null) => void;

let current: ExportJobState | null = null;
let abortController: AbortController | null = null;
let runPromise: Promise<ExportJobState> | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) {
    try {
      l(current);
    } catch {
      // ignore listener errors
    }
  }
}

function setJob(next: ExportJobState | null): void {
  current = next;
  emit();
}

function patchJob(patch: Partial<ExportJobState>): void {
  if (!current) return;
  current = { ...current, ...patch };
  emit();
}

function titleFor(spec: ExportJobSpec): string {
  switch (spec.kind) {
    case 'backup':
      return '全量备份';
    case 'conversations-json':
      return spec.titleHint
        ? `对话 JSON · ${spec.titleHint}`
        : '对话 JSON 导出';
    case 'conversations-zip':
      return '对话 ZIP 导出';
    case 'config':
      return '配置导出';
  }
}

export function getExportJob(): ExportJobState | null {
  return current;
}

export function isExportJobRunning(): boolean {
  return current?.status === 'running';
}

export function subscribeExportJob(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

/** React hook — subscribe to the module-level export job. */
export function useExportJob(): ExportJobState | null {
  const [job, setLocal] = useState<ExportJobState | null>(() => current);
  useEffect(() => subscribeExportJob(setLocal), []);
  return job;
}

export function cancelExportJob(): void {
  if (!abortController || current?.status !== 'running') return;
  abortController.abort();
}

/** Clear a finished job from the banner / page state. */
export function dismissExportJob(): void {
  if (!current || current.status === 'running') return;
  abortController = null;
  runPromise = null;
  setJob(null);
}

/**
 * Start a long-running export that survives route changes.
 * Rejects immediately if another export is already running.
 */
export function startExportJob(spec: ExportJobSpec): Promise<ExportJobState> {
  if (current?.status === 'running' || runPromise) {
    return Promise.reject(new Error('已有导出任务在进行中，请稍候或取消后再试'));
  }

  const id = newId();
  const controller = new AbortController();
  abortController = controller;

  const job: ExportJobState = {
    id,
    kind: spec.kind,
    title: titleFor(spec),
    status: 'running',
    progress: makeProgress(0, 1, '开始导出…', 'prepare'),
    startedAt: Date.now(),
  };
  setJob(job);

  const onProgress = (p: ExportProgress) => {
    if (current?.id !== id || current.status !== 'running') return;
    patchJob({ progress: p });
  };

  runPromise = (async () => {
    try {
      const resultLabel = await runSpec(spec, controller.signal, onProgress);
      const done: ExportJobState = {
        ...(current as ExportJobState),
        status: 'done',
        progress: makeProgress(1, 1, '完成', 'done'),
        resultLabel,
        finishedAt: Date.now(),
      };
      setJob(done);
      return done;
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) {
        const cancelled: ExportJobState = {
          ...(current as ExportJobState),
          status: 'cancelled',
          progress: {
            ...(current?.progress ?? makeProgress(0, 1, '已取消', 'cancelled')),
            label: '已取消',
            phase: 'cancelled',
          },
          errorLabel: '导出已取消',
          finishedAt: Date.now(),
        };
        setJob(cancelled);
        return cancelled;
      }
      const msg = err instanceof Error ? err.message : String(err);
      let errorLabel = msg;
      if (msg.includes('PERMISSION_LOST')) {
        await clearBackupFolder().catch(() => undefined);
        errorLabel = '备份目录权限已失效，请重新选择保存位置';
      }
      const fail: ExportJobState = {
        ...(current as ExportJobState),
        status: 'fail',
        errorLabel,
        finishedAt: Date.now(),
      };
      setJob(fail);
      return fail;
    } finally {
      abortController = null;
      runPromise = null;
    }
  })();

  return runPromise;
}

async function runSpec(
  spec: ExportJobSpec,
  signal: AbortSignal,
  onProgress: (p: ExportProgress) => void,
): Promise<string> {
  switch (spec.kind) {
    case 'backup': {
      const filename = suggestedBackupFilename();
      const folder = isBackupFolderPickerAvailable()
        ? await getValidBackupFolder()
        : null;
      await downloadBackup(filename, { signal, onProgress });
      if (folder) {
        const stillValid = await getValidBackupFolder();
        if (stillValid) return `已保存到「${stillValid.label}」`;
        return '已保存备份文件（目录权限已失效，已改存默认位置）';
      }
      return '已保存备份文件';
    }
    case 'conversations-json': {
      const r = await exportConversationsJson({
        conversationIds: spec.conversationIds,
        sinceMs: spec.sinceMs,
        scope: spec.scope,
        signal,
        onProgress,
      });
      onProgress(makeProgress(1, 1, '写入文件…', 'save'));
      const saved = await downloadText(r.content, r.filename, r.mime);
      const base = spec.titleHint
        ? `已导出${spec.titleHint} ${r.count} 条对话`
        : `已导出 ${r.count} 条对话 JSON`;
      return formatExportSaveLabel(saved, base);
    }
    case 'conversations-zip': {
      const r = await exportAllConversationsZip({
        format: spec.format,
        scope: spec.scope,
        includeUsage: spec.includeUsage ?? true,
        conversationIds: spec.conversationIds,
        sinceMs: spec.sinceMs,
        signal,
        onProgress,
      });
      onProgress(makeProgress(1, 1, '写入文件…', 'save'));
      const saved = await downloadBlob(r.blob, r.filename);
      return formatExportSaveLabel(saved, `已导出 ${r.count} 条对话`);
    }
    case 'config': {
      const opts: ConfigExportOptions = {
        includeEndpoints: spec.includeEndpoints,
        includePersonas: spec.includePersonas,
        includeWritingStyles: spec.includeWritingStyles,
        includeDefaults: spec.includeDefaults,
        signal,
        onProgress,
      };
      const saved = await downloadConfigBundle(opts);
      return formatExportSaveLabel(saved, '已保存配置 JSON');
    }
  }
}
