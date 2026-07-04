import type { Attachment } from '../types';
import type { ChatRequest, ChatStreamEvent, ChatTurn, StopReason } from './types';
import { parseSSE } from './sse';

type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

// ─── Cache-control helpers (shared with anthropic.ts logic) ──────────

function getCacheControl(endpoint: { cacheLongTTL?: boolean }) {
  return endpoint.cacheLongTTL === true
    ? { type: 'ephemeral' as const, ttl: '1h' as const }
    : { type: 'ephemeral' as const };
}

/** Endpoints that returned 4xx when we sent cache_control; skip next time. */
const noCacheControlEndpoints = new Set<string>();

function ensureBlockArray(content: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(content)) return content as Array<Record<string, unknown>>;
  if (typeof content === 'string') return content ? [{ type: 'text', text: content }] : [];
  return [];
}

function buildOpenAIContent(
  text: string,
  attachments: Attachment[] | undefined,
): string | OpenAIContentPart[] {
  // Plain text path: keep the simple shape so old endpoints don't choke.
  if (!attachments || attachments.length === 0) return text;
  const parts: OpenAIContentPart[] = [];
  if (text) parts.push({ type: 'text', text });
  for (const a of attachments) {
    if (a.kind !== 'image') continue;
    parts.push({
      type: 'image_url',
      image_url: { url: `data:${a.mimeType};base64,${a.data}` },
    });
  }
  // If only non-image attachments existed and there's no text, send a placeholder.
  if (parts.length === 0) return text;
  return parts;
}

function buildOpenAIMessage(m: ChatTurn): Record<string, unknown> {
  if (m.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: m.toolCallId,
      content: m.content,
    };
  }
  if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
    return {
      role: 'assistant',
      content: m.content || null,
      tool_calls: m.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.input ?? {}),
        },
      })),
    };
  }
  return {
    role: m.role,
    content: buildOpenAIContent(m.content, m.attachments),
  };
}

function mapOpenAIStopReason(reason: string | null | undefined): StopReason {
  switch (reason) {
    case 'stop':
      return 'end';
    case 'tool_calls':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    default:
      return reason ? 'unknown' : 'end';
  }
}

export async function* streamOpenAI(
  req: ChatRequest,
): AsyncGenerator<ChatStreamEvent, void, void> {
  const url = joinUrl(req.endpoint.baseUrl, '/chat/completions');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (req.endpoint.authStyle === 'x-api-key') {
    headers['x-api-key'] = req.endpoint.apiKey;
  } else {
    headers.Authorization = `Bearer ${req.endpoint.apiKey}`;
  }

  const endpointKey = req.endpoint.baseUrl;
  const cachingSupported = !noCacheControlEndpoints.has(endpointKey);
  const cacheControl = getCacheControl(req.endpoint);

  const systemMessages = req.messages.filter((m) => m.role === 'system');
  const otherMessages = req.messages.filter((m) => m.role !== 'system');

  const oaiMessages: Record<string, unknown>[] = [];

  // System: merge into one (OAI spec only supports a single system message),
  // convert to content-block array so we can attach cache_control.
  if (systemMessages.length > 0) {
    const mergedText = systemMessages
      .map((m) => m.content)
      .filter(Boolean)
      .join('\n\n');
    oaiMessages.push({
      role: 'system',
      content:
        cachingSupported && mergedText
          ? [{ type: 'text', text: mergedText, cache_control: cacheControl }]
          : mergedText,
    });
  }

  const mapped = otherMessages.map(buildOpenAIMessage);

  // Rolling breakpoint (BP4): tag the second-to-last USER message.
  // In a normal conversation mapped looks like [..., user_prev, assistant, user_current]
  // so mapped[-2] is the assistant turn — we must scan backwards for the second user.
  if (cachingSupported) {
    let userCount = 0;
    for (let i = mapped.length - 1; i >= 0; i--) {
      if (mapped[i].role !== 'user') continue;
      userCount++;
      if (userCount < 2) continue;
      const target = mapped[i];
      const blocks = ensureBlockArray(target.content);
      if (blocks.length > 0) {
        blocks[blocks.length - 1] = {
          ...blocks[blocks.length - 1],
          cache_control: cacheControl,
        };
        target.content = blocks;
      }
      break;
    }
  }

  oaiMessages.push(...mapped);

  const body: Record<string, unknown> = {
    model: req.model,
    messages: oaiMessages,
    stream: true,
    stream_options: { include_usage: true },
    ...(req.temperature !== undefined && { temperature: req.temperature }),
    ...(req.maxTokens !== undefined && { max_tokens: req.maxTokens }),
  };
  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
    body.tool_choice = 'auto';
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: req.signal,
    });
  } catch (err) {
    yield {
      type: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
    };
    return;
  }

  // 4xx auto-degrade: if we sent cache_control and got 4xx, the endpoint
  // likely doesn't accept unknown fields. Retry without cache_control and
  // remember this endpoint so we skip it next time.
  if (!response.ok && response.status >= 400 && response.status < 500 && cachingSupported) {
    noCacheControlEndpoints.add(endpointKey);
    console.warn(
      `⚠️ ${endpointKey} returned ${response.status} with cache_control — ` +
        `auto-degraded: this endpoint will skip cache hints from now on.`,
    );
    yield* streamOpenAI(req); // recursive retry (cachingSupported will be false now)
    return;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    yield {
      type: 'error',
      errorMessage: `${response.status} ${response.statusText}${text ? `: ${truncate(text, 500)}` : ''}`,
    };
    return;
  }

  let usage: ChatStreamEvent['usage'];
  let stopReason: StopReason = 'end';
  // tool_calls arrive across many SSE chunks, keyed by `index`. We track
  // the id+name from the first chunk that introduces each index, then
  // accumulate the `arguments` string into the buffer for later JSON parse.
  const toolByIndex: Record<number, { id: string; emittedEnd: boolean }> = {};

  try {
    for await (const data of parseSSE(response)) {
      if (data === '[DONE]') break;
      let evt: OpenAIStreamChunk;
      try {
        evt = JSON.parse(data);
      } catch {
        continue;
      }
      const choice = evt.choices?.[0];
      const reasoning =
        choice?.delta?.reasoning_content ?? choice?.delta?.reasoning;
      if (typeof reasoning === 'string' && reasoning.length > 0) {
        yield { type: 'thinking_delta', thinkingDelta: reasoning };
      }
      const delta = choice?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) {
        yield { type: 'delta', delta };
      }
      const tcs = choice?.delta?.tool_calls;
      if (Array.isArray(tcs)) {
        for (const tc of tcs) {
          const idx = tc.index ?? 0;
          if (!toolByIndex[idx]) {
            // The first chunk for this index supplies id + function.name.
            const id = tc.id ?? `tc_${idx}`;
            const name = tc.function?.name ?? '';
            toolByIndex[idx] = { id, emittedEnd: false };
            yield { type: 'tool_call_start', toolCallStart: { id, name } };
          }
          const args = tc.function?.arguments;
          if (typeof args === 'string' && args.length > 0) {
            yield {
              type: 'tool_call_args_delta',
              toolCallArgsDelta: { id: toolByIndex[idx].id, chunk: args },
            };
          }
        }
      }
      if (choice?.finish_reason) {
        stopReason = mapOpenAIStopReason(choice.finish_reason);
        // OpenAI doesn't ship a per-tool "end" event — finish_reason
        // arrives once all tool_calls in this turn are complete. Emit
        // tool_call_end for each so callers can treat both providers
        // uniformly.
        for (const idx of Object.keys(toolByIndex)) {
          const t = toolByIndex[Number(idx)];
          if (!t.emittedEnd) {
            t.emittedEnd = true;
            yield { type: 'tool_call_end', toolCallEnd: { id: t.id } };
          }
        }
      }
      if (evt.usage) {
        usage = {
          inputTokens: evt.usage.prompt_tokens,
          outputTokens: evt.usage.completion_tokens,
          cacheReadTokens: evt.usage.prompt_tokens_details?.cached_tokens,
        };
      }
    }
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      yield { type: 'done', usage, stopReason };
      return;
    }
    yield {
      type: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
    };
    return;
  }

  yield { type: 'done', usage, stopReason };
}

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning_content?: string;
      reasoning?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.replace(/^\/+/, '');
  return `${b}/${p}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
