import type { Attachment } from '../types';
import type { ChatRequest, ChatStreamEvent } from './types';
import { parseSSE } from './sse';

const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';

type AnthropicContentPart =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      source: { type: 'base64'; media_type: string; data: string };
    }
  | {
      type: 'document';
      source: { type: 'base64'; media_type: string; data: string };
    };

function buildAnthropicContent(
  text: string,
  attachments: Attachment[] | undefined,
): AnthropicContentPart[] {
  const parts: AnthropicContentPart[] = [];
  for (const a of attachments ?? []) {
    if (a.kind === 'image') {
      parts.push({
        type: 'image',
        source: { type: 'base64', media_type: a.mimeType, data: a.data },
      });
    } else if (a.kind === 'file' && a.mimeType === 'application/pdf') {
      parts.push({
        type: 'document',
        source: { type: 'base64', media_type: a.mimeType, data: a.data },
      });
    }
  }
  if (text) parts.push({ type: 'text', text });
  if (parts.length === 0) parts.push({ type: 'text', text: '' });
  return parts;
}

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

  // Anthropic separates system from messages. Use the array form so we can
  // attach cache_control breakpoints (90% discount on prefix re-use).
  const systemText = req.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const system = systemText
    ? [
        {
          type: 'text',
          text: systemText,
          // Cache the entire (often very long) persona+memory system prompt
          // so re-sends of the same conversation pay 10% per turn after the
          // first instead of full price.
          cache_control: { type: 'ephemeral' },
        },
      ]
    : undefined;

  const nonSystem = req.messages.filter((m) => m.role !== 'system');
  // Mark the second-to-last message with a cache breakpoint, so on the next
  // turn the prefix [system + everything-up-through-last-turn] is a cache
  // hit. We avoid marking the *very last* message because that would be the
  // brand-new user query — never cached, no benefit.
  const cacheIndex = nonSystem.length >= 2 ? nonSystem.length - 2 : -1;
  const messages = nonSystem.map((m, i) => {
    const content = buildAnthropicContent(m.content, m.attachments);
    if (i === cacheIndex && content.length > 0) {
      // Attach cache_control to the last block of this message.
      const last = content[content.length - 1] as Record<string, unknown>;
      last.cache_control = { type: 'ephemeral' };
    }
    return { role: m.role, content };
  });

  // Extended thinking: when enabled, thinking deltas come in their own block
  // type and the model has a separate budget. Temperature must be 1 (or unset)
  // to use thinking, so we omit it.
  const thinkingEnabled = req.thinking?.enabled === true;
  const thinkingBudget = Math.max(1024, req.thinking?.budgetTokens ?? 6000);
  const maxTokens = Math.max(
    req.maxTokens ?? 4096,
    thinkingEnabled ? thinkingBudget + 1024 : 0,
  );

  const body = {
    model: req.model,
    max_tokens: maxTokens,
    stream: true,
    ...(system && { system }),
    messages,
    ...(thinkingEnabled
      ? { thinking: { type: 'enabled', budget_tokens: thinkingBudget } }
      : req.temperature !== undefined && { temperature: req.temperature }),
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
          // text_delta vs thinking_delta — both arrive as content_block_delta.
          const dt = evt.delta?.type;
          if (dt === 'thinking_delta' && typeof evt.delta?.thinking === 'string') {
            yield { type: 'thinking_delta', thinkingDelta: evt.delta.thinking };
          } else {
            const text = evt.delta?.text;
            if (typeof text === 'string' && text.length > 0) {
              yield { type: 'delta', delta: text };
            }
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
  delta?: { text?: string; type?: string; thinking?: string };
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
