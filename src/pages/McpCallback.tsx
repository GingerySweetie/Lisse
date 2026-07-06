import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { completeAuthorization } from '../lib/mcp/oauth';
import { invalidateSession } from '../lib/mcp/client';

/**
 * Landing page for the OAuth redirect. Reads ?code&state, exchanges the
 * code for tokens via completeAuthorization(), then bounces back to /mcp.
 */
export default function McpCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'busy' | 'ok' | 'error'>('busy');
  const [message, setMessage] = useState<string>('正在完成授权…');
  const [serverName, setServerName] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await completeAuthorization(searchParams);
        if (cancelled) return;
        invalidateSession(result.serverId);
        setServerName(result.serverName);
        setStatus('ok');
        setMessage(`已授权 ${result.serverName}，2 秒后跳回 MCP 设置…`);
        setTimeout(() => {
          if (!cancelled) navigate('/mcp', { replace: true });
        }, 1500);
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setMessage(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-lavender-200 bg-white/80 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-ink-900">MCP OAuth 授权</h2>
        <p
          className={`mt-3 break-all text-sm ${
            status === 'error'
              ? 'text-rose-500'
              : status === 'ok'
                ? 'text-emerald-600'
                : 'text-ink-500'
          }`}
        >
          {message}
        </p>
        {status === 'ok' && serverName && (
          <p className="mt-2 text-xs text-ink-500">
            如果没自动跳转，点{' '}
            <Link to="/mcp" className="underline">
              返回 MCP 设置
            </Link>
            。
          </p>
        )}
        {status === 'error' && (
          <div className="mt-4 flex gap-2">
            <Link
              to="/mcp"
              className="rounded-lg border border-lavender-200 px-3 py-2 text-xs text-ink-700 transition hover:bg-lavender-50"
            >
              返回 MCP 设置
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
