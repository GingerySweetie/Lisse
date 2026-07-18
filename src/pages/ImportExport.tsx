import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
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
} from 'lucide-react';
import { db } from '../db';
import {
  getLastBackupAt,
  importBackup,
  type ImportBackupResult,
} from '../lib/backup';
import {
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

  // Run an initial count on mount so the header badge is always accurate.
  useEffect(() => {
    readAllCounts().then(setCounts).catch(() => undefined);
  }, []);

  async function refreshCounts() {
    setDiagBusy(true);
    try {
      // If the DB is blocked / stuck, try reopening first.
      if (!db.isOpen()) {
        await db.open();
      }
      setCounts(await readAllCounts());
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
        label: `已设置备份目录：${folder.label}`,
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
      await downloadText(r.content, r.filename, r.mime);
      setMemoryExportStatus({ kind: 'ok', label: '已保存' });
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
        '确定要替换全部数据吗？现有的 endpoints / 对话 / 人格都会被清空。\n\n' +
          '写入会在同一事务里完成：如果导入失败，旧数据会回滚保留，不会先清空再留下空库。' +
          '但仍建议先导出一份备份。',
      )
    ) {
      return;
    }
    setBackupStatus({ kind: 'busy', label: '导入中…' });
    try {
      const text = await readFile(file, '备份文件');
      const r = await importBackup(text, { mode });
      await refreshCounts();
      setBackupStatus({ kind: 'ok', label: summarizeBackup(r) });
    } catch (err) {
      setBackupStatus({
        kind: 'fail',
        label: formatStorageError(err),
      });
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
                    所有表均为空。如果你确定之前有数据，可以尝试：手机连电脑 → Chrome 地址栏输入{' '}
                    <code className="rounded bg-amber-100 px-1">chrome://inspect/#devices</code>
                    {' '}→ 找到 Wisteria → inspect → Application → IndexedDB → lisse，直接查看原始数据。
                  </p>
                )}
              </div>
            )}
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
              <strong>API key 也会在文件里</strong>，请妥善保管喵。
            </p>

            {backupFolderPickerAvailable && (
              <div className="mt-4 rounded-xl border-2 border-dashed border-lavender-300 bg-lavender-50/80 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900">
                      备份保存位置
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
                          : '未设置时，备份会保存到系统默认位置（如下载文件夹）。'}
                      </p>
                    )}
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
                    <span>备份目录访问权限已失效，请点击上方按钮重新授权。</span>
                  </div>
                )}
              </div>
            )}

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
