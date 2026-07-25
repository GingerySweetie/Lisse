/**
 * Cloudflare Pages Function: same-origin reverse proxy for Cursor Cloud Agents API.
 * Mirrors worker/index.ts so Git-connected Pages deploys also get /proxy/cursor.
 */

const CURSOR_API = 'https://api.cursor.com';

type PagesContext = {
  request: Request;
  params: { path?: string | string[] };
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
};

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const parts = Array.isArray(params.path)
    ? params.path
    : params.path
      ? [params.path]
      : [];
  const suffix = parts.length ? `/${parts.join('/')}` : '/';
  const url = new URL(request.url);
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
