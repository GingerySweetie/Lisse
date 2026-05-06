import type { Attachment } from '../types';
import type { ChatRequest, ChatStreamEvent } from './types';
import { parseSSE } from './sse';

type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

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
    messages: req.messages.map((m) => ({
      role: m.role,
      content: buildOpenAIContent(m.content, m.attachments),
    })),
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
      // Reasoning models on OpenAI-compat surfaces (DeepSeek R1, Kimi K1,
      // Qwen QwQ, GLM-Zero, AIHubMix-routed o1/o3, ...) emit reasoning
      // text in a separate field on the streaming delta. Field name
      // varies — `reasoning_content` is the de-facto standard, but some
      // providers use `reasoning`. Forward both as thinking deltas so
      // the UI shows them in the collapsible thinking block.
      const reasoning =
        choice?.delta?.reasoning_content ?? choice?.delta?.reasoning;
      if (typeof reasoning === 'string' && reasoning.length > 0) {
        yield { type: 'thinking_delta', thinkingDelta: reasoning };
      }
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
    delta?: {
      content?: string;
      /** DeepSeek R1 / Kimi / GLM-Zero / Qwen QwQ. */
      reasoning_content?: string;
      /** Some Anthropic-via-OpenAI shims and a few providers use this. */
      reasoning?: string;
    };
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
