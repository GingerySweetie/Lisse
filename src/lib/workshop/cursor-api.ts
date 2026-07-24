/**
 * 炼金工房 · Cursor Cloud Agents API 客户端
 *
 * 浏览器直连 https://api.cursor.com（localhost CORS 已放行）。
 * 部署到自定义域名 / Capacitor 时需走同源反代，默认 `/proxy/cursor`。
 * API Key 只存在 localStorage。
 */

export const CURSOR_API_KEY_LS = 'workshop_cursor_api_key';
export const CURSOR_API_BASE_LS = 'workshop_cursor_api_base';

const DIRECT_BASE = 'https://api.cursor.com';
const PROXY_BASE = '/proxy/cursor';

export class CursorApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'CursorApiError';
    this.status = status;
    this.code = code;
  }
}

export function getStoredCursorApiKey(): string {
  return localStorage.getItem(CURSOR_API_KEY_LS) ?? '';
}

export function setStoredCursorApiKey(key: string): void {
  if (key) localStorage.setItem(CURSOR_API_KEY_LS, key);
  else localStorage.removeItem(CURSOR_API_KEY_LS);
}

export function getStoredCursorApiBase(): string {
  return localStorage.getItem(CURSOR_API_BASE_LS) ?? '';
}

export function setStoredCursorApiBase(base: string): void {
  const trimmed = base.trim().replace(/\/$/, '');
  if (trimmed) localStorage.setItem(CURSOR_API_BASE_LS, trimmed);
  else localStorage.removeItem(CURSOR_API_BASE_LS);
}

/** True when the page is served from a loopback host (incl. Capacitor WebView). */
export function isLoopbackHost(hostname?: string): boolean {
  const h =
    hostname ??
    (typeof window !== 'undefined' ? window.location.hostname : '');
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

/**
 * Resolve API base: explicit override → localhost direct → same-origin proxy.
 *
 * - Dev / Capacitor (`localhost`): direct `https://api.cursor.com`
 *   (Capacitor needs CapacitorHttp enabled to bypass WebView CORS).
 * - Deployed hosts: `/proxy/cursor` (Vite dev proxy + CF Worker in prod).
 */
export function resolveCursorApiBase(override?: string): string {
  const explicit = (override ?? getStoredCursorApiBase()).trim().replace(/\/$/, '');
  if (explicit) return explicit;
  if (typeof window !== 'undefined' && isLoopbackHost()) {
    return DIRECT_BASE;
  }
  return PROXY_BASE;
}

export { DIRECT_BASE, PROXY_BASE };

export interface CursorMe {
  apiKeyName: string;
  createdAt: string;
  userId?: number;
  userEmail?: string;
  userFirstName?: string;
  userLastName?: string;
}

export interface CursorModelParamValue {
  value: string;
  displayName?: string;
}

export interface CursorModelParam {
  id: string;
  displayName?: string;
  values: CursorModelParamValue[];
}

export interface CursorModelVariant {
  params: Array<{ id: string; value: string }>;
  displayName: string;
  description?: string;
  isDefault?: boolean;
}

export interface CursorModel {
  id: string;
  displayName: string;
  description?: string;
  aliases?: string[];
  parameters?: CursorModelParam[];
  variants?: CursorModelVariant[];
}

export interface CursorAgent {
  id: string;
  name: string;
  status: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  latestRunId?: string;
  autoCreatePR?: boolean;
  workOnCurrentBranch?: boolean;
  repos?: Array<{ url: string; startingRef?: string; prUrl?: string }>;
  env?: { type: string; name?: string };
}

export interface CursorGitBranch {
  repoUrl: string;
  branch?: string;
  prUrl?: string;
}

export type CursorRunStatus =
  | 'CREATING'
  | 'RUNNING'
  | 'FINISHED'
  | 'ERROR'
  | 'CANCELLED'
  | 'EXPIRED'
  | string;

export interface CursorRun {
  id: string;
  agentId: string;
  status: CursorRunStatus;
  createdAt: string;
  updatedAt: string;
  durationMs?: number;
  result?: string;
  git?: { branches: CursorGitBranch[] };
}

export interface CursorTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
}

export interface CreateAgentInput {
  prompt: string;
  repoUrl: string;
  startingRef?: string;
  modelId?: string;
  modelParams?: Array<{ id: string; value: string }>;
  name?: string;
  autoCreatePR?: boolean;
  workOnCurrentBranch?: boolean;
  mode?: 'agent' | 'plan';
}

export type CursorStreamEvent =
  | { type: 'status'; runId: string; status: CursorRunStatus }
  | { type: 'assistant'; text: string }
  | { type: 'thinking'; text: string }
  | {
      type: 'tool_call';
      callId: string;
      name: string;
      status: 'running' | 'completed' | string;
      args?: unknown;
      result?: unknown;
    }
  | {
      type: 'result';
      runId: string;
      status: CursorRunStatus;
      text?: string;
      durationMs?: number;
      git?: { branches: CursorGitBranch[] };
    }
  | { type: 'error'; code?: string; message: string }
  | { type: 'done' }
  | { type: 'heartbeat' }
  | { type: 'unknown'; event: string; data: unknown };

function authHeader(apiKey: string): string {
  // Bearer is accepted by Cloud Agents API; avoid btoa for non-latin keys.
  return `Bearer ${apiKey}`;
}

async function cursorFetch(
  path: string,
  apiKey: string,
  options: RequestInit = {},
  baseUrl?: string,
): Promise<Response> {
  const base = resolveCursorApiBase(baseUrl);
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...options,
    credentials: 'omit',
    headers: {
      Authorization: authHeader(apiKey),
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  return res;
}

async function readError(res: Response): Promise<CursorApiError> {
  const body = await res.text().catch(() => '');
  let message = `${res.status} ${res.statusText}`;
  let code: string | undefined;
  try {
    const json = JSON.parse(body) as {
      message?: string;
      error?: string | { message?: string; code?: string };
      code?: string;
    };
    if (typeof json.message === 'string') message = json.message;
    else if (typeof json.error === 'string') message = json.error;
    else if (json.error && typeof json.error === 'object' && json.error.message) {
      message = json.error.message;
      code = json.error.code;
    }
    if (typeof json.code === 'string') code = json.code;
  } catch {
    if (body) message = `${message}: ${body.slice(0, 200)}`;
  }
  if (res.status === 0 || message.toLowerCase().includes('failed to fetch')) {
    message = corsHintMessage();
  }
  return new CursorApiError(message, res.status, code);
}

function corsHintMessage(): string {
  return (
    '无法连接 Cursor API（多半是 CORS）。请把下方 API Base 改成同源反代 /proxy/cursor' +
    '（部署站已内置 Worker 反代；本地 pnpm dev 也已内置）。' +
    '若在 Android App 内，请更新到开启 CapacitorHttp 的版本，或填你的站点反代完整地址。'
  );
}

async function cursorJson<T>(
  path: string,
  apiKey: string,
  options?: RequestInit,
  baseUrl?: string,
): Promise<T> {
  let res: Response;
  try {
    res = await cursorFetch(path, apiKey, options, baseUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes('failed to fetch') || msg.includes('NetworkError')) {
      throw new CursorApiError(corsHintMessage(), 0, 'network_error');
    }
    throw e;
  }
  if (!res.ok) throw await readError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    const looksLikeHtml = /^\s*</.test(text);
    throw new CursorApiError(
      looksLikeHtml
        ? '反代未生效：/proxy/cursor 返回了网页而不是 API。请确认已部署带 Worker 的版本，或把 API Base 改成可用的反代地址。'
        : `Cursor API 返回了非 JSON 响应：${text.slice(0, 160)}`,
      res.status,
      'invalid_json',
    );
  }
}

export async function verifyCursorApiKey(
  apiKey: string,
  baseUrl?: string,
): Promise<CursorMe> {
  return cursorJson<CursorMe>('/v1/me', apiKey, undefined, baseUrl);
}

export async function listCursorModels(
  apiKey: string,
  baseUrl?: string,
): Promise<CursorModel[]> {
  const data = await cursorJson<{ items: CursorModel[] }>(
    '/v1/models',
    apiKey,
    undefined,
    baseUrl,
  );
  return data.items ?? [];
}

export async function createCursorAgent(
  apiKey: string,
  input: CreateAgentInput,
  baseUrl?: string,
): Promise<{ agent: CursorAgent; run: CursorRun }> {
  const body: Record<string, unknown> = {
    prompt: { text: input.prompt },
    repos: [
      {
        url: input.repoUrl,
        ...(input.startingRef ? { startingRef: input.startingRef } : {}),
      },
    ],
  };
  if (input.modelId) {
    body.model = {
      id: input.modelId,
      ...(input.modelParams?.length ? { params: input.modelParams } : {}),
    };
  }
  if (input.name) body.name = input.name.slice(0, 100);
  if (input.autoCreatePR != null) body.autoCreatePR = input.autoCreatePR;
  if (input.workOnCurrentBranch != null) {
    body.workOnCurrentBranch = input.workOnCurrentBranch;
  }
  if (input.mode) body.mode = input.mode;

  return cursorJson<{ agent: CursorAgent; run: CursorRun }>(
    '/v1/agents',
    apiKey,
    { method: 'POST', body: JSON.stringify(body) },
    baseUrl,
  );
}

export async function getCursorAgent(
  apiKey: string,
  agentId: string,
  baseUrl?: string,
): Promise<CursorAgent> {
  return cursorJson<CursorAgent>(`/v1/agents/${agentId}`, apiKey, undefined, baseUrl);
}

export async function getCursorRun(
  apiKey: string,
  agentId: string,
  runId: string,
  baseUrl?: string,
): Promise<CursorRun> {
  return cursorJson<CursorRun>(
    `/v1/agents/${agentId}/runs/${runId}`,
    apiKey,
    undefined,
    baseUrl,
  );
}

export async function createCursorFollowUp(
  apiKey: string,
  agentId: string,
  prompt: string,
  opts?: { mode?: 'agent' | 'plan'; baseUrl?: string },
): Promise<{ run: CursorRun }> {
  const body: Record<string, unknown> = { prompt: { text: prompt } };
  if (opts?.mode) body.mode = opts.mode;
  return cursorJson<{ run: CursorRun }>(
    `/v1/agents/${agentId}/runs`,
    apiKey,
    { method: 'POST', body: JSON.stringify(body) },
    opts?.baseUrl,
  );
}

export async function cancelCursorRun(
  apiKey: string,
  agentId: string,
  runId: string,
  baseUrl?: string,
): Promise<void> {
  await cursorJson(`/v1/agents/${agentId}/runs/${runId}/cancel`, apiKey, {
    method: 'POST',
  }, baseUrl);
}

export async function getCursorAgentUsage(
  apiKey: string,
  agentId: string,
  runId?: string,
  baseUrl?: string,
): Promise<{ totalUsage: CursorTokenUsage; runs: Array<{ id: string; usage: CursorTokenUsage }> }> {
  const q = runId ? `?runId=${encodeURIComponent(runId)}` : '';
  return cursorJson(`/v1/agents/${agentId}/usage${q}`, apiKey, undefined, baseUrl);
}

export async function listCursorAgents(
  apiKey: string,
  opts?: { limit?: number; includeArchived?: boolean; baseUrl?: string },
): Promise<CursorAgent[]> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.includeArchived != null) {
    params.set('includeArchived', String(opts.includeArchived));
  }
  const q = params.toString() ? `?${params}` : '';
  const data = await cursorJson<{ items: CursorAgent[] }>(
    `/v1/agents${q}`,
    apiKey,
    undefined,
    opts?.baseUrl,
  );
  return data.items ?? [];
}

/** Normalize owner/repo or github URL → https://github.com/owner/repo */
export function toGithubRepoUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const m1 = raw.match(
    /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i,
  );
  if (m1) return `https://github.com/${m1[1]}/${m1[2].replace(/\.git$/i, '')}`;
  const m2 = raw.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (m2) return `https://github.com/${m2[1]}/${m2[2]}`;
  return null;
}

export function isTerminalRunStatus(status: string): boolean {
  return ['FINISHED', 'ERROR', 'CANCELLED', 'EXPIRED'].includes(status);
}

/**
 * Stream one run via SSE. Falls back gracefully if the stream endpoint
 * errors — callers should poll getCursorRun instead.
 */
export async function* streamCursorRun(
  apiKey: string,
  agentId: string,
  runId: string,
  opts?: { signal?: AbortSignal; baseUrl?: string },
): AsyncGenerator<CursorStreamEvent, void, void> {
  const base = resolveCursorApiBase(opts?.baseUrl);
  const url = `${base}/v1/agents/${agentId}/runs/${runId}/stream`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      signal: opts?.signal,
      headers: {
        Authorization: authHeader(apiKey),
        Accept: 'text/event-stream',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new CursorApiError(
      msg.toLowerCase().includes('failed to fetch')
        ? 'SSE 连接失败（CORS 或网络）。将改用轮询。'
        : msg,
      0,
      'stream_network_error',
    );
  }
  if (!res.ok) throw await readError(res);
  if (!res.body) throw new CursorApiError('No stream body', 0);

  for await (const frame of parseNamedSSE(res)) {
    yield mapStreamEvent(frame.event, frame.data);
  }
}

async function* parseNamedSSE(
  response: Response,
): AsyncGenerator<{ event: string; data: string; id?: string }, void, void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const frame = parseSseFrame(raw);
        if (frame) yield frame;
      }
    }
    if (buffer.trim()) {
      const frame = parseSseFrame(buffer);
      if (frame) yield frame;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseFrame(
  raw: string,
): { event: string; data: string; id?: string } | null {
  const lines = raw.split(/\r?\n/);
  let event = 'message';
  let id: string | undefined;
  const dataLines: string[] = [];
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('id:')) id = line.slice(3).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0 && event === 'message') return null;
  return { event, data: dataLines.join('\n'), id };
}

function mapStreamEvent(event: string, data: string): CursorStreamEvent {
  let parsed: Record<string, unknown> = {};
  if (data) {
    try {
      parsed = JSON.parse(data) as Record<string, unknown>;
    } catch {
      parsed = { text: data };
    }
  }

  switch (event) {
    case 'status':
      return {
        type: 'status',
        runId: String(parsed.runId ?? ''),
        status: String(parsed.status ?? '') as CursorRunStatus,
      };
    case 'assistant':
      return { type: 'assistant', text: String(parsed.text ?? '') };
    case 'thinking':
      return { type: 'thinking', text: String(parsed.text ?? '') };
    case 'tool_call':
      return {
        type: 'tool_call',
        callId: String(parsed.callId ?? ''),
        name: String(parsed.name ?? 'tool'),
        status: String(parsed.status ?? 'running'),
        args: parsed.args,
        result: parsed.result,
      };
    case 'result':
      return {
        type: 'result',
        runId: String(parsed.runId ?? ''),
        status: String(parsed.status ?? '') as CursorRunStatus,
        text: typeof parsed.text === 'string' ? parsed.text : undefined,
        durationMs:
          typeof parsed.durationMs === 'number' ? parsed.durationMs : undefined,
        git: parsed.git as CursorRun['git'],
      };
    case 'error':
      return {
        type: 'error',
        code: typeof parsed.code === 'string' ? parsed.code : undefined,
        message: String(parsed.message ?? 'stream error'),
      };
    case 'done':
      return { type: 'done' };
    case 'heartbeat':
      return { type: 'heartbeat' };
    default:
      return { type: 'unknown', event, data: parsed };
  }
}
