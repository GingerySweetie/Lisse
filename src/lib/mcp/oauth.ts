import { db } from '../../db';
import type { McpOAuth, McpServer } from '../../types';

/**
 * OAuth 2.1 + PKCE + Dynamic Client Registration for MCP servers.
 *
 * MCP servers hosted by third parties (Notion, GitHub Copilot, Cloudflare
 * hosted ones) authenticate over standard OAuth: bring-your-own bearer
 * tokens are NOT supported. This module implements the browser side of
 * the flow the spec mandates:
 *
 *   1. RFC 9470 discovery: GET <server>/.well-known/oauth-protected-resource
 *      → learn the authorization server URL
 *   2. RFC 8414 discovery: GET <auth-server>/.well-known/oauth-authorization-server
 *      → learn authorization_endpoint / token_endpoint / registration_endpoint
 *   3. RFC 7591 dynamic client registration (public client, PKCE, none auth)
 *      → get a client_id
 *   4. Authorization Code + PKCE:
 *      - build authorize URL with code_challenge=S256(code_verifier)
 *      - redirect the user in the same tab
 *      - after consent, the server redirects back to /mcp/callback with
 *        `code` + `state`
 *      - exchange the code for {access_token, refresh_token} at the token
 *        endpoint
 *   5. Store tokens on the McpServer row; add
 *      `Authorization: Bearer <access_token>` to every subsequent request
 *   6. On 401 or expired token: refresh via refresh_token grant. If refresh
 *      returns invalid_grant, prompt re-authorization.
 *
 * Everything is stored in IndexedDB (already the app's convention).
 * Pending PKCE material sits in sessionStorage so it survives the redirect
 * but not a browser restart.
 */

export interface OAuthAuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  code_challenge_methods_supported?: string[];
  scopes_supported?: string[];
  grant_types_supported?: string[];
  response_types_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
}

interface ProtectedResourceMetadata {
  authorization_servers?: string[];
  resource?: string;
}

interface RegistrationResponse {
  client_id: string;
  client_id_issued_at?: number;
  client_secret?: string;
  client_secret_expires_at?: number;
  registration_client_uri?: string;
  registration_access_token?: string;
}

interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

interface PendingAuthState {
  serverId: string;
  codeVerifier: string;
  state: string;
  redirectUri: string;
  metadata: OAuthAuthServerMetadata;
  clientId: string;
  serverUrl: string;
  serverName: string;
}

const SESSION_KEY_PREFIX = 'mcp-oauth-pending:';
const CLIENT_NAME = 'Lisse';
const CLIENT_URI = 'https://github.com/GingerySweetie/Lisse';

/* ------------------------------------------------------------------ *
 * Discovery
 * ------------------------------------------------------------------ */

/** Walk RFC 9470 → RFC 8414 to find the auth server for an MCP endpoint.
 *  Falls back to guessing the auth server metadata at the MCP host root
 *  when the protected-resource doc is absent (some servers skip it). */
export async function discoverOAuthMetadata(
  mcpServerUrl: string,
): Promise<OAuthAuthServerMetadata> {
  const mcp = new URL(mcpServerUrl);
  let authServerUrl: string | null = null;

  try {
    const prm = await fetchJson<ProtectedResourceMetadata>(
      new URL('/.well-known/oauth-protected-resource', mcp).toString(),
    );
    if (Array.isArray(prm.authorization_servers) && prm.authorization_servers[0]) {
      authServerUrl = prm.authorization_servers[0];
    }
  } catch {
    // fall through — try the MCP host directly
  }

  const candidates: string[] = [];
  if (authServerUrl) {
    candidates.push(
      new URL('/.well-known/oauth-authorization-server', authServerUrl).toString(),
    );
  }
  candidates.push(
    new URL('/.well-known/oauth-authorization-server', mcp).toString(),
    new URL('/.well-known/openid-configuration', mcp).toString(),
  );

  let lastErr: unknown = null;
  for (const url of candidates) {
    try {
      const md = await fetchJson<OAuthAuthServerMetadata>(url);
      if (md.authorization_endpoint && md.token_endpoint) {
        return md;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `无法发现 OAuth 元数据（试了 ${candidates.length} 个地址）：${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}

/* ------------------------------------------------------------------ *
 * Dynamic client registration
 * ------------------------------------------------------------------ */

export async function registerClient(
  metadata: OAuthAuthServerMetadata,
  redirectUri: string,
): Promise<RegistrationResponse> {
  if (!metadata.registration_endpoint) {
    throw new Error(
      '该 OAuth 服务器不支持动态客户端注册（缺 registration_endpoint）。' +
        '目前无法在浏览器里手动配置 client_id — 请换支持 DCR 的服务器（如 Notion）。',
    );
  }
  const body = {
    client_name: CLIENT_NAME,
    client_uri: CLIENT_URI,
    redirect_uris: [redirectUri],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'web',
  };
  const res = await fetch(metadata.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `客户端注册失败 HTTP ${res.status}: ${await safeText(res)}`,
    );
  }
  return (await res.json()) as RegistrationResponse;
}

/* ------------------------------------------------------------------ *
 * PKCE
 * ------------------------------------------------------------------ */

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

export function generateState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/* ------------------------------------------------------------------ *
 * Authorization flow entrypoint
 * ------------------------------------------------------------------ */

export function getRedirectUri(): string {
  return `${window.location.origin}/mcp/callback`;
}

/**
 * Kick off an OAuth authorization for the given (already-persisted) server.
 * On success this navigates the current tab to the authorization endpoint;
 * the caller doesn't return.
 */
export async function beginAuthorization(server: McpServer): Promise<void> {
  const redirectUri = getRedirectUri();
  const metadata = await discoverOAuthMetadata(server.url);

  // Reuse an existing dynamic-client registration when we have one — some
  // authorization servers rate-limit DCR aggressively.
  let clientId = server.oauth?.clientId;
  if (!clientId) {
    const reg = await registerClient(metadata, redirectUri);
    clientId = reg.client_id;
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();

  const pending: PendingAuthState = {
    serverId: server.id,
    codeVerifier,
    state,
    redirectUri,
    metadata,
    clientId,
    serverUrl: server.url,
    serverName: server.name,
  };
  sessionStorage.setItem(SESSION_KEY_PREFIX + state, JSON.stringify(pending));

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  const scopes = metadata.scopes_supported;
  if (Array.isArray(scopes) && scopes.length > 0) {
    params.set('scope', scopes.join(' '));
  }

  window.location.href = `${metadata.authorization_endpoint}?${params.toString()}`;
}

/* ------------------------------------------------------------------ *
 * Callback handling
 * ------------------------------------------------------------------ */

export interface CallbackResult {
  serverId: string;
  serverName: string;
}

/** Consume the `?code&state` on /mcp/callback, exchange the code for tokens,
 *  and persist them onto the matching McpServer row. */
export async function completeAuthorization(
  searchParams: URLSearchParams,
): Promise<CallbackResult> {
  const err = searchParams.get('error');
  if (err) {
    const desc = searchParams.get('error_description') ?? '';
    throw new Error(`授权被拒绝：${err}${desc ? ' — ' + desc : ''}`);
  }
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  if (!code || !state) throw new Error('回调缺少 code 或 state 参数');

  const raw = sessionStorage.getItem(SESSION_KEY_PREFIX + state);
  if (!raw) {
    throw new Error(
      '找不到匹配的授权状态（可能已过期、被清掉、或是从别的会话跳过来的）。请重新点授权。',
    );
  }
  const pending = JSON.parse(raw) as PendingAuthState;
  sessionStorage.removeItem(SESSION_KEY_PREFIX + state);

  if (pending.state !== state) throw new Error('state 不匹配');

  const tokens = await exchangeCode(
    pending.metadata,
    pending.clientId,
    code,
    pending.codeVerifier,
    pending.redirectUri,
  );

  const now = Date.now();
  const oauth: McpOAuth = {
    issuer: pending.metadata.issuer ?? new URL(pending.serverUrl).origin,
    authorizationEndpoint: pending.metadata.authorization_endpoint,
    tokenEndpoint: pending.metadata.token_endpoint,
    registrationEndpoint: pending.metadata.registration_endpoint,
    clientId: pending.clientId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expires_in ? now + tokens.expires_in * 1000 : undefined,
    scope: tokens.scope,
    connectedAt: now,
  };

  await db.mcpServers.update(pending.serverId, {
    oauth,
    updatedAt: now,
    // Clear stale tool cache — the new identity might have different perms.
    cachedTools: undefined,
    cachedAt: undefined,
  });

  return { serverId: pending.serverId, serverName: pending.serverName };
}

/* ------------------------------------------------------------------ *
 * Token endpoint calls
 * ------------------------------------------------------------------ */

async function exchangeCode(
  metadata: OAuthAuthServerMetadata,
  clientId: string,
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });
  const res = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(
      `换 token 失败 HTTP ${res.status}: ${await safeText(res)}`,
    );
  }
  return (await res.json()) as TokenResponse;
}

/** Use a refresh token to mint a new access token. Throws on invalid_grant
 *  so callers can prompt re-authorization. */
export async function refreshTokens(server: McpServer): Promise<McpOAuth> {
  const o = server.oauth;
  if (!o?.refreshToken) throw new Error('缺 refresh_token，需要重新授权');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: o.refreshToken,
    client_id: o.clientId,
  });
  const res = await fetch(o.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await safeText(res);
    let parsed: { error?: string } | null = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // not JSON
    }
    if (parsed?.error === 'invalid_grant') {
      throw new Error('REAUTH_REQUIRED');
    }
    throw new Error(`刷新 token 失败 HTTP ${res.status}: ${text}`);
  }
  const tokens = (await res.json()) as TokenResponse;
  const now = Date.now();
  const next: McpOAuth = {
    ...o,
    accessToken: tokens.access_token,
    // Providers rotate refresh tokens — always take the new one when given.
    refreshToken: tokens.refresh_token ?? o.refreshToken,
    expiresAt: tokens.expires_in ? now + tokens.expires_in * 1000 : undefined,
    scope: tokens.scope ?? o.scope,
    connectedAt: now,
  };
  await db.mcpServers.update(server.id, { oauth: next, updatedAt: now });
  return next;
}

/** Return a valid access token, refreshing if needed. Returns null when
 *  the server has no OAuth configured. Throws REAUTH_REQUIRED if refresh
 *  fails and the user needs to re-authorize. */
export async function getValidAccessToken(
  server: McpServer,
): Promise<string | null> {
  const o = server.oauth;
  if (!o) return null;
  const skewMs = 60_000;
  if (o.accessToken && (!o.expiresAt || o.expiresAt - Date.now() > skewMs)) {
    return o.accessToken;
  }
  if (!o.refreshToken) throw new Error('REAUTH_REQUIRED');
  const next = await refreshTokens(server);
  return next.accessToken ?? null;
}

/** Remove OAuth credentials from a server (does not revoke server-side). */
export async function disconnectOAuth(serverId: string): Promise<void> {
  await db.mcpServers.update(serverId, {
    oauth: undefined,
    updatedAt: Date.now(),
    cachedTools: undefined,
    cachedAt: undefined,
  });
}

/* ------------------------------------------------------------------ *
 * Internals
 * ------------------------------------------------------------------ */

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return (await res.json()) as T;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
