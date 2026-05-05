import type { ChatRequest, ChatStreamEvent } from './types';
import { parseSSE } from './sse';

const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';

export async function* streamAnthropic(
  req: ChatRequest,
): AsyncGenerator<ChatStreamEvent, void, void> {
  const url = joinUrl(req.endpoint.baseUrl, '/messages');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': req.endpoint.anthropicVersion ?? DEFAULT_ANTHROPIC_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (req.endpoint.authStyle === 'bearer') {
    headers.Authorization = `Bearer ${req.endpoint.apiKey}`;
  } else {
    headers['x-api-key'] = req.endpoint.apiKey;
  }

  // Anthropic separates system from messages.
  const system = req.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const messages = req.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role,
      content: [{ type: 'text', text: m.content }],
    }));

  const body = {
    model: req.model,
    max_tokens: req.maxTokens ?? 4096,
    stream: true,
    ...(system && { system }),
    messages,
    ...(req.temperature !== undefined && { temperature: req.temperature }),
  };

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

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    yield {
      type: 'error',
      errorMessage: `${response.status} ${response.statusText}${text ? `: ${truncate(text, 500)}` : ''}`,
    };
    return;
  }

  const usage: ChatStreamEvent['usage'] = {};

  try {
    for await (const data of parseSSE(response)) {
      let evt: AnthropicStreamEvent;
      try {
        evt = JSON.parse(data);
      } catch {
        continue;
      }
      switch (evt.type) {
        case 'content_block_delta': {
          const text = evt.delta?.text;
          if (typeof text === 'string' && text.length > 0) {
            yield { type: 'delta', delta: text };
          }
          break;
        }
        case 'message_start': {
          const u = evt.message?.usage;
          if (u) {
            usage.inputTokens = u.input_tokens;
            usage.cacheCreationTokens = u.cache_creation_input_tokens;
            usage.cacheReadTokens = u.cache_read_input_tokens;
          }
          break;
        }
        case 'message_delta': {
          const u = evt.usage;
          if (u) usage.outputTokens = u.output_tokens;
          break;
        }
        case 'error': {
          yield {
            type: 'error',
            errorMessage: evt.error?.message ?? 'unknown anthropic error',
          };
          return;
        }
      }
    }
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      yield { type: 'done', usage };
      return;
    }
    yield {
      type: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
    };
    return;
  }

  yield { type: 'done', usage };
}

interface AnthropicStreamEvent {
  type: string;
  delta?: { text?: string; type?: string };
  message?: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  usage?: { output_tokens?: number };
  error?: { message?: string; type?: string };
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.replace(/^\/+/, '');
  return `${b}/${p}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
