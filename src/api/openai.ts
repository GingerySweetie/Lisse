import type { ChatRequest, ChatStreamEvent } from './types';
import { parseSSE } from './sse';

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

  const body = {
    model: req.model,
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
    stream_options: { include_usage: true },
    ...(req.temperature !== undefined && { temperature: req.temperature }),
    ...(req.maxTokens !== undefined && { max_tokens: req.maxTokens }),
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

  let usage: ChatStreamEvent['usage'];

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
      const delta = choice?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) {
        yield { type: 'delta', delta };
      }
      if (evt.usage) {
        usage = {
          inputTokens: evt.usage.prompt_tokens,
          outputTokens: evt.usage.completion_tokens,
        };
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

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
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
