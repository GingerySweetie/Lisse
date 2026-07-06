import { db } from '../../db';
import type { McpServer, McpToolDef } from '../../types';
import { getValidAccessToken, refreshTokens } from './oauth';

/**
 * Model Context Protocol client — Streamable HTTP transport.
 *
 * Modern MCP transport: single endpoint, POST JSON-RPC, response is either
 * application/json (one-shot) or text/event-stream (streamed) carrying
 * matching id messages.
 *
 * Auth priority:
 *   1. server.oauth (OAuth 2.1 + PKCE, refreshed on demand)
 *   2. server.authHeader (raw static bearer / integration token)
 *   3. no Authorization header
 *
 * A 401 with a valid refresh token triggers one automatic refresh + retry.
 *
 * The session caches:
 *   - Mcp-Session-Id header value once the server hands us one
 *   - the running JSON-RPC id counter
 *   - "initialized" flag so we only handshake once per session
 *
 * We don't keep persistent sessions across page navigations; each
 * availableTools() call constructs a fresh session keyed by server id.
 */

const PROTOCOL_VERSION = '2025-06-18';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

export class McpSession {
  public server: McpServer;
  private sessionId: string | null = null;
  private nextId = 1;
  private initialized = false;

  constructor(server: McpServer) {
    this.server = server;
  }

  private async authHeaderValue(): Promise<string | null> {
    if (this.server.oauth) {
      const token = await getValidAccessToken(this.server);
      return token ? `Bearer ${token}` : null;
    }
    return this.server.authHeader ?? null;
  }

  private async headers(): Promise<Record<string, string>> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': PROTOCOL_VERSION,
    };
    if (this.sessionId) h['Mcp-Session-Id'] = this.sessionId;
    const auth = await this.authHeaderValue();
    if (auth) h['Authorization'] = auth;
    return h;
  }

  private async rpc<T = unknown>(
    method: string,
    params?: unknown,
    signal?: AbortSignal,
    isRetry = false,
  ): Promise<T> {
    const id = this.nextId++;
    const body: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    const res = await fetch(this.server.url, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify(body),
      signal,
    });
    const newSession = res.headers.get('Mcp-Session-Id');
    if (newSession) this.sessionId = newSession;

    // OAuth token expired / revoked — try one refresh + retry.
    if (res.status === 401 && !isRetry && this.server.oauth?.refreshToken) {
      try {
        const updated = await refreshTokens(this.server);
        this.server = { ...this.server, oauth: updated };
        // Reset session state — server may have dropped it on 401.
        this.sessionId = null;
        this.initialized = false;
        return await this.rpc<T>(method, params, signal, true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'REAUTH_REQUIRED') {
          throw new Error(
            `MCP ${method}: 授权已失效，请在 MCP 设置里重新授权 "${this.server.name}"`,
          );
        }
        throw err;
      }
    }

    if (!res.ok) {
      throw new Error(
        `MCP ${method} HTTP ${res.status}: ${await safeText(res)}`,
      );
    }
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('text/event-stream') && res.body) {
      const reply = await readSseUntilId(res.body, id, signal);
      if (reply.error) {
        throw new Error(
          `MCP ${method} error: ${reply.error.message ?? JSON.stringify(reply.error)}`,
        );
      }
      return reply.result as T;
    }
    const json = (await res.json()) as JsonRpcResponse<T>;
    if (json.error) {
      throw new Error(
        `MCP ${method} error: ${json.error.message ?? JSON.stringify(json.error)}`,
      );
    }
    return json.result as T;
  }

  /** Fire a JSON-RPC notification (no id, no expected response). */
  private async notify(method: string, params?: unknown): Promise<void> {
    const body = { jsonrpc: '2.0' as const, method, params };
    await fetch(this.server.url, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify(body),
    });
  }

  async initialize(signal?: AbortSignal): Promise<void> {
    if (this.initialized) return;
    await this.rpc(
      'initialize',
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'lisse', version: '1.0' },
      },
      signal,
    );
    await this.notify('notifications/initialized');
    this.initialized = true;
  }

  async listTools(signal?: AbortSignal): Promise<McpToolDef[]> {
    await this.initialize(signal);
    const r = (await this.rpc('tools/list', undefined, signal)) as {
      tools?: McpToolDef[];
    };
    return r.tools ?? [];
  }

  async callTool(
    name: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<{ content: ContentBlock[]; isError?: boolean }> {
    await this.initialize(signal);
    return (await this.rpc(
      'tools/call',
      { name, arguments: input },
      signal,
    )) as { content: ContentBlock[]; isError?: boolean };
  }
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'resource'; resource: unknown };

/** Flatten the MCP content array to a simple JSON-friendly payload for
 *  feeding back to the LLM as a tool result. Text blocks join with \n;
 *  image and resource blocks are stringified to keep things JSON-safe. */
export function flattenContent(blocks: ContentBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === 'text') return b.text;
      if (b.type === 'image') return `[image ${b.mimeType}]`;
      return JSON.stringify(b);
    })
    .join('\n');
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

/** Parse SSE frames from a stream until one with `data: { id: <id>, ... }`
 *  arrives, then return it. Other notifications / pings are skipped.
 *  Handles both LF (\n\n) and CRLF (\r\n\r\n) event separators. */
async function readSseUntilId(
  body: ReadableStream<Uint8Array>,
  id: number,
  signal?: AbortSignal,
): Promise<JsonRpcResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      if (signal?.aborted) throw new Error('aborted');
      const { done, value } = await reader.read();
      if (done) throw new Error('MCP SSE stream ended before response');
      buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let sep: number;
      while ((sep = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const dataLine = frame
          .split('\n')
          .find((l) => l.startsWith('data:'));
        if (!dataLine) continue;
        const payload = dataLine.replace(/^data:\s?/, '');
        if (!payload) continue;
        let json: JsonRpcResponse;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        if (json.id === id) return json;
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

/** Singleton-per-server cache of live sessions so a single chat turn
 *  doesn't re-handshake for every tool call. Cleared by id when the
 *  server row is updated or deleted. */
const SESSION_CACHE = new Map<string, McpSession>();

export function getSession(server: McpServer): McpSession {
  const cached = SESSION_CACHE.get(server.id);
  if (
    cached &&
    cached.server.url === server.url &&
    cached.server.authHeader === server.authHeader &&
    cached.server.oauth?.accessToken === server.oauth?.accessToken &&
    cached.server.oauth?.clientId === server.oauth?.clientId
  ) {
    return cached;
  }
  const s = new McpSession(server);
  SESSION_CACHE.set(server.id, s);
  return s;
}

export function invalidateSession(serverId: string): void {
  SESSION_CACHE.delete(serverId);
}

/** Reload a server from DB and return a fresh session for it. Useful after
 *  the OAuth callback finishes writing new tokens. */
export async function reloadSession(serverId: string): Promise<McpSession | null> {
  const server = await db.mcpServers.get(serverId);
  if (!server) return null;
  invalidateSession(serverId);
  return getSession(server);
}
