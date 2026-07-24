/**
 * Cloudflare Worker for Lisse static assets + Cursor API reverse proxy.
 *
 * `/proxy/cursor/*` → `https://api.cursor.com/*` so browser clients on
 * custom domains can call Cloud Agents API without CORS.
 * Everything else is served from the `[assets]` binding (SPA).
 */

const CURSOR_API = 'https://api.cursor.com';
const PROXY_PREFIX = '/proxy/cursor';

interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PROXY_PREFIX || url.pathname.startsWith(`${PROXY_PREFIX}/`)) {
      return proxyCursor(request, url);
    }
    return env.ASSETS.fetch(request);
  },
};

async function proxyCursor(request: Request, url: URL): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request),
    });
  }

  const suffix = url.pathname.slice(PROXY_PREFIX.length) || '/';
  const target = new URL(suffix + url.search, CURSOR_API);

  const headers = new Headers();
  for (const key of [
    'authorization',
    'content-type',
    'accept',
    'accept-language',
    'user-agent',
  ]) {
    const v = request.headers.get(key);
    if (v) headers.set(key, v);
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: 'follow',
  });

  const out = new Headers(upstream.headers);
  for (const [k, v] of corsHeaders(request)) out.set(k, v);
  out.delete('content-encoding');
  out.delete('content-length');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}

function corsHeaders(request: Request): Headers {
  const origin = request.headers.get('Origin') ?? '*';
  return new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Authorization, Content-Type, Accept, Accept-Language',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  });
}
