import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  Download,
  Upload,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { db } from '../db';
import {
  exportBackup,
  importBackup,
  downloadJSON,
  suggestedBackupFilename,
  type ImportBackupResult,
} from '../lib/backup';
import { importChatGPT, importClaude, type ImportResult } from '../lib/import';

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'ok'; label: string }
  | { kind: 'fail'; label: string };

export default function ImportExportPage() {
  const personas = useLiveQuery(() => db.personas.toArray(), [], []);
  const endpoints = useLiveQuery(() => db.endpoints.toArray(), [], []);

  const [importPersonaId, setImportPersonaId] = useState<string>('');
  const [importEndpointId, setImportEndpointId] = useState<string>('');
  const [importModel, setImportModel] = useState<string>('');

  const [chatgptStatus, setChatgptStatus] = useState<Status>({ kind: 'idle' });
  const [claudeStatus, setClaudeStatus] = useState<Status>({ kind: 'idle' });
  const [backupStatus, setBackupStatus] = useState<Status>({ kind: 'idle' });

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
      <header className="flex items-center gap-3 border-b border-lavender-200 bg-white/60 px-3 py-3 pl-14 backdrop-blur md:px-6 md:pl-6">
        <Link
          to="/chat"
          className="hidden items-center gap-1 rounded-lg px-2 py-1 text-sm text-ink-500 transition hover:bg-lavender-50 md:inline-flex"
        >
          <ChevronLeft size={16} />
          返回
        </Link>
        <h2 className="text-base font-semibold text-ink-900">导入 / 导出</h2>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-6 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {/* ChatGPT/Claude import shared options */}
          <section className="rounded-2xl border border-lavender-200 bg-white/80 p-5 shadow-sm">
            <h3 className="text-base font-semibold text-ink-900">
              从 ChatGPT / Claude 导入
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              先选好这次导入要绑定哪个人格、哪个 endpoint，下面再选文件。
              <br />
              已经导入过的同一对话会自动跳过（按原始 conversation id 判重）。
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-ink-500">
                  绑定人格
                </span>
                <select
                  value={importPersonaId}
                  onChange={(e) => setImportPersonaId(e.target.value)}
                  className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-mint-300"
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
                  className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-mint-300"
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
                    className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-mint-300"
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

            <div className="mt-5 grid gap-3 md:grid-cols-2">
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
            </div>
          </section>

          {/* Backup */}
          <section className="rounded-2xl border border-lavender-200 bg-white/80 p-5 shadow-sm">
            <h3 className="text-base font-semibold text-ink-900">
              备份 / 恢复（Lisse 全量）
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              把 endpoints / 人格 / 对话 / 消息 / 设置打包成一个 JSON 文件，
              换设备时拿来导入。<strong>API key 也会在文件里</strong>，请妥善保管喵。
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleExportBackup}
                className="flex items-center gap-1.5 rounded-lg bg-mint-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-mint-300"
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
        className={`flex items-center gap-1 text-xs text-mint-500 ${
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
  return `endpoints +${r.endpointsAdded}, personas +${r.personasAdded}, conversations +${r.conversationsAdded}, messages +${r.messagesAdded}, memory +${r.memoryFactsAdded}${
    r.settingsApplied ? '，设置已应用' : ''
  }`;
}
