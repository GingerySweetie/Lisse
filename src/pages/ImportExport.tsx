import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  Download,
  Upload,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import { db } from '../db';
import {
  exportBackup,
  getLastBackupAt,
  importBackup,
  downloadJSON,
  suggestedBackupFilename,
  type ImportBackupResult,
} from '../lib/backup';
import {
  importChatGPT,
  importClaude,
  importLisseConversation,
  type ImportResult,
} from '../lib/import';
import {
  exportAllConversationsZip,
  exportPersonaMemoryMarkdown,
  downloadBlob,
  downloadText,
  type ConversationFormat,
} from '../lib/export';

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'ok'; label: string }
  | { kind: 'fail'; label: string };

export default function ImportExportPage() {
  const personas = useLiveQuery(() => db.personas.toArray(), [], []);
  const endpoints = useLiveQuery(() => db.endpoints.toArray(), [], []);
  const lastBackupAt = useLiveQuery(() => getLastBackupAt(), [], null);

  // Compute "overdue" against a stable snapshot of now captured when the
  // component mounts or when lastBackupAt changes, to satisfy the react-compiler
  // purity rule (Date.now() must not be called unconditionally during render).
  const backupOverdue = useMemo(() => {
    const now = Date.now();
    return lastBackupAt === null || now - lastBackupAt > 7 * 24 * 60 * 60 * 1000;
  }, [lastBackupAt]);

  const [importPersonaId, setImportPersonaId] = useState<string>('');
  const [importEndpointId, setImportEndpointId] = useState<string>('');
  const [importModel, setImportModel] = useState<string>('');

  const [chatgptStatus, setChatgptStatus] = useState<Status>({ kind: 'idle' });
  const [claudeStatus, setClaudeStatus] = useState<Status>({ kind: 'idle' });
  const [lisseStatus, setLisseStatus] = useState<Status>({ kind: 'idle' });
  const [backupStatus, setBackupStatus] = useState<Status>({ kind: 'idle' });
  const [bulkStatus, setBulkStatus] = useState<Status>({ kind: 'idle' });
  const [memoryExportStatus, setMemoryExportStatus] = useState<Status>({
    kind: 'idle',
  });

  const [bulkFormat, setBulkFormat] = useState<ConversationFormat>('markdown');
  const [bulkScope, setBulkScope] = useState<'branch' | 'tree'>('branch');
  const [memoryPersonaId, setMemoryPersonaId] = useState<string>('');

  const selectedEndpoint = endpoints?.find((e) => e.id === importEndpointId);

  async function readFile(file: File): Promise<string> {
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
      const text = await readFile(file);
      const result = await importChatGPT(text, {
        personaId: importPersonaId || undefined,
        defaultEndpointId: importEndpointId || undefined,
        defaultModel: importModel || undefined,
      });
      setChatgptStatus({ kind: 'ok', label: summarizeImport(result) });
    } catch (err) {
      setChatgptStatus({
        kind: 'fail',
        label: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleClaude(file: File) {
    setClaudeStatus({ kind: 'busy', label: '解析中…' });
    try {
      const text = await readFile(file);
      const result = await importClaude(text, {
        personaId: importPersonaId || undefined,
        defaultEndpointId: importEndpointId || undefined,
        defaultModel: importModel || undefined,
      });
      setClaudeStatus({ kind: 'ok', label: summarizeImport(result) });
    } catch (err) {
      setClaudeStatus({
        kind: 'fail',
        label: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleLisse(file: File) {
    setLisseStatus({ kind: 'busy', label: '解析中…' });
    try {
      const text = await readFile(file);
      const result = await importLisseConversation(text);
      setLisseStatus({ kind: 'ok', label: summarizeImport(result) });
    } catch (err) {
      setLisseStatus({
        kind: 'fail',
        label: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleExportBackup() {
    setBackupStatus({ kind: 'busy', label: '打包中…' });
    try {
      const bundle = await exportBackup();
      downloadJSON(bundle, suggestedBackupFilename());
      setBackupStatus({ kind: 'ok', label: '已下载备份文件' });
    } catch (err) {
      setBackupStatus({
        kind: 'fail',
        label: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleBulkExport() {
    setBulkStatus({ kind: 'busy', label: '打包中…' });
    try {
      const r = await exportAllConversationsZip({
        format: bulkFormat,
        scope: bulkScope,
        includeUsage: true,
      });
      downloadBlob(r.blob, r.filename);
      setBulkStatus({ kind: 'ok', label: `已导出 ${r.count} 条对话` });
    } catch (err) {
      setBulkStatus({
        kind: 'fail',
        label: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleMemoryExport() {
    if (!memoryPersonaId) return;
    setMemoryExportStatus({ kind: 'busy', label: '导出中…' });
    try {
      const r = await exportPersonaMemoryMarkdown(memoryPersonaId);
      downloadText(r.content, r.filename, r.mime);
      setMemoryExportStatus({ kind: 'ok', label: '已下载' });
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
      !confirm('确定要替换全部数据吗？现有的 endpoints / 对话 / 人格都会被清空。')
    ) {
      return;
    }
    setBackupStatus({ kind: 'busy', label: '导入中…' });
    try {
      const text = await readFile(file);
      const r = await importBackup(text, { mode });
      setBackupStatus({ kind: 'ok', label: summarizeBackup(r) });
    } catch (err) {
      setBackupStatus({
        kind: 'fail',
        label: err instanceof Error ? err.message : String(err),
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
              Wisteria JSON 导入支持从本应用导出的单条对话 JSON 文件（<code className="rounded bg-lavender-100 px-1">__lisse: "conversation"</code>）。
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

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={handleBulkExport}
                disabled={bulkStatus.kind === 'busy'}
                className="flex items-center gap-1.5 rounded-lg bg-lavender-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-300 disabled:opacity-60"
              >
                <Download size={16} />
                导出 ZIP
              </button>
              <StatusLine status={bulkStatus} />
            </div>
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
              把所有对话、人格、记忆、账单、健康、朋友圈等全部数据打包成一个 JSON，
              换设备时导入即可完整恢复。<strong>API key 也会在文件里</strong>，请妥善保管喵。
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleExportBackup}
                className="flex items-center gap-1.5 rounded-lg bg-lavender-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-300"
              >
                <Download size={16} />
                导出全部
              </button>
              <FileButton
                label="合并导入"
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

            <StatusLine status={backupStatus} className="mt-3" />
          </section>
        </div>
      </div>
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

function summarizeImport(r: ImportResult): string {
  const parts = [`导入 ${r.importedCount} 条`];
  if (r.skippedCount) parts.push(`跳过 ${r.skippedCount} 条（已存在）`);
  if (r.errors.length) parts.push(`${r.errors.length} 条出错`);
  return parts.join('，');
}

function summarizeBackup(r: ImportBackupResult): string {
  const parts: string[] = [
    `对话 +${r.conversationsAdded}`,
    `消息 +${r.messagesAdded}`,
  ];
  if (r.endpointsAdded) parts.push(`endpoints +${r.endpointsAdded}`);
  if (r.personasAdded) parts.push(`人格 +${r.personasAdded}`);
  if (r.memoryFactsAdded) parts.push(`记忆 +${r.memoryFactsAdded}`);
  if (r.billsAdded) parts.push(`账单 +${r.billsAdded}`);
  if (r.circlePostsAdded) parts.push(`朋友圈 +${r.circlePostsAdded}`);
  if (r.periodEntriesAdded || r.weightEntriesAdded || r.healthDailyAdded)
    parts.push('健康数据 ✓');
  if (r.settingsApplied) parts.push('设置已应用');
  return parts.join('，');
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
