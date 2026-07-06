import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  KeyRound,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { db, getSettings } from '../db';
import { newId } from '../lib/id';
import { invalidateSession } from '../lib/mcp/client';
import { refreshServerTools } from '../lib/mcp/tools';
import { beginAuthorization, disconnectOAuth } from '../lib/mcp/oauth';
import type { McpServer } from '../types';

/**
 * MCP server management. Each row exposes one external tool source
 * (filesystem, github, calendar, custom server, etc.) over Streamable
 * HTTP. Once a server is added + enabled, its tools are merged into the
 * chat tool loop automatically — no per-conversation wiring needed.
 *
 * Auth options per server:
 *   - OAuth 2.1 + PKCE: for hosted MCP servers (Notion, GitHub, Cloudflare
 *     hosted ones). Click "OAuth 授权" to run the browser flow.
 *   - Static Authorization header: for self-hosted servers / integration
 *     tokens.
 *
 * Tools settings.toolsEnabled gates ALL tool usage (memory + MCP); make
 * sure it's on in /settings or the model never sees the tools.
 */

type AuthKind = 'oauth' | 'header' | 'none';

const PRESETS: {
  label: string;
  name: string;
  url: string;
  authKind: AuthKind;
  note?: string;
}[] = [
  {
    label: 'Notion（官方，OAuth）',
    name: 'Notion',
    url: 'https://mcp.notion.com/mcp',
    authKind: 'oauth',
    note: 'Notion 官方 MCP 只支持 OAuth，加完点「OAuth 授权」。',
  },
  {
    label: 'GitHub（官方，OAuth）',
    name: 'GitHub',
    url: 'https://api.githubcopilot.com/mcp/',
    authKind: 'oauth',
  },
  {
    label: '自定义 / 自建',
    name: '',
    url: '',
    authKind: 'header',
  },
];

export default function McpPage() {
  const servers = useLiveQuery(
    () => db.mcpServers.orderBy('createdAt').toArray(),
    [],
    [],
  );
  const settings = useLiveQuery(() => getSettings(), []);
  const [editing, setEditing] = useState<McpServer | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex h-full w-full flex-col">
      <header className="topbar flex items-center gap-3 px-3 py-3 md:px-6">
        <Link
          to="/chat"
          className="hidden items-center gap-1 rounded-lg px-2 py-1 text-sm text-ink-500 transition hover:bg-lavender-50 md:inline-flex"
        >
          <ChevronLeft size={16} />
          返回
        </Link>
        <h2 className="endpoint-card-title">设置 · MCP</h2>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-6 md:px-6">
        <div className="mx-auto max-w-3xl">
          {settings && !settings.toolsEnabled && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              ⚠️ 工具调用未开启。请先前往{' '}
              <Link to="/settings" className="underline underline-offset-2">
                设置
              </Link>{' '}
              开启「启用工具调用」，MCP 工具才会生效。
            </div>
          )}
          <div className="mb-4 flex items-start justify-between gap-3">
            <p className="text-sm text-ink-500">
              添加 MCP 服务器，其工具会自动汇入对话可调用的 tool 列表。
              <br />
              支持 Streamable HTTP + OAuth 2.1（PKCE + 动态客户端注册）。
              Notion、GitHub 等官方 MCP 都要走 OAuth。
            </p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="btn-primary flex shrink-0 items-center gap-1.5"
            >
              <Plus size={16} />
              加服务器
            </button>
          </div>

          {(servers ?? []).length === 0 ? (
            <div className="mt-12 text-center text-sm text-ink-500/70">
              还没接入 MCP 服务器。
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {servers?.map((s) => (
                <li key={s.id}>
                  <ServerCard server={s} onEdit={() => setEditing(s)} />
                </li>
              ))}
            </ul>
          )}

          {(creating || editing) && (
            <ServerEditor
              server={editing}
              onClose={() => {
                setCreating(false);
                setEditing(null);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ServerCard({
  server,
  onEdit,
}: {
  server: McpServer;
  onEdit: () => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  async function handleToggle() {
    await db.mcpServers.update(server.id, {
      enabled: !server.enabled,
      updatedAt: Date.now(),
    });
    invalidateSession(server.id);
  }

  async function handleDelete() {
    if (!confirm(`删除 MCP 服务器「${server.name}」？`)) return;
    await db.mcpServers.delete(server.id);
    invalidateSession(server.id);
  }

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      invalidateSession(server.id);
      const fresh = (await db.mcpServers.get(server.id)) ?? server;
      await refreshServerTools(fresh);
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }

  async function handleAuthorize() {
    setAuthBusy(true);
    setRefreshError(null);
    try {
      await beginAuthorization(server);
      // If beginAuthorization returns without redirecting, something went
      // wrong before the redirect.
    } catch (e) {
      setRefreshError(
        `授权失败：${e instanceof Error ? e.message : String(e)}`,
      );
      setAuthBusy(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm(`断开「${server.name}」的 OAuth 授权？`)) return;
    await disconnectOAuth(server.id);
    invalidateSession(server.id);
  }

  const authStatus = describeAuth(server);

  return (
    <div className="endpoint-card !mt-0 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-ink-900">
              {server.name}
            </h3>
            {!server.enabled && (
              <span className="text-xs text-ink-400">· 关闭中</span>
            )}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${authStatus.className}`}
              title={authStatus.title}
            >
              {authStatus.icon}
              {authStatus.label}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-500 font-mono">
            {server.url}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="icon-btn"
            aria-label="重新拉工具列表"
            title="重新拉工具列表"
          >
            <RefreshCw
              size={16}
              className={refreshing ? 'animate-spin' : ''}
            />
          </button>
          <button
            type="button"
            onClick={handleToggle}
            className="icon-btn"
            aria-label={server.enabled ? '禁用' : '启用'}
            title={server.enabled ? '禁用' : '启用'}
          >
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: 5,
                background: server.enabled ? '#7ab896' : '#c5b8d0',
              }}
            />
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="icon-btn"
            aria-label="编辑"
          >
            编辑
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="icon-btn danger"
            aria-label="删除"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!server.oauth && (
          <button
            type="button"
            onClick={handleAuthorize}
            disabled={authBusy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-lavender-200 px-3 py-1.5 text-xs text-ink-700 transition hover:bg-lavender-50 disabled:opacity-50"
          >
            <KeyRound size={13} />
            {authBusy ? '正在跳转…' : 'OAuth 授权'}
          </button>
        )}
        {server.oauth && (
          <button
            type="button"
            onClick={handleAuthorize}
            disabled={authBusy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-lavender-200 px-3 py-1.5 text-xs text-ink-700 transition hover:bg-lavender-50 disabled:opacity-50"
          >
            <RefreshCw size={13} />
            重新授权
          </button>
        )}
        {server.oauth && (
          <button
            type="button"
            onClick={handleDisconnect}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-600 transition hover:bg-rose-50"
          >
            <LogOut size={13} />
            断开授权
          </button>
        )}
      </div>

      {server.cachedTools && server.cachedTools.length > 0 && (
        <div className="mt-1">
          <div className="flex flex-wrap gap-1.5">
            {server.cachedTools.map((t) => (
              <span
                key={t.name}
                title={t.description}
                className="rounded-full border border-lavender-200 bg-lavender-50 px-2 py-0.5 text-[10px] text-ink-600"
              >
                {t.name}
              </span>
            ))}
          </div>
          {server.cachedAt && (
            <p className="mt-1 text-[10px] text-ink-400">
              缓存于 {new Date(server.cachedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {refreshError && (
        <p className="mt-1 break-all text-xs text-rose-500">{refreshError}</p>
      )}
    </div>
  );
}

function describeAuth(server: McpServer): {
  label: string;
  title: string;
  className: string;
  icon: React.ReactNode;
} {
  if (server.oauth?.accessToken || server.oauth?.refreshToken) {
    const when = server.oauth.connectedAt
      ? new Date(server.oauth.connectedAt).toLocaleString()
      : '';
    return {
      label: 'OAuth 已连接',
      title: `已通过 OAuth 授权${when ? ' · ' + when : ''}`,
      className: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
      icon: <ShieldCheck size={11} />,
    };
  }
  if (server.oauth) {
    return {
      label: 'OAuth 待完成',
      title: 'OAuth 已开始但未拿到 token — 点「OAuth 授权」继续',
      className: 'border border-amber-200 bg-amber-50 text-amber-700',
      icon: <KeyRound size={11} />,
    };
  }
  if (server.authHeader) {
    return {
      label: '静态 token',
      title: '使用静态 Authorization header',
      className: 'border border-lavender-200 bg-lavender-50 text-ink-600',
      icon: <KeyRound size={11} />,
    };
  }
  return {
    label: '未鉴权',
    title: '当前没有任何鉴权信息',
    className: 'border border-ink-200 bg-ink-50 text-ink-500',
    icon: <KeyRound size={11} />,
  };
}

function ServerEditor({
  server,
  onClose,
}: {
  server: McpServer | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(server?.name ?? '');
  const [url, setUrl] = useState(server?.url ?? '');
  const [authKind, setAuthKind] = useState<AuthKind>(
    server?.oauth ? 'oauth' : server?.authHeader ? 'header' : 'none',
  );
  const [authHeader, setAuthHeader] = useState(server?.authHeader ?? '');
  const [enabled, setEnabled] = useState(server?.enabled ?? true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    | { ok: true; toolCount: number }
    | { ok: false; message: string }
    | null
  >(null);
  const [saving, setSaving] = useState(false);

  const isNew = server == null;
  const redirectHint = useMemo(
    () => `${window.location.origin}/mcp/callback`,
    [],
  );

  function applyPreset(preset: (typeof PRESETS)[number]) {
    if (preset.name) setName(preset.name);
    if (preset.url) setUrl(preset.url);
    setAuthKind(preset.authKind);
    setTestResult(null);
  }

  async function persist(overrides?: Partial<McpServer>): Promise<McpServer> {
    const now = Date.now();
    const id = server?.id ?? newId();
    const newUrl = url.trim();
    const newAuthHeader =
      authKind === 'header' ? authHeader.trim() || undefined : undefined;
    const endpointChanged =
      server == null ||
      newUrl !== server.url ||
      newAuthHeader !== server.authHeader ||
      (authKind !== 'oauth' && server?.oauth != null);
    // If user switched to non-oauth, drop the oauth blob.
    const oauth = authKind === 'oauth' ? server?.oauth : undefined;
    const next: McpServer = {
      id,
      name: name.trim(),
      url: newUrl,
      authHeader: newAuthHeader,
      oauth,
      enabled,
      cachedTools: endpointChanged ? undefined : server?.cachedTools,
      cachedAt: endpointChanged ? undefined : server?.cachedAt,
      createdAt: server?.createdAt ?? now,
      updatedAt: now,
      ...overrides,
    };
    await db.mcpServers.put(next);
    invalidateSession(id);
    return next;
  }

  async function handleSave() {
    if (!name.trim() || !url.trim()) {
      alert('名字和 URL 都不能空');
      return;
    }
    setSaving(true);
    try {
      await persist();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndAuthorize() {
    if (!name.trim() || !url.trim()) {
      alert('名字和 URL 都不能空');
      return;
    }
    setSaving(true);
    try {
      const saved = await persist();
      // Navigates away — no need to close the modal.
      await beginAuthorization(saved);
    } catch (e) {
      setSaving(false);
      alert(`授权失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleTest() {
    if (!url.trim()) {
      alert('URL 不能空');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const probe: McpServer = {
        id: server?.id ?? 'probe',
        name: name.trim() || 'probe',
        url: url.trim(),
        authHeader:
          authKind === 'header' ? authHeader.trim() || undefined : undefined,
        oauth: authKind === 'oauth' ? server?.oauth : undefined,
        enabled: true,
        createdAt: 0,
        updatedAt: 0,
      };
      const tools = await refreshServerTools(probe);
      setTestResult({ ok: true, toolCount: tools.length });
    } catch (e) {
      setTestResult({
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/30 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-ink-900">
            {server ? '编辑 MCP 服务器' : '加 MCP 服务器'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-ink-500 transition hover:bg-lavender-50"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        {isNew && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-ink-500">快速模板</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="rounded-lg border border-lavender-200 bg-white px-2.5 py-1 text-[11px] text-ink-700 transition hover:bg-lavender-50"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-500">
              名字（也用作工具名命名空间前缀）
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="github / filesystem / notion ……"
              className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-500">URL</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              className="rounded-lg border border-lavender-200 bg-white px-3 py-2 font-mono text-xs focus:border-lavender-300"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink-500">鉴权方式</span>
            <div className="flex flex-wrap gap-2">
              <AuthRadio
                current={authKind}
                value="oauth"
                onChange={setAuthKind}
                label="OAuth 2.1"
                hint="Notion / GitHub 等官方 MCP"
              />
              <AuthRadio
                current={authKind}
                value="header"
                onChange={setAuthKind}
                label="静态 Header"
                hint="自建 / integration token"
              />
              <AuthRadio
                current={authKind}
                value="none"
                onChange={setAuthKind}
                label="无鉴权"
                hint="内网 / 本地"
              />
            </div>
          </div>

          {authKind === 'header' && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-500">
                Authorization Header
              </span>
              <input
                value={authHeader}
                onChange={(e) => setAuthHeader(e.target.value)}
                placeholder="Bearer xxxxx"
                className="rounded-lg border border-lavender-200 bg-white px-3 py-2 font-mono text-xs focus:border-lavender-300"
              />
              <span className="text-[10px] text-ink-500">
                原样注入到 Authorization 头。注意：Notion 官方 MCP 不吃这个，
                只吃 OAuth。
              </span>
            </label>
          )}

          {authKind === 'oauth' && (
            <div className="rounded-lg border border-lavender-200 bg-lavender-50/40 p-3 text-xs text-ink-700">
              <p className="font-medium text-ink-900">OAuth 授权流程</p>
              <ol className="mt-1 list-decimal pl-4 leading-relaxed">
                <li>先「保存并授权」把服务器存进来。</li>
                <li>浏览器会跳到 MCP 服务器的授权页，登录 / 同意。</li>
                <li>
                  同意后会回跳到{' '}
                  <span className="font-mono">{redirectHint}</span>
                  ，token 存本地 IndexedDB。
                </li>
                <li>过期后会用 refresh_token 自动续；续不到会提示重授权。</li>
              </ol>
              {server?.oauth && (
                <p className="mt-2 text-emerald-600">
                  ✓ 已有 OAuth 授权（client_id：
                  <span className="font-mono">
                    {server.oauth.clientId.slice(0, 12)}…
                  </span>
                  ）
                </p>
              )}
            </div>
          )}

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="text-xs text-ink-700">启用</span>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="rounded-lg border border-lavender-200 px-3 py-2 text-xs text-ink-700 transition hover:bg-lavender-50 disabled:opacity-50"
          >
            {testing ? '测试中…' : '测试连接'}
          </button>
          {testResult?.ok && (
            <span className="text-xs text-emerald-600">
              通了，发现 {testResult.toolCount} 个工具
            </span>
          )}
          {testResult?.ok === false && (
            <span className="break-all text-xs text-rose-500">
              {testResult.message}
            </span>
          )}
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-lavender-200 px-4 py-2 text-sm text-ink-700 transition hover:bg-lavender-50"
          >
            取消
          </button>
          {authKind === 'oauth' && !server?.oauth && (
            <button
              type="button"
              onClick={handleSaveAndAuthorize}
              disabled={saving}
              className="rounded-lg bg-lavender-300 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-400 disabled:opacity-50"
            >
              {saving ? '跳转中…' : '保存并授权'}
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-lavender-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-300 disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AuthRadio({
  current,
  value,
  onChange,
  label,
  hint,
}: {
  current: AuthKind;
  value: AuthKind;
  onChange: (v: AuthKind) => void;
  label: string;
  hint: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`min-w-[120px] flex-1 rounded-lg border px-3 py-2 text-left text-xs transition ${
        active
          ? 'border-lavender-400 bg-lavender-100 text-ink-900'
          : 'border-lavender-200 bg-white text-ink-600 hover:bg-lavender-50'
      }`}
    >
      <div className="font-medium">{label}</div>
      <div className="mt-0.5 text-[10px] opacity-70">{hint}</div>
    </button>
  );
}
