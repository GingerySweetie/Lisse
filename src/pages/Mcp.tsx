import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { ChevronLeft, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { db, getSettings } from '../db';
import { newId } from '../lib/id';
import { invalidateSession } from '../lib/mcp/client';
import { refreshServerTools } from '../lib/mcp/tools';
import type { McpServer } from '../types';

/**
 * MCP server management. Each row exposes one external tool source
 * (filesystem, github, calendar, custom server, etc.) over Streamable
 * HTTP. Once a server is added + enabled, its tools are merged into the
 * chat tool loop automatically — no per-conversation wiring needed.
 *
 * Tools settings.toolsEnabled gates ALL tool usage (memory + MCP); make
 * sure it's on in /settings or the model never sees the tools.
 */

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
              支持 Streamable HTTP transport（单端点 POST JSON-RPC）。
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
      await refreshServerTools(server);
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="endpoint-card !mt-0 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-ink-900">
              {server.name}
            </h3>
            {!server.enabled && (
              <span className="text-xs text-ink-400">· 关闭中</span>
            )}
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

function ServerEditor({
  server,
  onClose,
}: {
  server: McpServer | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(server?.name ?? '');
  const [url, setUrl] = useState(server?.url ?? '');
  const [authHeader, setAuthHeader] = useState(server?.authHeader ?? '');
  const [enabled, setEnabled] = useState(server?.enabled ?? true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    | { ok: true; toolCount: number }
    | { ok: false; message: string }
    | null
  >(null);

  async function handleSave() {
    if (!name.trim() || !url.trim()) {
      alert('名字和 URL 都不能空');
      return;
    }
    const now = Date.now();
    const id = server?.id ?? newId();
    const newUrl = url.trim();
    const newAuth = authHeader.trim() || undefined;
    // Clear tool cache if the endpoint or credentials changed.
    const endpointChanged =
      server == null ||
      newUrl !== server.url ||
      newAuth !== server.authHeader;
    const next: McpServer = {
      id,
      name: name.trim(),
      url: newUrl,
      authHeader: newAuth,
      enabled,
      cachedTools: endpointChanged ? undefined : server?.cachedTools,
      cachedAt: endpointChanged ? undefined : server?.cachedAt,
      createdAt: server?.createdAt ?? now,
      updatedAt: now,
    };
    await db.mcpServers.put(next);
    invalidateSession(id);
    onClose();
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
        authHeader: authHeader.trim() || undefined,
        enabled: true,
        createdAt: 0,
        updatedAt: 0,
      };
      const tools = await refreshServerTools(probe);
      // refreshServerTools wrote to db.mcpServers.update — that's a no-op
      // if id doesn't exist, no cleanup needed.
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

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-500">
              Authorization Header（可空）
            </span>
            <input
              value={authHeader}
              onChange={(e) => setAuthHeader(e.target.value)}
              placeholder="Bearer xxxxx"
              className="rounded-lg border border-lavender-200 bg-white px-3 py-2 font-mono text-xs focus:border-lavender-300"
            />
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="text-xs text-ink-700">启用</span>
          </label>
        </div>

        <div className="mt-4 flex items-center gap-2">
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

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-lavender-200 px-4 py-2 text-sm text-ink-700 transition hover:bg-lavender-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-lavender-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-300"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
