import { useState, useRef, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { GithubIcon } from '../components/icons/GithubIcon';
import {
  ChevronLeft,
  FlaskConical,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Sparkles,
  FileCode2,
  GitCommitHorizontal,
  Eye,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { db, getSettings } from '../db';
import type { ChatTurn } from '../api/types';
import type { Endpoint } from '../types';
import {
  parseRepoInput,
  getRepo,
  getFileTree,
  verifyToken,
  batchCommit,
  type GitHubConfig,
  type RepoFile,
} from '../lib/workshop/github';
import {
  WORKSHOP_TOOL_DEFS,
  WORKSHOP_TOOL_HANDLERS,
  buildSystemPrompt,
  type WorkshopContext,
} from '../lib/workshop/agent-tools';
import { runBeautyReview, type BeautyReport } from '../lib/workshop/beauty';
import type { Tool } from '../lib/tools';
import { runToolLoop } from '../lib/tools/loop';

// ─── Types ──────────────────────────────────────────────────────────

interface LogEntry {
  id: string;
  type: 'info' | 'success' | 'error' | 'tool' | 'system';
  message: string;
  time: number;
}

interface StagedChange {
  path: string;
  content: string;
  reason: string;
}

type ActiveTab = 'changes' | 'beauty' | 'cost';
type RunState = 'idle' | 'running' | 'done' | 'error';

// ─── Constants ──────────────────────────────────────────────────────

const GH_TOKEN_KEY = 'workshop_gh_token';
const GH_REPO_KEY = 'workshop_gh_repo';

const CHEAP_MODEL_HINTS = [
  'haiku',
  'gpt-4o-mini',
  'gpt-4.1-mini',
  'deepseek',
  'qwen',
];

function isCheapModel(model: string): boolean {
  return CHEAP_MODEL_HINTS.some((h) => model.toLowerCase().includes(h));
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function WorkshopPage() {
  const endpoints = useLiveQuery(() => db.endpoints.toArray(), [], []);
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof getSettings>> | null>(null);
  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  // GitHub 配置
  const [ghToken, setGhToken] = useState(() => localStorage.getItem(GH_TOKEN_KEY) ?? '');
  const [repoInput, setRepoInput] = useState(() => localStorage.getItem(GH_REPO_KEY) ?? '');
  const [ghConfig, setGhConfig] = useState<GitHubConfig | null>(null);
  const [repoInfo, setRepoInfo] = useState<{ fullName: string; defaultBranch: string } | null>(null);
  const [fileTree, setFileTree] = useState<RepoFile[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');

  // 任务
  const [taskText, setTaskText] = useState('');
  const [selectedEndpointId, setSelectedEndpointId] = useState('');
  const [selectedModel, setSelectedModel] = useState('');

  // 运行状态
  const [runState, setRunState] = useState<RunState>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stagedChanges, setStagedChanges] = useState<StagedChange[]>([]);
  const [agentSummary, setAgentSummary] = useState('');
  const [usage, setUsage] = useState<{ inputTokens: number; outputTokens: number; cost: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 面板
  const [activeTab, setActiveTab] = useState<ActiveTab>('changes');
  const [beautyReport, setBeautyReport] = useState<BeautyReport | null>(null);
  const [beautyRunning, setBeautyRunning] = useState(false);
  const [committingBranch, setCommittingBranch] = useState('');
  const [commitDone, setCommitDone] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);

  // Misc
  const logEndRef = useRef<HTMLDivElement>(null);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // ── Derived ────────────────────────────────────────────────────────

  const activeEndpoint = endpoints?.find((e) => e.id === selectedEndpointId) ?? endpoints?.[0] ?? null;

  useEffect(() => {
    if (!selectedEndpointId && endpoints && endpoints.length > 0) {
      const def = settings?.defaultEndpointId
        ? endpoints.find((e) => e.id === settings.defaultEndpointId)
        : null;
      const ep = def ?? endpoints[0];
      setSelectedEndpointId(ep.id);
      const cheapModel = ep.chatModels.find(isCheapModel) ?? ep.chatModels[0] ?? '';
      setSelectedModel(cheapModel);
    }
  }, [endpoints, settings, selectedEndpointId]);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // ── Log helper ─────────────────────────────────────────────────────

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs((prev) => [
      ...prev,
      { id: crypto.randomUUID(), type, message, time: Date.now() },
    ]);
  }, []);

  // ── GitHub 连接 ────────────────────────────────────────────────────

  async function handleConnect() {
    setConnectError('');
    setConnecting(true);
    try {
      const parsed = parseRepoInput(repoInput);
      if (!parsed) {
        setConnectError('请输入有效的仓库地址，例：owner/repo 或 https://github.com/owner/repo');
        return;
      }
      const cfg: GitHubConfig = { token: ghToken, ...parsed };
      await verifyToken(ghToken);
      const info = await getRepo(cfg);
      const tree = await getFileTree(cfg, info.defaultBranch);
      setGhConfig(cfg);
      setRepoInfo(info);
      setFileTree(tree);
      setCommittingBranch(`workshop/${Date.now().toString(36)}`);
      localStorage.setItem(GH_TOKEN_KEY, ghToken);
      localStorage.setItem(GH_REPO_KEY, repoInput);
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }

  function handleDisconnect() {
    setGhConfig(null);
    setRepoInfo(null);
    setFileTree([]);
    setLogs([]);
    setStagedChanges([]);
    setRunState('idle');
    setBeautyReport(null);
    setCommitDone(null);
  }

  // ── 运行 Agent ─────────────────────────────────────────────────────

  async function handleRun() {
    if (!ghConfig || !repoInfo || !activeEndpoint || !taskText.trim()) return;
    setRunState('running');
    setLogs([]);
    setStagedChanges([]);
    setAgentSummary('');
    setUsage(null);
    setBeautyReport(null);
    setCommitDone(null);
    setActiveTab('changes');

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const fileCache = new Map<string, string>();
    const staged = new Map<string, { content: string; reason: string }>();

    const workshopCtx: WorkshopContext = {
      cfg: ghConfig,
      fileTree,
      fileCache,
      stagedChanges: staged,
      onLog: addLog,
    };

    // 包装工具让 runToolLoop 可用
    const workshopTools: Tool[] = WORKSHOP_TOOL_DEFS.map((def) => ({
      def,
      handler: async (input: unknown) => {
        const fn = WORKSHOP_TOOL_HANDLERS[def.name];
        return fn(input, workshopCtx);
      },
    }));

    const systemPrompt = buildSystemPrompt(
      repoInfo.fullName,
      fileTree,
      repoInfo.defaultBranch,
    );

    const initialTurns: ChatTurn[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: taskText.trim() },
    ];

    addLog(`开始炼制: ${taskText.trim().slice(0, 60)}${taskText.length > 60 ? '…' : ''}`, 'system');
    addLog(`模型: ${selectedModel} (${isCheapModel(selectedModel) ? '省钱模式 ✓' : '标准模式'})`, 'info');

    try {
      const result = await runToolLoop({
        endpoint: activeEndpoint,
        model: selectedModel,
        initialTurns,
        tools: workshopTools,
        ctx: { conversationId: 'workshop' },
        signal: ctrl.signal,
        maxRounds: 20,
        callbacks: {
          onTextDelta: () => {},
          onToolCallResolved: (call) => {
            if (call.name === 'task_done') {
              const inp = call.input as { summary?: string };
              if (inp.summary) setAgentSummary(inp.summary);
            }
          },
        },
      });

      if (result.errored) {
        addLog(`Agent 出错: ${result.errorMessage}`, 'error');
        setRunState('error');
      } else {
        const changes: StagedChange[] = Array.from(staged.entries()).map(
          ([path, v]) => ({ path, content: v.content, reason: v.reason }),
        );
        setStagedChanges(changes);

        // Token 用量统计
        const inp = result.usage?.inputTokens ?? 0;
        const out = result.usage?.outputTokens ?? 0;
        setUsage({ inputTokens: inp, outputTokens: out, cost: estimateCost(selectedModel, inp, out) });

        addLog(
          `炼制完成！修改了 ${staged.size} 个文件，${isCheapModel(selectedModel) ? '' : ''}Token 用量: ${inp + out}`,
          'success',
        );
        setRunState('done');
      }
    } catch (e) {
      if ((e as { name?: string }).name !== 'AbortError') {
        addLog(`发生错误: ${e instanceof Error ? e.message : String(e)}`, 'error');
        setRunState('error');
      } else {
        addLog('已停止', 'info');
        setRunState('idle');
      }
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  // ── 提交到 GitHub ──────────────────────────────────────────────────

  async function handleCommit() {
    if (!ghConfig || !repoInfo || stagedChanges.length === 0) return;
    setCommitting(true);
    try {
      const branch = committingBranch || `workshop/${Date.now().toString(36)}`;
      const result = await batchCommit(
        ghConfig,
        stagedChanges.map((c) => ({ path: c.path, content: c.content })),
        `feat: ${agentSummary || taskText.slice(0, 72)} [炼金工房]`,
        repoInfo.defaultBranch,
      );
      setCommitDone(result.url);
      addLog(`已提交到 GitHub: ${result.sha.slice(0, 7)}`, 'success');
    } catch (e) {
      addLog(`提交失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setCommitting(false);
    }
  }

  // ── 美化审查 ────────────────────────────────────────────────────────

  async function handleBeautyReview() {
    if (!activeEndpoint) return;
    setBeautyRunning(true);
    setBeautyReport(null);
    setActiveTab('beauty');

    const fileCache = new Map<string, string>();
    // 把 stagedChanges 作为文件传入
    const staged = new Map(
      stagedChanges.map((c) => [c.path, { content: c.content, reason: c.reason }]),
    );

    try {
      const report = await runBeautyReview({
        endpoint: activeEndpoint,
        model: selectedModel,
        files: fileCache,
        stagedChanges: staged,
        onDelta: () => {},
      });
      setBeautyReport(report);
    } catch (e) {
      addLog(`美化审查失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBeautyRunning(false);
    }
  }

  // ── Copy helper ────────────────────────────────────────────────────

  async function copyPath(path: string) {
    await navigator.clipboard.writeText(path).catch(() => {});
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  }

  // ── Render ─────────────────────────────────────────────────────────

  const isConnected = !!ghConfig && !!repoInfo;
  const canRun = isConnected && !!taskText.trim() && !!activeEndpoint && runState !== 'running';

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Header */}
      <header className="topbar flex shrink-0 items-center gap-3 px-3 py-3 md:px-6">
        <Link
          to="/home"
          className="hidden items-center gap-1 rounded-lg px-2 py-1 text-sm text-ink-500 transition hover:bg-lavender-50 md:inline-flex"
        >
          <ChevronLeft size={16} />
          返回
        </Link>
        <FlaskConical size={18} className="text-amber-600" />
        <h2 className="serif-title text-lg text-ink-700">炼金工房</h2>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">
          Beta
        </span>
        <div className="flex-1" />
        {isConnected && (
          <span className="hidden items-center gap-1.5 text-xs text-ink-500 md:flex">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {repoInfo?.fullName}
          </span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 px-3 py-4 md:px-6">
          {/* GitHub 连接卡片 */}
          <GitHubSetupCard
            token={ghToken}
            onTokenChange={setGhToken}
            repoInput={repoInput}
            onRepoInputChange={setRepoInput}
            isConnected={isConnected}
            connecting={connecting}
            error={connectError}
            repoInfo={repoInfo}
            fileTree={fileTree}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />

          {/* 任务输入卡片 */}
          {isConnected && (
            <TaskCard
              task={taskText}
              onTaskChange={setTaskText}
              endpoints={endpoints ?? []}
              selectedEndpointId={selectedEndpointId}
              onEndpointChange={(id) => {
                setSelectedEndpointId(id);
                const ep = endpoints?.find((e) => e.id === id);
                if (ep) {
                  const cheap = ep.chatModels.find(isCheapModel) ?? ep.chatModels[0] ?? '';
                  setSelectedModel(cheap);
                }
              }}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              runState={runState}
              onRun={handleRun}
              onStop={handleStop}
              canRun={canRun}
            />
          )}

          {/* 执行日志 */}
          {logs.length > 0 && (
            <ExecutionLog logs={logs} logEndRef={logEndRef} />
          )}

          {/* 结果面板 */}
          {runState === 'done' && (
            <ResultPanel
              stagedChanges={stagedChanges}
              agentSummary={agentSummary}
              usage={usage}
              model={selectedModel}
              beautyReport={beautyReport}
              beautyRunning={beautyRunning}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              expandedFile={expandedFile}
              onExpandFile={setExpandedFile}
              copiedPath={copiedPath}
              onCopyPath={copyPath}
              onBeautyReview={handleBeautyReview}
              onCommit={handleCommit}
              committing={committing}
              commitDone={commitDone}
              repoInfo={repoInfo}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function GitHubSetupCard({
  token,
  onTokenChange,
  repoInput,
  onRepoInputChange,
  isConnected,
  connecting,
  error,
  repoInfo,
  fileTree,
  onConnect,
  onDisconnect,
}: {
  token: string;
  onTokenChange: (v: string) => void;
  repoInput: string;
  onRepoInputChange: (v: string) => void;
  isConnected: boolean;
  connecting: boolean;
  error: string;
  repoInfo: { fullName: string; defaultBranch: string } | null;
  fileTree: RepoFile[];
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const [showToken, setShowToken] = useState(false);
  const [collapsed, setCollapsed] = useState(isConnected);

  useEffect(() => {
    if (isConnected) setCollapsed(true);
  }, [isConnected]);

  return (
    <div className="workshop-card">
      <button
        type="button"
        className="flex w-full items-center gap-2.5 text-left"
        onClick={() => setCollapsed((c) => !c)}
      >
        <GithubIcon size={16} className={isConnected ? 'text-emerald-500' : 'text-ink-400'} />
        <span className="font-medium text-ink-700">GitHub 连接</span>
        {isConnected && repoInfo && (
          <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 ring-1 ring-emerald-200">
            {repoInfo.fullName} · {fileTree.length} 文件
          </span>
        )}
        <div className="flex-1" />
        <ChevronDown
          size={14}
          className={`text-ink-400 transition-transform ${collapsed ? '' : 'rotate-180'}`}
        />
      </button>

      {!collapsed && (
        <div className="mt-3 space-y-3">
          {!isConnected ? (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-500">
                  GitHub Token (Fine-grained 或 Classic)
                </label>
                <div className="flex gap-2">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={(e) => onTokenChange(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxx"
                    className="workshop-input flex-1"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((s) => !s)}
                    className="rounded-lg border border-lavender-100 px-3 py-2 text-xs text-ink-500 hover:bg-lavender-50"
                  >
                    {showToken ? '隐藏' : '显示'}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-ink-400">
                  需要 Contents: Read & Write 权限。Token 只存在浏览器本地。
                  <a
                    href="https://github.com/settings/tokens/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 text-lavender-500 underline"
                  >
                    创建 Token →
                  </a>
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-500">仓库地址</label>
                <input
                  type="text"
                  value={repoInput}
                  onChange={(e) => onRepoInputChange(e.target.value)}
                  placeholder="owner/repo 或 https://github.com/owner/repo"
                  className="workshop-input w-full"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
                  <XCircle size={14} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={onConnect}
                disabled={connecting || !token || !repoInput}
                className="workshop-btn-primary w-full"
              >
                {connecting ? (
                  <><Loader2 size={14} className="animate-spin" /> 连接中…</>
                ) : (
                  <><GithubIcon size={14} /> 连接仓库</>
                )}
              </button>
            </>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">
                <CheckCircle2 size={15} />
                <div>
                  <div className="font-medium">{repoInfo?.fullName}</div>
                  <div className="text-[11px] text-emerald-600">
                    默认分支: {repoInfo?.defaultBranch} · {fileTree.length} 个文件
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onDisconnect}
                className="w-full rounded-lg border border-lavender-100 py-1.5 text-xs text-ink-500 transition hover:bg-lavender-50"
              >
                断开连接
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  onTaskChange,
  endpoints,
  selectedEndpointId,
  onEndpointChange,
  selectedModel,
  onModelChange,
  runState,
  onRun,
  onStop,
  canRun,
}: {
  task: string;
  onTaskChange: (v: string) => void;
  endpoints: Endpoint[];
  selectedEndpointId: string;
  onEndpointChange: (id: string) => void;
  selectedModel: string;
  onModelChange: (m: string) => void;
  runState: RunState;
  onRun: () => void;
  onStop: () => void;
  canRun: boolean;
}) {
  const activeEndpoint = endpoints.find((e) => e.id === selectedEndpointId);
  const models = activeEndpoint?.chatModels ?? [];
  const cheap = isCheapModel(selectedModel);

  return (
    <div className="workshop-card space-y-3">
      <div className="flex items-center gap-2">
        <FlaskConical size={15} className="text-amber-600" />
        <span className="font-medium text-ink-700">炼制任务</span>
        {cheap && (
          <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700 ring-1 ring-green-200">
            💰 省钱模式
          </span>
        )}
      </div>

      <textarea
        value={task}
        onChange={(e) => onTaskChange(e.target.value)}
        placeholder="用一句话描述要做什么…&#10;例：给所有按钮添加 loading 状态&#10;例：把 fetch 调用统一改成 axios&#10;例：给项目添加深色模式支持"
        rows={4}
        className="workshop-input w-full resize-none"
        disabled={runState === 'running'}
      />

      <div className="flex flex-wrap gap-2">
        {endpoints.length > 1 && (
          <select
            value={selectedEndpointId}
            onChange={(e) => onEndpointChange(e.target.value)}
            className="workshop-select"
          >
            {endpoints.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.name}
              </option>
            ))}
          </select>
        )}

        <select
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          className="workshop-select flex-1"
        >
          {models.map((m) => (
            <option key={m} value={m}>
              {m} {isCheapModel(m) ? '💰' : ''}
            </option>
          ))}
        </select>
      </div>

      {runState !== 'running' ? (
        <button
          type="button"
          onClick={onRun}
          disabled={!canRun}
          className="workshop-btn-primary w-full"
        >
          <Play size={14} />
          开始炼制
        </button>
      ) : (
        <button
          type="button"
          onClick={onStop}
          className="w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-100"
        >
          <div className="flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            炼制中… 点击停止
          </div>
        </button>
      )}
    </div>
  );
}

function ExecutionLog({
  logs,
  logEndRef,
}: {
  logs: LogEntry[];
  logEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const iconMap: Record<LogEntry['type'], React.ReactNode> = {
    info: <div className="h-1.5 w-1.5 rounded-full bg-ink-300 mt-1.5 shrink-0" />,
    success: <CheckCircle2 size={13} className="text-emerald-500 mt-0.5 shrink-0" />,
    error: <XCircle size={13} className="text-red-500 mt-0.5 shrink-0" />,
    tool: <Sparkles size={13} className="text-amber-500 mt-0.5 shrink-0" />,
    system: <FlaskConical size={13} className="text-lavender-500 mt-0.5 shrink-0" />,
  };

  return (
    <div className="workshop-card">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setCollapsed((c) => !c)}
      >
        <Sparkles size={14} className="text-amber-500" />
        <span className="text-sm font-medium text-ink-700">执行日志</span>
        <span className="ml-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">
          {logs.length}
        </span>
        <div className="flex-1" />
        <ChevronDown
          size={14}
          className={`text-ink-400 transition-transform ${collapsed ? '' : 'rotate-180'}`}
        />
      </button>

      {!collapsed && (
        <div className="mt-3 max-h-64 overflow-y-auto rounded-lg bg-ink-50/60 p-3">
          <div className="space-y-1.5">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 text-[12px]">
                {iconMap[log.type]}
                <span
                  className={
                    log.type === 'error'
                      ? 'text-red-600'
                      : log.type === 'success'
                      ? 'text-emerald-700'
                      : log.type === 'tool'
                      ? 'text-amber-700'
                      : log.type === 'system'
                      ? 'text-lavender-600'
                      : 'text-ink-600'
                  }
                >
                  {log.message}
                </span>
              </div>
            ))}
          </div>
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}

function ResultPanel({
  stagedChanges,
  agentSummary,
  usage,
  model,
  beautyReport,
  beautyRunning,
  activeTab,
  onTabChange,
  expandedFile,
  onExpandFile,
  copiedPath,
  onCopyPath,
  onBeautyReview,
  onCommit,
  committing,
  commitDone,
  repoInfo,
}: {
  stagedChanges: StagedChange[];
  agentSummary: string;
  usage: { inputTokens: number; outputTokens: number; cost: number } | null;
  model: string;
  beautyReport: BeautyReport | null;
  beautyRunning: boolean;
  activeTab: ActiveTab;
  onTabChange: (t: ActiveTab) => void;
  expandedFile: string | null;
  onExpandFile: (p: string | null) => void;
  copiedPath: string | null;
  onCopyPath: (p: string) => void;
  onBeautyReview: () => void;
  onCommit: () => void;
  committing: boolean;
  commitDone: string | null;
  repoInfo: { fullName: string; defaultBranch: string } | null;
}) {
  return (
    <div className="workshop-card space-y-3">
      {/* Agent 摘要 */}
      {agentSummary && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
          <FlaskConical size={15} className="mt-0.5 shrink-0 text-amber-600" />
          <p>{agentSummary}</p>
        </div>
      )}

      {/* 提交区域 */}
      {stagedChanges.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {!commitDone ? (
            <>
              <button
                type="button"
                onClick={onCommit}
                disabled={committing}
                className="workshop-btn-primary"
              >
                {committing ? (
                  <><Loader2 size={13} className="animate-spin" /> 提交中…</>
                ) : (
                  <><GitCommitHorizontal size={13} /> 提交 {stagedChanges.length} 个文件到 GitHub</>
                )}
              </button>
              <button
                type="button"
                onClick={onBeautyReview}
                disabled={beautyRunning}
                className="flex items-center gap-1.5 rounded-xl border border-lavender-200 bg-lavender-50 px-4 py-2 text-sm font-medium text-lavender-700 transition hover:bg-lavender-100"
              >
                {beautyRunning ? (
                  <><Loader2 size={13} className="animate-spin" /> 审查中…</>
                ) : (
                  <><Eye size={13} /> 美化审查</>
                )}
              </button>
            </>
          ) : (
            <a
              href={commitDone}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
            >
              <CheckCircle2 size={14} />
              已提交到 GitHub · 点击查看 →
            </a>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-lavender-100">
        {([
          ['changes', <FileCode2 size={13} />, `文件变更 (${stagedChanges.length})`],
          ['beauty', <Eye size={13} />, '美化审查'],
          ['cost', <DollarSign size={13} />, '用量'],
        ] as [ActiveTab, React.ReactNode, string][]).map(([tab, icon, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-medium transition ${
              activeTab === tab
                ? 'border-b-2 border-amber-500 text-amber-700'
                : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      {activeTab === 'changes' && (
        <FileChangesTab
          changes={stagedChanges}
          expandedFile={expandedFile}
          onExpandFile={onExpandFile}
          copiedPath={copiedPath}
          onCopyPath={onCopyPath}
        />
      )}
      {activeTab === 'beauty' && (
        <BeautyTab
          report={beautyReport}
          running={beautyRunning}
          onRunReview={onBeautyReview}
          hasChanges={stagedChanges.length > 0}
        />
      )}
      {activeTab === 'cost' && (
        <CostTab usage={usage} model={model} repoInfo={repoInfo} />
      )}
    </div>
  );
}

function FileChangesTab({
  changes,
  expandedFile,
  onExpandFile,
  copiedPath,
  onCopyPath,
}: {
  changes: StagedChange[];
  expandedFile: string | null;
  onExpandFile: (p: string | null) => void;
  copiedPath: string | null;
  onCopyPath: (p: string) => void;
}) {
  if (changes.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-ink-400">
        暂无文件变更
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {changes.map((c) => {
        const isExpanded = expandedFile === c.path;
        const ext = c.path.split('.').pop() ?? '';
        return (
          <div
            key={c.path}
            className="overflow-hidden rounded-lg border border-lavender-100"
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-lavender-50"
              onClick={() => onExpandFile(isExpanded ? null : c.path)}
            >
              <FileCode2 size={13} className="shrink-0 text-amber-500" />
              <span className="flex-1 truncate font-mono text-[12px] text-ink-700">
                {c.path}
              </span>
              <span className="shrink-0 text-[10px] text-ink-400">{ext}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onCopyPath(c.path); }}
                className="shrink-0 rounded p-1 text-ink-400 hover:bg-lavender-100"
              >
                {copiedPath === c.path ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
              </button>
              {isExpanded ? <ChevronUp size={13} className="text-ink-400" /> : <ChevronDown size={13} className="text-ink-400" />}
            </button>

            {isExpanded && (
              <div className="border-t border-lavender-100">
                {c.reason && (
                  <div className="border-b border-lavender-50 bg-amber-50/40 px-3 py-1.5 text-[11px] text-amber-700">
                    {c.reason}
                  </div>
                )}
                <pre className="max-h-80 overflow-auto bg-ink-50/40 p-3 font-mono text-[11px] text-ink-700 leading-relaxed">
                  {c.content}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BeautyTab({
  report,
  running,
  onRunReview,
  hasChanges,
}: {
  report: BeautyReport | null;
  running: boolean;
  onRunReview: () => void;
  hasChanges: boolean;
}) {
  if (running) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <Loader2 size={24} className="animate-spin text-lavender-400" />
        <p className="text-sm text-ink-500">美化炼金师正在审查…</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Eye size={28} className="text-lavender-300" />
        <p className="text-sm text-ink-500">
          {hasChanges
            ? '点击「美化审查」让 AI 分析 UI 文件并给出改进建议'
            : '先完成炼制任务，再运行美化审查'}
        </p>
        {hasChanges && (
          <button
            type="button"
            onClick={onRunReview}
            className="flex items-center gap-2 rounded-xl bg-lavender-100 px-4 py-2 text-sm font-medium text-lavender-700 hover:bg-lavender-200"
          >
            <Eye size={14} />
            运行美化审查
          </button>
        )}
      </div>
    );
  }

  const scoreColor = (s: number) =>
    s >= 8 ? 'text-emerald-600' : s >= 6 ? 'text-amber-600' : 'text-red-500';
  const scoreBar = (s: number) =>
    `${(s / 10) * 100}%`;
  const barColor = (s: number) =>
    s >= 8 ? 'bg-emerald-400' : s >= 6 ? 'bg-amber-400' : 'bg-red-400';

  const severityIcon = {
    critical: <XCircle size={12} className="text-red-500 shrink-0 mt-0.5" />,
    warning: <AlertCircle size={12} className="text-amber-500 shrink-0 mt-0.5" />,
    suggestion: <Sparkles size={12} className="text-lavender-500 shrink-0 mt-0.5" />,
  };

  return (
    <div className="space-y-4">
      {/* 总分 */}
      <div className="flex items-center gap-4 rounded-xl bg-lavender-50 px-4 py-3 ring-1 ring-lavender-100">
        <div className="text-center">
          <div className={`text-3xl font-bold ${scoreColor(report.score.overall)}`}>
            {report.score.overall}
          </div>
          <div className="text-[10px] text-ink-400">/ 10</div>
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium text-ink-700">美化综合评分</div>
          <div className="text-[11px] text-ink-400">{report.model}</div>
        </div>
      </div>

      {/* 各维度评分 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(
          [
            ['色彩', report.score.colors],
            ['排版', report.score.typography],
            ['间距', report.score.spacing],
            ['一致性', report.score.consistency],
            ['可访问性', report.score.accessibility],
          ] as [string, number][]
        ).map(([label, score]) => (
          <div key={label} className="rounded-lg bg-ink-50/60 px-3 py-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-ink-500">{label}</span>
              <span className={`text-xs font-semibold ${scoreColor(score)}`}>{score}</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-ink-200">
              <div
                className={`h-full rounded-full transition-all ${barColor(score)}`}
                style={{ width: scoreBar(score) }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* 摘要 */}
      {report.summary && (
        <p className="rounded-lg bg-ink-50/60 px-3 py-2 text-[12px] text-ink-600 leading-relaxed">
          {report.summary}
        </p>
      )}

      {/* 亮点 */}
      {report.highlights.length > 0 && (
        <ul className="space-y-1">
          {report.highlights.map((h, i) => (
            <li key={i} className="flex items-start gap-2 text-[12px] text-ink-600">
              <span className="mt-0.5 shrink-0 opacity-70">•</span>
              {h}
            </li>
          ))}
        </ul>
      )}

      {/* 问题列表 */}
      {report.issues.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-ink-500">发现的问题</div>
          {report.issues.map((issue, i) => (
            <div
              key={i}
              className="rounded-lg border border-lavender-100 bg-lavender-50/40 px-3 py-2"
            >
              <div className="flex items-start gap-2">
                {severityIcon[issue.severity]}
                <div className="flex-1 min-w-0">
                  {issue.file && (
                    <div className="font-mono text-[10px] text-ink-400 mb-0.5 truncate">{issue.file}</div>
                  )}
                  <div className="text-[12px] text-ink-700">{issue.message}</div>
                  {issue.fix && (
                    <div className="mt-1 text-[11px] text-lavender-600">
                      💡 {issue.fix}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CostTab({
  usage,
  model,
  repoInfo,
}: {
  usage: { inputTokens: number; outputTokens: number; cost: number } | null;
  model: string;
  repoInfo: { fullName: string; defaultBranch: string } | null;
}) {
  if (!usage) {
    return (
      <div className="py-8 text-center text-sm text-ink-400">
        炼制完成后显示用量统计
      </div>
    );
  }

  const total = usage.inputTokens + usage.outputTokens;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          ['输入 Token', usage.inputTokens.toLocaleString()],
          ['输出 Token', usage.outputTokens.toLocaleString()],
          ['总计', total.toLocaleString()],
        ].map(([label, val]) => (
          <div key={label} className="rounded-lg bg-ink-50/60 px-3 py-2 text-center">
            <div className="text-[11px] text-ink-400">{label}</div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-ink-700">{val}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-100">
        <div>
          <div className="text-xs text-amber-700 font-medium">预估费用</div>
          <div className="text-[11px] text-amber-600">模型: {model}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-amber-700">
            ${usage.cost.toFixed(4)}
          </div>
          <div className="text-[10px] text-amber-500">USD (估算)</div>
        </div>
      </div>

      {isCheapModel(model) && (
        <div className="flex items-start gap-2 rounded-lg bg-green-50 px-3 py-2 text-[11px] text-green-700 ring-1 ring-green-200">
          <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
          已启用省钱模式：使用低价模型，通常比 Sonnet/GPT-4 便宜 10–20 倍。
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────

// 简单的费用估算（从 pricing.ts 逻辑简化而来）
const PRICING_MAP: Record<string, { input: number; output: number }> = {
  haiku: { input: 0.8, output: 4 },
  'claude-3-5-haiku': { input: 0.8, output: 4 },
  'claude-3-5-sonnet': { input: 3, output: 15 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'deepseek-v3': { input: 0.27, output: 1.1 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  let price = { input: 3, output: 15 };
  for (const [key, p] of Object.entries(PRICING_MAP)) {
    if (model.toLowerCase().includes(key)) {
      price = p;
      break;
    }
  }
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
