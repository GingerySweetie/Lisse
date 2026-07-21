import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  Database,
  Download,
  Upload,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ShieldAlert,
  FolderOpen,
  FolderCheck,
  Square,
  Search,
  HardDrive,
  FileJson,
} from 'lucide-react';
import { db } from '../db';
import { getLastBackupAt, type ImportBackupResult } from '../lib/backup';
import { importBackupStream } from '../lib/backup-stream-import';
import {
  assertBackupImportFileSize,
  assertImportFileSize,
  formatStorageError,
} from '../lib/storage-guards';
import {
  getBackupFolder,
  getValidBackupFolder,
  isBackupFolderPickerAvailable,
  pickBackupFolder,
  type BackupFolder,
} from '../lib/backup-location';
import { formatExportSaveLabel } from '../lib/export-save-result';
import {
  importChatGPT,
  importClaude,
  importLisseConversation,
  type ImportResult,
} from '../lib/import';
import {
  exportPersonaMemoryMarkdown,
  downloadText,
  ONE_MONTH_MS,
  type ConversationFormat,
} from '../lib/export';
import {
  importConfigBundle,
  type ImportConfigResult,
} from '../lib/config-export';
import {
  cancelExportJob,
  startExportJob,
  useExportJob,
  type ExportJobKind,
} from '../lib/export-job';
import ExportProgressBar from '../components/ExportProgressBar';
import type { ExportProgress } from '../lib/export-progress';
import {
  copyRecoverableToDownloads,
  filesToRecoverableItems,
  formatBytes,
  importRecoverableItem,
  isDirectoryPickerAvailable,
  isNativeRecoverAvailable,
  kindLabel,
  peekRecoverKind,
  pickRecoverDirectory,
  scanRecoverableNative,
  sourceLabel,
  summarizeRecoverOutcome,
  type RecoverableItem,
} from '../lib/recover';
import {
  getStoragePersistState,
  requestPersistentStorage,
  type StoragePersistState,
} from '../lib/storage-persist';

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'ok'; label: string }
  | { kind: 'fail'; label: string };

interface DbCounts {
  conversations: number;
  messages: number;
  personas: number;
  endpoints: number;
  memoryFacts: number;
  writingStyles: number;
  books: number;
  bills: number;
  circlePosts: number;
  periodEntries: number;
  weightEntries: number;
  healthDaily: number;
  musicHistory: number;
  mcpServers: number;
  error?: string;
}

async function readAllCounts(): Promise<DbCounts> {
  try {
    const [
      conversations,
      messages,
      personas,
      endpoints,
      memoryFacts,
      writingStyles,
      books,
      bills,
      circlePosts,
      periodEntries,
      weightEntries,
      healthDaily,
      musicHistory,
      mcpServers,
    ] = await Promise.all([
      db.conversations.count(),
      db.messages.count(),
      db.personas.count(),
      db.endpoints.count(),
      db.memoryFacts.count(),
      db.writingStyles.count(),
      db.books.count(),
      db.bills.count(),
      db.circlePosts.count(),
      db.periodEntries.count(),
      db.weightEntries.count(),
      db.healthDaily.count(),
      db.musicHistory.count(),
      db.mcpServers.count(),
    ]);
    return {
      conversations,
      messages,
      personas,
      endpoints,
      memoryFacts,
      writingStyles,
      books,
      bills,
      circlePosts,
      periodEntries,
      weightEntries,
      healthDaily,
      musicHistory,
      mcpServers,
    };
  } catch (err) {
    return {
      conversations: 0,
      messages: 0,
      personas: 0,
      endpoints: 0,
      memoryFacts: 0,
      writingStyles: 0,
      books: 0,
      bills: 0,
      circlePosts: 0,
      periodEntries: 0,
      weightEntries: 0,
      healthDaily: 0,
      musicHistory: 0,
      mcpServers: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default function ImportExportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const personas = useLiveQuery(() => db.personas.toArray(), [], []);
  const endpoints = useLiveQuery(() => db.endpoints.toArray(), [], []);
  const conversations = useLiveQuery(
    () => db.conversations.orderBy('updatedAt').reverse().toArray(),
    [],
    [],
  );
  const lastBackupAt = useLiveQuery(() => getLastBackupAt(), [], null);
  const exportJob = useExportJob();
  const exportBusy = exportJob?.status === 'running';
  const mountedRef = useRef(true);
  const appliedJobIdRef = useRef<string | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Data diagnostics ────────────────────────────────────────────────────
  const [diagOpen, setDiagOpen] = useState(false);
  const [counts, setCounts] = useState<DbCounts | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const [persistState, setPersistState] = useState<StoragePersistState | null>(
    null,
  );

  // Run an initial count on mount so the header badge is always accurate.
  useEffect(() => {
    readAllCounts().then(setCounts).catch(() => undefined);
    getStoragePersistState().then(setPersistState).catch(() => undefined);
  }, []);

  async function refreshCounts() {
    setDiagBusy(true);
    try {
      // If the DB is blocked / stuck, try reopening first.
      if (!db.isOpen()) {
        await db.open();
      }
      setCounts(await readAllCounts());
      setPersistState(await getStoragePersistState());
    } finally {
      setDiagBusy(false);
    }
  }

  const [persistFeedback, setPersistFeedback] = useState<string | null>(null);

  async function handleRequestPersist() {
    setDiagBusy(true);
    setPersistFeedback('正在向系统申请…');
    try {
      const next = await requestPersistentStorage();
      setPersistState(next);
      setPersistFeedback(
        next.message ??
          (next.persisted
            ? '已开启持久化存储。'
            : '申请完成，但系统未批准（Android 上常见，不一定会弹窗）。'),
      );
    } finally {
      setDiagBusy(false);
    }
  }

  const totalRecords = counts
    ? counts.conversations + counts.messages + counts.memoryFacts +
      counts.bills + counts.circlePosts + counts.periodEntries +
      counts.weightEntries + counts.musicHistory
    : null;

  // Stable "now" snapshot for overdue / recent-month filters (lazy init once).
  const [mountedAtMs] = useState(() => Date.now());
  const backupOverdue =
    lastBackupAt === null ||
    mountedAtMs - lastBackupAt > 7 * 24 * 60 * 60 * 1000;

  const [importPersonaId, setImportPersonaId] = useState<string>('');
  const [importEndpointId, setImportEndpointId] = useState<string>('');
  const [importModel, setImportModel] = useState<string>('');

  const [chatgptStatus, setChatgptStatus] = useState<Status>({ kind: 'idle' });
  const [claudeStatus, setClaudeStatus] = useState<Status>({ kind: 'idle' });
  const [lisseStatus, setLisseStatus] = useState<Status>({ kind: 'idle' });
  const [backupStatus, setBackupStatus] = useState<Status>({ kind: 'idle' });
  const backupFolderPickerAvailable = isBackupFolderPickerAvailable();
  const [backupFolder, setBackupFolder] = useState<BackupFolder | null>(null);
  const [backupFolderPermissionLost, setBackupFolderPermissionLost] =
    useState(false);
  const [backupFolderBusy, setBackupFolderBusy] = useState(false);

  useEffect(() => {
    if (!backupFolderPickerAvailable) return;
    let cancelled = false;
    void (async () => {
      const saved = await getBackupFolder();
      if (cancelled) return;
      if (!saved) {
        setBackupFolder(null);
        return;
      }
      const valid = await getValidBackupFolder();
      if (cancelled) return;
      if (valid) {
        setBackupFolder(valid);
        setBackupFolderPermissionLost(false);
      } else {
        setBackupFolder(null);
        setBackupFolderPermissionLost(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backupFolderPickerAvailable]);
  const [bulkStatus, setBulkStatus] = useState<Status>({ kind: 'idle' });
  const [selectStatus, setSelectStatus] = useState<Status>({ kind: 'idle' });
  const [configStatus, setConfigStatus] = useState<Status>({ kind: 'idle' });
  const [memoryExportStatus, setMemoryExportStatus] = useState<Status>({
    kind: 'idle',
  });

  // ── Manual recover ──────────────────────────────────────────────────────
  const nativeRecoverAvailable = isNativeRecoverAvailable();
  const directoryPickerAvailable = isDirectoryPickerAvailable();
  const [recoverItems, setRecoverItems] = useState<RecoverableItem[]>([]);
  const [recoverStatus, setRecoverStatus] = useState<Status>({ kind: 'idle' });
  const [recoverBusyId, setRecoverBusyId] = useState<string | null>(null);
  const [recoverScanNote, setRecoverScanNote] = useState<string | null>(null);
  const recoverFileInputRef = useRef<HTMLInputElement>(null);
  const recoverDirInputRef = useRef<HTMLInputElement>(null);

  // If the user left /data while exporting, sync the finished job into the
  // matching section status when they come back.
  useEffect(() => {
    if (!exportJob || exportJob.status === 'running') return;
    if (appliedJobIdRef.current === exportJob.id) return;
    appliedJobIdRef.current = exportJob.id;
    switch (exportJob.kind) {
      case 'backup':
        applyJobResult(exportJob, setBackupStatus);
        break;
      case 'conversations-json':
        applyJobResult(exportJob, setSelectStatus);
        break;
      case 'conversations-zip':
        applyJobResult(exportJob, setBulkStatus);
        break;
      case 'config':
        applyJobResult(exportJob, setConfigStatus);
        break;
    }
  }, [exportJob]);

  function setIfMounted(setter: (s: Status) => void, status: Status) {
    if (mountedRef.current) setter(status);
  }

  const [bulkFormat, setBulkFormat] = useState<ConversationFormat>('markdown');
  const [bulkScope, setBulkScope] = useState<'branch' | 'tree'>('branch');
  const [selectScope, setSelectScope] = useState<'branch' | 'tree'>('branch');
  const [selectedConvIds, setSelectedConvIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [memoryPersonaId, setMemoryPersonaId] = useState<string>('');

  const [cfgPersonas, setCfgPersonas] = useState(true);
  const [cfgStyles, setCfgStyles] = useState(true);
  const [cfgEndpoints, setCfgEndpoints] = useState(true);
  const [cfgDefaults, setCfgDefaults] = useState(true);

  const monthCutoffMs = mountedAtMs - ONE_MONTH_MS;

  const recentMonthConversations = useMemo(
    () => (conversations ?? []).filter((c) => c.updatedAt >= monthCutoffMs),
    [conversations, monthCutoffMs],
  );

  const selectedEndpoint = endpoints?.find((e) => e.id === importEndpointId);

  async function readFile(file: File, label = '导入文件'): Promise<string> {
    assertImportFileSize(file, label);
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? ''));
      r.onerror = () => reject(r.error ?? new Error('文件读取失败'));
      r.readAsText(file);
    });
  }

  async function handleChatGPT(file: File) {
    setChatgptStatus({ kind: 'busy', label: '解析中…' });
    try {
      const text = await readFile(file, 'ChatGPT 导出');
      const result = await importChatGPT(text, {
        personaId: importPersonaId || undefined,
        defaultEndpointId: importEndpointId || undefined,
        defaultModel: importModel || undefined,
      });
      setChatgptStatus({ kind: 'ok', label: summarizeImport(result) });
    } catch (err) {
      setChatgptStatus({
        kind: 'fail',
        label: formatStorageError(err),
      });
    }
  }

  async function handleClaude(file: File) {
    setClaudeStatus({ kind: 'busy', label: '解析中…' });
    try {
      const text = await readFile(file, 'Claude 导出');
      const result = await importClaude(text, {
        personaId: importPersonaId || undefined,
        defaultEndpointId: importEndpointId || undefined,
        defaultModel: importModel || undefined,
      });
      setClaudeStatus({ kind: 'ok', label: summarizeImport(result) });
    } catch (err) {
      setClaudeStatus({
        kind: 'fail',
        label: formatStorageError(err),
      });
    }
  }

  async function handleLisse(file: File) {
    setLisseStatus({ kind: 'busy', label: '解析中…' });
    try {
      const text = await readFile(file, 'Wisteria 对话导出');
      const result = await importLisseConversation(text);
      setLisseStatus({ kind: 'ok', label: summarizeImport(result) });
    } catch (err) {
      setLisseStatus({
        kind: 'fail',
        label: formatStorageError(err),
      });
    }
  }

  async function handleExportBackup() {
    setBackupStatus({ kind: 'idle' });
    try {
      const job = await startExportJob({ kind: 'backup' });
      if (!mountedRef.current) return;
      if (job.status === 'done') {
        const stillValid = backupFolderPickerAvailable
          ? await getValidBackupFolder()
          : null;
        if (!mountedRef.current) return;
        if (stillValid) {
          setBackupFolder(stillValid);
          setBackupFolderPermissionLost(false);
        } else if (backupFolderPickerAvailable && backupFolder) {
          const valid = await getValidBackupFolder();
          if (!mountedRef.current) return;
          if (!valid) {
            setBackupFolder(null);
            setBackupFolderPermissionLost(true);
          }
        }
        setBackupStatus({ kind: 'ok', label: job.resultLabel ?? '已保存备份文件' });
      } else if (job.status === 'cancelled') {
        setBackupStatus({ kind: 'fail', label: '导出已取消' });
      } else if (job.status === 'fail') {
        if (job.errorLabel?.includes('权限')) {
          setBackupFolder(null);
          setBackupFolderPermissionLost(true);
        }
        setBackupStatus({ kind: 'fail', label: job.errorLabel ?? '导出失败' });
      }
    } catch (err) {
      setIfMounted(setBackupStatus, {
        kind: 'fail',
        label: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handlePickBackupFolder() {
    if (!backupFolderPickerAvailable) return;
    setBackupFolderBusy(true);
    setBackupStatus({ kind: 'idle' });
    try {
      const folder = await pickBackupFolder();
      setBackupFolder(folder);
      setBackupFolderPermissionLost(false);
      setBackupStatus({
        kind: 'ok',
        label: `已设置导出目录：${folder.label}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('用户取消了选择')) {
        setBackupStatus({ kind: 'fail', label: msg });
      }
    } finally {
      setBackupFolderBusy(false);
    }
  }

  async function handleBulkExport() {
    setBulkStatus({ kind: 'idle' });
    try {
      const job = await startExportJob({
        kind: 'conversations-zip',
        format: bulkFormat,
        scope: bulkScope,
        includeUsage: true,
      });
      if (mountedRef.current) applyJobResult(job, setBulkStatus);
    } catch (err) {
      setIfMounted(setBulkStatus, {
        kind: 'fail',
        label: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function toggleConvId(id: string) {
    setSelectedConvIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectRecentMonth() {
    setSelectedConvIds(new Set(recentMonthConversations.map((c) => c.id)));
  }

  function selectAllConversations() {
    setSelectedConvIds(new Set((conversations ?? []).map((c) => c.id)));
  }

  function clearSelectedConversations() {
    setSelectedConvIds(new Set());
  }

  async function handleSelectExportJson() {
    if (selectedConvIds.size === 0) {
      setSelectStatus({ kind: 'fail', label: '请先勾选要导出的对话' });
      return;
    }
    setSelectStatus({ kind: 'idle' });
    try {
      const job = await startExportJob({
        kind: 'conversations-json',
        conversationIds: [...selectedConvIds],
        scope: selectScope,
        titleHint: '已选',
      });
      if (mountedRef.current) applyJobResult(job, setSelectStatus);
    } catch (err) {
      setIfMounted(setSelectStatus, {
        kind: 'fail',
        label: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleRecentMonthExportJson() {
    setSelectStatus({ kind: 'idle' });
    try {
      const job = await startExportJob({
        kind: 'conversations-json',
        sinceMs: monthCutoffMs,
        scope: selectScope,
        titleHint: '近一月',
      });
      if (!mountedRef.current) return;
      if (job.status === 'done') {
        setSelectedConvIds(new Set(recentMonthConversations.map((c) => c.id)));
      }
      applyJobResult(job, setSelectStatus);
    } catch (err) {
      setIfMounted(setSelectStatus, {
        kind: 'fail',
        label: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleExportConfig() {
    setConfigStatus({ kind: 'idle' });
    try {
      const job = await startExportJob({
        kind: 'config',
        includePersonas: cfgPersonas,
        includeWritingStyles: cfgStyles,
        includeEndpoints: cfgEndpoints,
        includeDefaults: cfgDefaults,
      });
      if (mountedRef.current) applyJobResult(job, setConfigStatus);
    } catch (err) {
      setIfMounted(setConfigStatus, {
        kind: 'fail',
        label: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function jobProgressFor(kind: ExportJobKind) {
    if (exportJob?.kind === kind && exportJob.status === 'running') {
      return exportJob.progress;
    }
    return null;
  }

  async function handleImportConfig(file: File, mode: 'merge' | 'replace') {
    if (
      mode === 'replace' &&
      !confirm(
        '确定要替换选中类别的现有数据吗？文件里有的 endpoints / 人格 / 风格会被清空后再写入。\n\n' +
          '清空与写入在同一事务中；失败会回滚，不会留下半空配置。',
      )
    ) {
      return;
    }
    setConfigStatus({ kind: 'busy', label: '导入中…' });
    try {
      const text = await readFile(file, '配置文件');
      const r = await importConfigBundle(text, { mode });
      await refreshCounts();
      setConfigStatus({ kind: 'ok', label: summarizeConfig(r) });
    } catch (err) {
      setConfigStatus({
        kind: 'fail',
        label: formatStorageError(err),
      });
    }
  }

  async function handleMemoryExport() {
    if (!memoryPersonaId) return;
    setMemoryExportStatus({ kind: 'busy', label: '导出中…' });
    try {
      const r = await exportPersonaMemoryMarkdown(memoryPersonaId);
      const saved = await downloadText(r.content, r.filename, r.mime);
      setMemoryExportStatus({
        kind: 'ok',
        label: formatExportSaveLabel(saved, '已保存'),
      });
    } catch (err) {
      setMemoryExportStatus({
        kind: 'fail',
        label: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleImportBackup(file: File, mode: 'merge' | 'replace') {
    if (
      mode === 'replace' &&
      !confirm(
        '确定要按备份对齐数据吗？备份里出现的表（对话 / 消息 / 人格等）会替换为备份内容；' +
          '备份里没有的表（例如旧备份缺旅行 / 日记）会保留现有数据，不会被清空。\n\n' +
          '大备份会边读边写入（不整文件塞进内存）。中途失败不会先清空再留下空库，' +
          '但仍建议先导出一份当前备份。',
      )
    ) {
      return;
    }
    setBackupStatus({ kind: 'busy', label: '导入中…' });
    try {
      assertBackupImportFileSize(file.size, '备份文件');
      const r = await importBackupStream(
        { kind: 'file', file },
        {
          mode,
          onProgress: (label) => setIfMounted(setBackupStatus, { kind: 'busy', label }),
        },
      );
      await refreshCounts();
      setBackupStatus({ kind: 'ok', label: summarizeBackup(r) });
    } catch (err) {
      setBackupStatus({
        kind: 'fail',
        label: formatStorageError(err),
      });
    }
  }

  function mergeRecoverItems(next: RecoverableItem[]) {
    setRecoverItems((prev) => {
      const map = new Map<string, RecoverableItem>();
      for (const item of prev) map.set(item.id, item);
      for (const item of next) map.set(item.id, item);
      return [...map.values()].sort((a, b) => b.modifiedAt - a.modifiedAt);
    });
  }

  async function refineRecoverKinds(items: RecoverableItem[]) {
    const refined = await Promise.all(
      items.slice(0, 40).map(async (item) => {
        if (item.kindGuess && item.kindGuess !== 'unknown') return item;
        try {
          const kind = await peekRecoverKind(item);
          return { ...item, kindGuess: kind };
        } catch {
          return item;
        }
      }),
    );
    setRecoverItems((prev) => {
      const map = new Map(refined.map((i) => [i.id, i]));
      return prev.map((p) => map.get(p.id) ?? p);
    });
  }

  // Deep-link from wipe banner: /data?recover=1 → scroll + auto-scan.
  const recoverParam = searchParams.get('recover');
  const autoRecoverStarted = useRef(false);
  useEffect(() => {
    if (recoverParam !== '1' || autoRecoverStarted.current) return;
    autoRecoverStarted.current = true;
    const el = document.getElementById('manual-recover');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (nativeRecoverAvailable) {
      void handleScanNativeRecover();
    }
    // Drop the query so remounts don't re-scan forever.
    const next = new URLSearchParams(searchParams);
    next.delete('recover');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on enter
  }, [recoverParam]);

  async function handleScanNativeRecover() {
    setRecoverStatus({ kind: 'busy', label: '正在扫描隐藏目录与下载文件夹…' });
    setRecoverScanNote(null);
    try {
      const result = await scanRecoverableNative();
      mergeRecoverItems(result.files);
      const places = [
        result.scannedPrivate ? '应用私有目录' : null,
        result.scannedDownloads ? '系统下载' : null,
        result.scannedBackupFolder ? '备份目录' : null,
      ].filter(Boolean);
      setRecoverScanNote(
        places.length
          ? `已扫描：${places.join(' · ')}`
          : result.note ?? '未执行原生扫描',
      );
      if (result.files.length === 0) {
        setRecoverStatus({
          kind: 'fail',
          label:
            result.note ??
            '没扫到候选文件。可再试「选择文件 / 选择文件夹」，或到电脑用 chrome://inspect 看 IndexedDB。',
        });
      } else {
        setRecoverStatus({
          kind: 'ok',
          label: `找到 ${result.files.length} 个候选文件`,
        });
        void refineRecoverKinds(result.files);
      }
    } catch (err) {
      setRecoverStatus({
        kind: 'fail',
        label: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function handleRecoverFilesPicked(fileList: FileList | null) {
    if (!fileList?.length) return;
    const items = filesToRecoverableItems(fileList, 'picked');
    mergeRecoverItems(items);
    setRecoverStatus({
      kind: items.length ? 'ok' : 'fail',
      label: items.length
        ? `已加入 ${items.length} 个文件`
        : '没有看起来像备份/对话的 JSON',
    });
    if (items.length) void refineRecoverKinds(items);
  }

  async function handlePickRecoverDirectory() {
    setRecoverStatus({ kind: 'busy', label: '扫描文件夹…' });
    try {
      if (directoryPickerAvailable) {
        const items = await pickRecoverDirectory();
        mergeRecoverItems(items);
        setRecoverStatus({
          kind: items.length ? 'ok' : 'fail',
          label: items.length
            ? `文件夹内找到 ${items.length} 个候选`
            : '这个文件夹里没有匹配的 JSON',
        });
        if (items.length) void refineRecoverKinds(items);
        return;
      }
      // Android WebView / Safari: fall back to webkitdirectory input.
      recoverDirInputRef.current?.click();
      setRecoverStatus({ kind: 'idle' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('abort') || msg.includes('AbortError')) {
        setRecoverStatus({ kind: 'idle' });
        return;
      }
      setRecoverStatus({ kind: 'fail', label: msg });
    }
  }

  async function handleImportRecoverItem(
    item: RecoverableItem,
    mode: 'merge' | 'replace' = 'merge',
  ) {
    if (
      mode === 'replace' &&
      !confirm(
        `确定要用「${item.name}」替换导入吗？现有同类别数据会按文件内容对齐。\n\n` +
          '全量备份会边读边写入；中途失败不会先清空再留下空库。仍建议先导出一份当前备份。',
      )
    ) {
      return;
    }
    setRecoverBusyId(item.id);
    setRecoverStatus({ kind: 'busy', label: `正在导入 ${item.name}…` });
    try {
      const { detected, outcome } = await importRecoverableItem(item, {
        mode,
        personaId: importPersonaId || undefined,
        defaultEndpointId: importEndpointId || undefined,
        defaultModel: importModel || undefined,
        onProgress: (label) =>
          setIfMounted(setRecoverStatus, { kind: 'busy', label }),
      });
      setRecoverItems((prev) =>
        prev.map((p) =>
          p.id === item.id ? { ...p, kindGuess: detected } : p,
        ),
      );
      await refreshCounts();
      setRecoverStatus({
        kind: 'ok',
        label: summarizeRecoverOutcome(detected, outcome),
      });
    } catch (err) {
      setRecoverStatus({
        kind: 'fail',
        label: formatStorageError(err),
      });
    } finally {
      setRecoverBusyId(null);
    }
  }

  async function handleCopyRecoverItem(item: RecoverableItem) {
    setRecoverBusyId(item.id);
    setRecoverStatus({ kind: 'busy', label: `正在复制 ${item.name} 到下载…` });
    try {
      await copyRecoverableToDownloads(item);
      setRecoverStatus({
        kind: 'ok',
        label: `已复制到系统下载：${item.name}`,
      });
    } catch (err) {
      setRecoverStatus({
        kind: 'fail',
        label: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRecoverBusyId(null);
    }
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center gap-3 border-b border-lavender-200 bg-white/60 px-3 py-3 backdrop-blur md:px-6" style={{ paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))' }}>
        <Link
          to="/chat"
          className="hidden items-center gap-1 rounded-lg px-2 py-1 text-sm text-ink-500 transition hover:bg-lavender-50 md:inline-flex"
        >
          <ChevronLeft size={16} />
          返回
        </Link>
        <h2 className="serif-title text-lg">导入 / 导出</h2>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-6 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">

          {/* ── Data diagnostics ─────────────────────────────────────────── */}
          <section className="endpoint-card !mt-0">
            <button
              type="button"
              onClick={() => {
                setDiagOpen((v) => !v);
                if (!diagOpen && counts === null) void refreshCounts();
              }}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <div className="flex items-center gap-2">
                <Database size={15} className="text-lavender-400" strokeWidth={1.5} />
                <span className="text-sm font-semibold text-ink-900">数据库诊断</span>
                {counts !== null && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    counts.error
                      ? 'bg-rose-100 text-rose-700'
                      : counts.conversations > 0
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                  }`}>
                    {counts.error
                      ? '读取出错'
                      : counts.conversations > 0
                        ? `${counts.conversations} 条对话 · 数据存在`
                        : '对话为空'}
                  </span>
                )}
              </div>
              {diagOpen ? <ChevronUp size={14} className="text-ink-400" /> : <ChevronDown size={14} className="text-ink-400" />}
            </button>

            {diagOpen && (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-ink-500">
                  直接读取 IndexedDB 的原始记录数，绕过 React 状态层。
                  如果下方显示有数据但主界面看起来空的，说明是渲染层出了问题，数据是好的——点「立即导出」就能拿到。
                </p>

                {persistState && (
                  <div
                    className={`space-y-2 rounded-lg border px-3 py-2 text-xs ${
                      persistState.persisted
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : persistState.supported
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-lavender-100 bg-lavender-50/60 text-ink-500'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {!persistState.supported
                          ? '当前环境不支持「持久化存储」请求（桌面浏览器通常仍会保留 IndexedDB）。'
                          : persistState.persisted
                            ? '持久化存储已开启：系统存储紧张时不会优先清掉本应用的对话库。'
                            : '持久化存储未开启：手机存储紧张时，系统可能静默清空 IndexedDB，表现为「一打开对话全没了」。'}
                      </span>
                      {persistState.supported && !persistState.persisted && (
                        <button
                          type="button"
                          onClick={() => void handleRequestPersist()}
                          disabled={diagBusy}
                          className="shrink-0 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
                        >
                          {diagBusy ? '申请中…' : '申请持久化'}
                        </button>
                      )}
                    </div>
                    {persistFeedback && (
                      <p
                        className={`rounded-md px-2 py-1.5 text-[11px] leading-relaxed ${
                          persistState.persisted
                            ? 'bg-emerald-100/80 text-emerald-900'
                            : 'bg-white/70 text-amber-950'
                        }`}
                        role="status"
                      >
                        {persistFeedback}
                      </p>
                    )}
                    {persistState.supported && !persistState.persisted && (
                      <p className="text-[10.5px] leading-relaxed opacity-80">
                        Android 应用里点这个常常<strong>不会弹窗</strong>，直接被系统拒掉——看起来像没反应。
                        真正稳妥的是：上面设好备份目录 + 更新前自动备份，不要清应用数据。
                      </p>
                    )}
                  </div>
                )}

                {counts?.error && (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    <span>DB 读取出错：{counts.error}</span>
                  </div>
                )}

                {counts && !counts.error && (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-xl border border-lavender-100 bg-lavender-50/60 px-4 py-3 text-xs md:grid-cols-3">
                    {[
                      ['对话', counts.conversations],
                      ['消息', counts.messages],
                      ['人格', counts.personas],
                      ['记忆', counts.memoryFacts],
                      ['Endpoints', counts.endpoints],
                      ['账单', counts.bills],
                      ['朋友圈', counts.circlePosts],
                      ['经期记录', counts.periodEntries],
                      ['体重记录', counts.weightEntries],
                      ['健康快照', counts.healthDaily],
                      ['播放历史', counts.musicHistory],
                      ['MCP 服务器', counts.mcpServers],
                    ].map(([label, count]) => (
                      <div key={String(label)} className="flex items-center justify-between gap-2">
                        <span className="text-ink-500">{label}</span>
                        <span className={`font-mono font-medium ${Number(count) > 0 ? 'text-emerald-600' : 'text-ink-300'}`}>
                          {count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void refreshCounts()}
                    disabled={diagBusy}
                    className="flex items-center gap-1.5 rounded-lg border border-lavender-200 bg-white px-3 py-1.5 text-xs text-ink-700 transition hover:bg-lavender-50 disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={diagBusy ? 'animate-spin' : ''} />
                    重新读取
                  </button>

                  {totalRecords !== null && totalRecords > 0 && (
                    <button
                      type="button"
                      onClick={handleExportBackup}
                      disabled={exportBusy}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-200 disabled:opacity-60"
                    >
                      <Download size={12} />
                      立即导出全量备份
                    </button>
                  )}
                </div>

                {totalRecords === 0 && counts !== null && !counts.error && (
                  <p className="text-xs text-amber-700">
                    所有表均为空。如果你确定之前有数据，先用下面的「手动找回」扫一遍隐藏目录 / 下载文件夹；
                    仍没有的话：手机连电脑 → Chrome 地址栏输入{' '}
                    <code className="rounded bg-amber-100 px-1">chrome://inspect/#devices</code>
                    {' '}→ 找到 Wisteria → inspect → Application → IndexedDB → lisse，直接查看原始数据。
                  </p>
                )}
              </div>
            )}
          </section>

          {/* ── Manual recover ───────────────────────────────────────────── */}
          <section id="manual-recover" className="endpoint-card !mt-0 scroll-mt-4">
            <div className="flex items-start gap-2">
              <HardDrive size={16} className="mt-0.5 shrink-0 text-lavender-400" strokeWidth={1.5} />
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-ink-900">
                  手动找回对话数据
                </h3>
                <p className="mt-1 text-sm text-ink-500">
                  数据「看得到却掏不出来」时用这里：扫描应用私有目录（旧版导出掉进去的隐藏位置）、
                  系统下载、已选备份目录；也可以自己选文件或整个文件夹（含隐藏目录）。
                  识别到的备份 / 对话 JSON 可直接合并导入。
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {nativeRecoverAvailable && (
                <button
                  type="button"
                  onClick={() => void handleScanNativeRecover()}
                  disabled={recoverStatus.kind === 'busy'}
                  className="flex items-center gap-1.5 rounded-lg bg-lavender-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-300 disabled:opacity-60"
                >
                  <Search size={15} />
                  扫描隐藏目录 / 下载
                </button>
              )}
              <button
                type="button"
                onClick={() => recoverFileInputRef.current?.click()}
                disabled={recoverStatus.kind === 'busy'}
                className="flex items-center gap-1.5 rounded-lg border border-lavender-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 transition hover:bg-lavender-50 disabled:opacity-60"
              >
                <FileJson size={15} />
                选择文件
              </button>
              <button
                type="button"
                onClick={() => void handlePickRecoverDirectory()}
                disabled={recoverStatus.kind === 'busy'}
                className="flex items-center gap-1.5 rounded-lg border border-lavender-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 transition hover:bg-lavender-50 disabled:opacity-60"
              >
                <FolderOpen size={15} />
                选择文件夹
              </button>
              {recoverItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setRecoverItems([]);
                    setRecoverStatus({ kind: 'idle' });
                    setRecoverScanNote(null);
                  }}
                  className="rounded-lg px-3 py-2 text-sm text-ink-500 transition hover:bg-lavender-50"
                >
                  清空列表
                </button>
              )}
            </div>

            <input
              ref={recoverFileInputRef}
              type="file"
              accept=".json,application/json,.bak"
              multiple
              className="hidden"
              onChange={(e) => {
                handleRecoverFilesPicked(e.target.files);
                e.target.value = '';
              }}
            />
            <input
              ref={(el) => {
                recoverDirInputRef.current = el;
                if (el) {
                  el.setAttribute('webkitdirectory', '');
                  el.setAttribute('directory', '');
                }
              }}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const items = filesToRecoverableItems(e.target.files ?? [], 'directory');
                mergeRecoverItems(items);
                setRecoverStatus({
                  kind: items.length ? 'ok' : 'fail',
                  label: items.length
                    ? `文件夹内找到 ${items.length} 个候选`
                    : '这个文件夹里没有匹配的 JSON',
                });
                if (items.length) void refineRecoverKinds(items);
                e.target.value = '';
              }}
            />

            {recoverScanNote && (
              <p className="mt-2 text-xs text-ink-400">{recoverScanNote}</p>
            )}

            <StatusLine status={recoverStatus} className="mt-2" />

            {(() => {
              const newestBackup = [...recoverItems]
                .filter(
                  (i) =>
                    i.kindGuess === 'backup' ||
                    /^lisse-backup/i.test(i.name) ||
                    i.name.toLowerCase().includes('backup'),
                )
                .sort((a, b) => b.modifiedAt - a.modifiedAt)[0];
              const dbLooksEmpty =
                counts != null &&
                !counts.error &&
                counts.conversations === 0 &&
                counts.messages === 0;
              if (!newestBackup || !dbLooksEmpty) return null;
              return (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-3">
                  <p className="text-sm font-medium text-emerald-900">
                    找到可用备份，可一键恢复
                  </p>
                  <p className="mt-1 break-all text-xs text-emerald-800/80">
                    {newestBackup.name}
                    {newestBackup.modifiedAt
                      ? ` · ${new Date(newestBackup.modifiedAt).toLocaleString('zh-CN')}`
                      : ''}
                  </p>
                  <button
                    type="button"
                    disabled={recoverStatus.kind === 'busy'}
                    onClick={() =>
                      void handleImportRecoverItem(newestBackup, 'merge')
                    }
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <HardDrive size={14} />
                    一键合并恢复
                  </button>
                </div>
              );
            })()}

            {recoverItems.length > 0 && (
              <ul className="mt-4 divide-y divide-lavender-100 rounded-xl border border-lavender-100 bg-white/70">
                {recoverItems.map((item) => {
                  const busy = recoverBusyId === item.id;
                  return (
                    <li
                      key={item.id}
                      className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-900">
                          {item.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-ink-400">
                          {kindLabel(String(item.kindGuess))}
                          {' · '}
                          {sourceLabel(String(item.source))}
                          {' · '}
                          {formatBytes(item.size)}
                          {item.modifiedAt > 0 && (
                            <>
                              {' · '}
                              {formatShortDate(item.modifiedAt)}
                            </>
                          )}
                        </p>
                        {item.pathHint && item.pathHint !== item.name && (
                          <p className="mt-0.5 truncate text-[11px] text-ink-300">
                            {item.pathHint}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={busy || recoverStatus.kind === 'busy'}
                          onClick={() => void handleImportRecoverItem(item, 'merge')}
                          className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 transition hover:bg-emerald-200 disabled:opacity-50"
                        >
                          合并导入
                        </button>
                        {(item.kindGuess === 'backup' ||
                          item.kindGuess === 'config') && (
                          <button
                            type="button"
                            disabled={busy || recoverStatus.kind === 'busy'}
                            onClick={() =>
                              void handleImportRecoverItem(item, 'replace')
                            }
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                          >
                            替换导入
                          </button>
                        )}
                        {item.uri && nativeRecoverAvailable && (
                          <button
                            type="button"
                            disabled={busy || recoverStatus.kind === 'busy'}
                            onClick={() => void handleCopyRecoverItem(item)}
                            className="rounded-lg border border-lavender-200 bg-white px-2.5 py-1 text-xs text-ink-600 transition hover:bg-lavender-50 disabled:opacity-50"
                          >
                            复制到下载
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="mt-3 text-xs text-ink-400">
              ChatGPT / Claude 导出导入时，会用上方「绑定人格 / endpoint」的选择。
              应用私有目录里的文件普通文件管理器看不到——点「复制到下载」就能在系统下载里打开。
            </p>
          </section>

          {/* ChatGPT/Claude/Lisse import shared options */}
          <section className="endpoint-card !mt-0">
            <h3 className="text-base font-semibold text-ink-900">
              从 ChatGPT / Claude / Wisteria 导入
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              先选好这次导入要绑定哪个人格、哪个 endpoint，下面再选文件。
              <br />
              已经导入过的同一对话会自动跳过（按原始 conversation id 判重）。
              <br />
              Wisteria JSON 导入支持单条（<code className="rounded bg-lavender-100 px-1">__lisse: "conversation"</code>）
              或多条（<code className="rounded bg-lavender-100 px-1">__lisse: "conversations"</code>）对话导出文件。
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-ink-500">
                  绑定人格
                </span>
                <select
                  value={importPersonaId}
                  onChange={(e) => setImportPersonaId(e.target.value)}
                  className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
                >
                  <option value="">不绑定（无 system prompt）</option>
                  {personas?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.avatar} {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-ink-500">
                  默认 endpoint
                </span>
                <select
                  value={importEndpointId}
                  onChange={(e) => {
                    setImportEndpointId(e.target.value);
                    setImportModel('');
                  }}
                  className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
                >
                  <option value="">不绑定</option>
                  {endpoints?.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedEndpoint && selectedEndpoint.chatModels.length > 0 && (
                <label className="flex flex-col gap-1 text-sm md:col-span-2">
                  <span className="text-xs font-medium text-ink-500">
                    默认模型
                  </span>
                  <select
                    value={importModel}
                    onChange={(e) => setImportModel(e.target.value)}
                    className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
                  >
                    <option value="">不指定</option>
                    {selectedEndpoint.chatModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <FileButton
                label="ChatGPT conversations.json"
                accept=".json,application/json"
                status={chatgptStatus}
                onPick={handleChatGPT}
              />
              <FileButton
                label="Claude conversations.json"
                accept=".json,application/json"
                status={claudeStatus}
                onPick={handleClaude}
              />
              <FileButton
                label="Wisteria 对话 JSON"
                accept=".json,application/json"
                status={lisseStatus}
                onPick={handleLisse}
              />
            </div>
          </section>

          {backupFolderPickerAvailable && (
            <section className="endpoint-card !mt-0">
              <div className="rounded-xl border-2 border-dashed border-lavender-300 bg-lavender-50/80 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900">
                      导出保存位置
                    </p>
                    {backupFolder ? (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-600">
                        <FolderCheck size={15} className="shrink-0 text-emerald-600" />
                        <span className="truncate">{backupFolder.label}</span>
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-ink-500">
                        {backupFolderPermissionLost
                          ? '先前选择的目录权限已失效，请重新选择。'
                          : '未设置时，导出到系统默认位置（如下载文件夹）。'}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-ink-400">
                      全量备份、配置 JSON、对话 JSON / ZIP、记忆 Markdown，以及聊天页单条导出，都会写到同一目录。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handlePickBackupFolder}
                    disabled={backupFolderBusy}
                    className="flex shrink-0 items-center gap-2 rounded-xl bg-lavender-300 px-5 py-2.5 text-sm font-semibold text-ink-900 shadow-sm transition hover:bg-lavender-400 disabled:opacity-60"
                  >
                    <FolderOpen size={18} />
                    {backupFolder ? '更改保存位置' : '选择保存位置'}
                  </button>
                </div>
                {backupFolderPermissionLost && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <ShieldAlert size={15} className="mt-0.5 shrink-0 text-amber-500" />
                    <span>目录访问权限已失效，请点击上方按钮重新授权。</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Bulk export conversations */}
          <section className="endpoint-card !mt-0">
            <h3 className="text-base font-semibold text-ink-900">
              批量导出对话
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              所有对话打包成一个 ZIP，每条对话一个文件。<br />
              单条对话也可以直接在聊天页右上角的下载按钮导出。
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-ink-500">格式</span>
                <select
                  value={bulkFormat}
                  onChange={(e) =>
                    setBulkFormat(e.target.value as ConversationFormat)
                  }
                  className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
                >
                  <option value="markdown">Markdown (.md)</option>
                  <option value="text">纯文本 (.txt)</option>
                  <option value="json">JSON（可重导入）</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-ink-500">范围</span>
                <select
                  value={bulkScope}
                  onChange={(e) =>
                    setBulkScope(e.target.value as 'branch' | 'tree')
                  }
                  className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
                >
                  <option value="branch">当前显示的分支</option>
                  <option value="tree">完整树（含所有分支）</option>
                </select>
              </label>
            </div>

            <ExportControls
              progress={jobProgressFor('conversations-zip')}
              busy={exportBusy}
              status={bulkStatus}
              onExport={handleBulkExport}
              exportLabel="导出 ZIP"
            />
          </section>

          {/* Selective conversation JSON export */}
          <section className="endpoint-card !mt-0">
            <h3 className="text-base font-semibold text-ink-900">
              自选 / 近一月对话导出 JSON
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              导出可重导入的 JSON（<code className="rounded bg-lavender-100 px-1">__lisse: "conversations"</code>）。
              按更新时间筛选近一个月，或自行勾选对话。
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRecentMonthExportJson}
                disabled={
                  exportBusy || recentMonthConversations.length === 0
                }
                className="flex items-center gap-1.5 rounded-lg bg-lavender-200 px-3 py-1.5 text-sm font-medium text-ink-900 transition hover:bg-lavender-300 disabled:opacity-60"
              >
                <Download size={14} />
                导出近一月（{recentMonthConversations.length}）
              </button>
              <button
                type="button"
                onClick={selectRecentMonth}
                disabled={recentMonthConversations.length === 0}
                className="rounded-lg border border-lavender-200 bg-white px-3 py-1.5 text-xs text-ink-700 transition hover:bg-lavender-50 disabled:opacity-50"
              >
                勾选近一月
              </button>
              <button
                type="button"
                onClick={selectAllConversations}
                disabled={(conversations?.length ?? 0) === 0}
                className="rounded-lg border border-lavender-200 bg-white px-3 py-1.5 text-xs text-ink-700 transition hover:bg-lavender-50 disabled:opacity-50"
              >
                全选
              </button>
              <button
                type="button"
                onClick={clearSelectedConversations}
                disabled={selectedConvIds.size === 0}
                className="rounded-lg border border-lavender-200 bg-white px-3 py-1.5 text-xs text-ink-700 transition hover:bg-lavender-50 disabled:opacity-50"
              >
                清空
              </button>
              <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-500">
                <span>范围</span>
                <select
                  value={selectScope}
                  onChange={(e) =>
                    setSelectScope(e.target.value as 'branch' | 'tree')
                  }
                  className="rounded-lg border border-lavender-200 bg-white px-2 py-1 text-xs focus:border-lavender-300"
                >
                  <option value="branch">当前分支</option>
                  <option value="tree">完整树</option>
                </select>
              </label>
            </div>

            <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-lavender-100 bg-lavender-50/40">
              {(conversations?.length ?? 0) === 0 ? (
                <p className="px-3 py-4 text-xs text-ink-400">暂无对话</p>
              ) : (
                <ul className="divide-y divide-lavender-100">
                  {(conversations ?? []).map((c) => {
                    const checked = selectedConvIds.has(c.id);
                    const isRecent = c.updatedAt >= monthCutoffMs;
                    return (
                      <li key={c.id}>
                        <label className="flex cursor-pointer items-start gap-2 px-3 py-2 text-sm transition hover:bg-white/70">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleConvId(c.id)}
                            className="mt-1 accent-lavender-400"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-ink-800">
                              {c.title || '未命名对话'}
                            </span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-400">
                              <span>更新 {formatShortDate(c.updatedAt)}</span>
                              {isRecent && (
                                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">
                                  近一月
                                </span>
                              )}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <ExportControls
              progress={jobProgressFor('conversations-json')}
              busy={exportBusy}
              status={selectStatus}
              onExport={handleSelectExportJson}
              exportLabel={`导出已选 JSON（${selectedConvIds.size}）`}
              exportDisabled={selectedConvIds.size === 0}
            />
          </section>

          {/* Config: personas / styles / API keys */}
          <section className="endpoint-card !mt-0">
            <h3 className="text-base font-semibold text-ink-900">
              单独导出人格 / 风格 / API key
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              只打包配置类数据；导入后会写回人格页、风格页、Endpoints（含 API key）和默认选项。
              会与全量备份写到同一导出目录。
              <strong className="font-medium text-ink-700">
                {' '}勾选 Endpoints 时文件里会有 API key
              </strong>
              ，请妥善保管。
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-lg border border-lavender-100 bg-lavender-50/50 px-3 py-2 text-sm text-ink-800">
                <input
                  type="checkbox"
                  checked={cfgPersonas}
                  onChange={(e) => setCfgPersonas(e.target.checked)}
                  className="accent-lavender-400"
                />
                人格（personas）
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-lavender-100 bg-lavender-50/50 px-3 py-2 text-sm text-ink-800">
                <input
                  type="checkbox"
                  checked={cfgStyles}
                  onChange={(e) => setCfgStyles(e.target.checked)}
                  className="accent-lavender-400"
                />
                写作风格（styles）
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-lavender-100 bg-lavender-50/50 px-3 py-2 text-sm text-ink-800">
                <input
                  type="checkbox"
                  checked={cfgEndpoints}
                  onChange={(e) => setCfgEndpoints(e.target.checked)}
                  className="accent-lavender-400"
                />
                Endpoints / API key
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-lavender-100 bg-lavender-50/50 px-3 py-2 text-sm text-ink-800">
                <input
                  type="checkbox"
                  checked={cfgDefaults}
                  onChange={(e) => setCfgDefaults(e.target.checked)}
                  className="accent-lavender-400"
                />
                默认人格 / 风格 / 接口
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleExportConfig}
                disabled={
                  exportBusy ||
                  (!cfgPersonas &&
                    !cfgStyles &&
                    !cfgEndpoints &&
                    !cfgDefaults)
                }
                className="flex items-center gap-1.5 rounded-lg bg-lavender-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-300 disabled:opacity-60"
              >
                <Download size={16} />
                导出配置 JSON
              </button>
              <FileButton
                label="合并导入配置"
                accept=".json,application/json"
                status={{ kind: 'idle' }}
                compact
                onPick={(f) => handleImportConfig(f, 'merge')}
              />
              <FileButton
                label="替换导入配置"
                accept=".json,application/json"
                status={{ kind: 'idle' }}
                compact
                danger
                onPick={(f) => handleImportConfig(f, 'replace')}
              />
            </div>

            {jobProgressFor('config') && (
              <ExportProgressBar
                progress={jobProgressFor('config')!}
                className="mt-3"
              />
            )}

            <p className="mt-2 text-xs text-ink-400">
              格式标记 <code className="rounded bg-lavender-100 px-1">__lisse: "config"</code>
              。合并按 id 更新；替换只清空文件里出现的那几类表再写入。
            </p>

            <StatusLine status={configStatus} className="mt-3" />
          </section>

          {/* Memory export */}
          <section className="endpoint-card !mt-0">
            <h3 className="text-base font-semibold text-ink-900">
              导出记忆为 Markdown
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              把某个人格积累的记忆事实导成可读 Markdown，方便回顾或复制到别处。
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-ink-500">人格</span>
                <select
                  value={memoryPersonaId}
                  onChange={(e) => setMemoryPersonaId(e.target.value)}
                  className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
                >
                  <option value="">选一个人格</option>
                  {personas?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.avatar} {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={handleMemoryExport}
                disabled={!memoryPersonaId || memoryExportStatus.kind === 'busy'}
                className="flex items-center gap-1.5 rounded-lg bg-lavender-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-300 disabled:opacity-60"
              >
                <Download size={16} />
                导出 Markdown
              </button>
              <StatusLine status={memoryExportStatus} />
            </div>
          </section>

          {/* Backup */}
          <section className="endpoint-card !mt-0">
            <h3 className="text-base font-semibold text-ink-900">
              备份 / 恢复（全量）
            </h3>

            {backupOverdue && (
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-500" />
                <span>
                  {lastBackupAt === null
                    ? '从未备份过。所有数据仅存在本设备上，建议现在就导出一份。'
                    : `距上次备份已超过 7 天（${formatRelativeTime(lastBackupAt)}）。建议重新导出一份。`}
                </span>
              </div>
            )}

            {lastBackupAt !== null && !backupOverdue && (
              <p className="mt-1 text-xs text-ink-400">
                上次备份：{formatRelativeTime(lastBackupAt)}
              </p>
            )}

            <p className="mt-2 text-sm text-ink-500">
              把所有对话、人格、写作风格、记忆、账单、健康、朋友圈、endpoints（含 API key）和设置
              打包成一个 JSON；导入后会自动写回对应位置。
              大备份（超过原先 80MB 内存上限的也可以）会边读边写入，避免整文件把页面打死。
              <strong>API key 也会在文件里</strong>，请妥善保管喵。
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleExportBackup}
                disabled={exportBusy}
                className="flex items-center gap-1.5 rounded-lg bg-lavender-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-300 disabled:opacity-60"
              >
                <Download size={16} />
                导出全部
              </button>
              <FileButton
                label="合并导入（覆盖同名）"
                accept=".json,application/json"
                status={{ kind: 'idle' }}
                compact
                onPick={(f) => handleImportBackup(f, 'merge')}
              />
              <FileButton
                label="替换导入（清空再灌）"
                accept=".json,application/json"
                status={{ kind: 'idle' }}
                compact
                danger
                onPick={(f) => handleImportBackup(f, 'replace')}
              />
            </div>

            {jobProgressFor('backup') && (
              <div className="mt-3 space-y-2">
                <ExportProgressBar progress={jobProgressFor('backup')!} />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => cancelExportJob()}
                    className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs text-rose-600 transition hover:bg-rose-100"
                  >
                    <Square size={10} fill="currentColor" />
                    取消导出
                  </button>
                  <span className="text-xs text-ink-400">
                    可离开本页，导出会在后台继续
                  </span>
                </div>
              </div>
            )}

            <p className="mt-2 text-xs text-ink-400">
              合并：按 id 写入/更新（人设、写作风格、API key、设置会填到对应页）；替换：清空与写入在同一事务里完成，失败会回滚旧数据，不会先清空再留下空库。
            </p>

            <StatusLine status={backupStatus} className="mt-3" />
          </section>
        </div>
      </div>
    </div>
  );
}

function ExportControls({
  progress,
  busy,
  status,
  onExport,
  exportLabel,
  exportDisabled,
}: {
  progress: ExportProgress | null;
  busy: boolean;
  status: Status;
  onExport: () => void;
  exportLabel: string;
  exportDisabled?: boolean;
}) {
  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onExport}
          disabled={busy || !!exportDisabled}
          className="flex items-center gap-1.5 rounded-lg bg-lavender-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-300 disabled:opacity-60"
        >
          <Download size={16} />
          {exportLabel}
        </button>
        {progress && (
          <button
            type="button"
            onClick={() => cancelExportJob()}
            className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-600 transition hover:bg-rose-100"
          >
            <Square size={10} fill="currentColor" />
            取消
          </button>
        )}
        <StatusLine status={status} />
      </div>
      {progress && (
        <>
          <ExportProgressBar progress={progress} />
          <p className="text-xs text-ink-400">可离开本页，导出会在后台继续</p>
        </>
      )}
    </div>
  );
}

function FileButton({
  label,
  accept,
  status,
  onPick,
  compact,
  danger,
}: {
  label: string;
  accept: string;
  status: Status;
  onPick: (f: File) => void;
  compact?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition ${
          danger
            ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
            : 'border-lavender-200 bg-lavender-50 text-ink-700 hover:bg-lavender-100'
        } ${compact ? '' : 'flex-col gap-2 py-4'}`}
      >
        <Upload size={16} />
        {label}
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
            e.target.value = '';
          }}
        />
      </label>
      <StatusLine status={status} />
    </div>
  );
}

function StatusLine({ status, className }: { status: Status; className?: string }) {
  if (status.kind === 'idle') return null;
  if (status.kind === 'busy') {
    return (
      <span className={`text-xs text-ink-500 ${className ?? ''}`}>
        {status.label}
      </span>
    );
  }
  if (status.kind === 'ok') {
    return (
      <span
        className={`flex items-center gap-1 text-xs text-sky-500 ${
          className ?? ''
        }`}
      >
        <CheckCircle2 size={14} />
        <span>{status.label}</span>
      </span>
    );
  }
  return (
    <span
      className={`flex items-start gap-1 text-xs text-rose-500 ${
        className ?? ''
      }`}
    >
      <AlertCircle size={14} className="mt-0.5 shrink-0" />
      <span className="break-all">{status.label}</span>
    </span>
  );
}

function applyJobResult(
  job: { status: string; resultLabel?: string; errorLabel?: string },
  setStatus: (s: Status) => void,
): void {
  if (job.status === 'done') {
    setStatus({ kind: 'ok', label: job.resultLabel ?? '已完成' });
  } else if (job.status === 'cancelled') {
    setStatus({ kind: 'fail', label: '导出已取消' });
  } else if (job.status === 'fail') {
    setStatus({ kind: 'fail', label: job.errorLabel ?? '导出失败' });
  }
}

function summarizeImport(r: ImportResult): string {
  const parts = [`导入 ${r.importedCount} 条`];
  if (r.skippedCount) parts.push(`跳过 ${r.skippedCount} 条（已存在）`);
  if (r.errors.length) parts.push(`${r.errors.length} 条出错`);
  return parts.join('，');
}

function summarizeBackup(r: ImportBackupResult): string {
  const parts: string[] = [
    `对话 ${r.conversationsAdded}`,
    `消息 ${r.messagesAdded}`,
  ];
  if (r.endpointsAdded) parts.push(`接口 ${r.endpointsAdded}`);
  if (r.personasAdded) parts.push(`人格 ${r.personasAdded}`);
  if (r.writingStylesAdded) parts.push(`风格 ${r.writingStylesAdded}`);
  if (r.memoryFactsAdded) parts.push(`记忆 ${r.memoryFactsAdded}`);
  if (r.billsAdded) parts.push(`账单 ${r.billsAdded}`);
  if (r.circlePostsAdded) parts.push(`朋友圈 ${r.circlePostsAdded}`);
  if (r.travelTripsAdded) parts.push(`出行 ${r.travelTripsAdded}`);
  if (r.diaryEntriesAdded) parts.push(`日记 ${r.diaryEntriesAdded}`);
  if (r.periodEntriesAdded || r.weightEntriesAdded || r.healthDailyAdded)
    parts.push('健康数据 ✓');
  if (r.settingsApplied) parts.push('设置已填入');
  return `已恢复：${parts.join('，')}`;
}

function summarizeConfig(r: ImportConfigResult): string {
  const parts: string[] = [];
  if (r.personasAdded) parts.push(`人格 ${r.personasAdded}`);
  if (r.writingStylesAdded) parts.push(`风格 ${r.writingStylesAdded}`);
  if (r.endpointsAdded) parts.push(`接口 ${r.endpointsAdded}`);
  if (r.settingsApplied) parts.push('默认设置已填入');
  return parts.length ? `已归位：${parts.join('，')}` : '配置已导入（无变更）';
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function formatShortDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
