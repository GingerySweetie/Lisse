import type { Attachment } from '../types';
import type {
  ChatRequest,
  ChatStreamEvent,
  ChatTurn,
  StopReason,
} from './types';
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
    }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: unknown;
    }
  | {
      type: 'tool_result';
      tool_use_id: string;
      content: string;
    };

function mapAnthropicStopReason(reason: string | null | undefined): StopReason {
  switch (reason) {
    case 'end_turn':
      return 'end';
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    case 'stop_sequence':
      return 'stop_sequence';
    default:
      return reason ? 'unknown' : 'end';
  }
}

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
  // Default 5-minute TTL; '1h' costs 2x to write but lives an hour — good
  // for chats with long human pauses (away from keyboard / on a shift).
  const cacheControl = req.endpoint.cacheLongTTL
    ? { type: 'ephemeral' as const, ttl: '1h' as const }
    : { type: 'ephemeral' as const };

  const systemText = req.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const system = systemText
    ? [
        {
          type: 'text',
          text: systemText,
          cache_control: cacheControl,
        },
      ]
    : undefined;

  // Collapse our flat ChatTurn list into Anthropic messages. Runs of
  // consecutive `tool` turns following an assistant's tool_use become a
  // single user message containing N tool_result content blocks.
  const messages = buildAnthropicMessages(
    req.messages.filter((m) => m.role !== 'system'),
  );
  if (messages.length >= 2) {
    const target = messages[messages.length - 2];
    const last = target.content[target.content.length - 1] as Record<string, unknown>;
    if (last) last.cache_control = cacheControl;
  }

  // Extended thinking: when enabled, thinking deltas come in their own block
  // type and the model has a separate budget. Temperature must be 1 (or unset)
  // to use thinking, so we omit it.
  const thinkingEnabled = req.thinking?.enabled === true;
  const thinkingBudget = Math.max(1024, req.thinking?.budgetTokens ?? 6000);
  const maxTokens = Math.max(
    req.maxTokens ?? 4096,
    thinkingEnabled ? thinkingBudget + 1024 : 0,
  );

  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: maxTokens,
    stream: true,
    ...(system && { system }),
    messages,
    ...(thinkingEnabled
      ? { thinking: { type: 'enabled', budget_tokens: thinkingBudget } }
      : req.temperature !== undefined && { temperature: req.temperature }),
  };
  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
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

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    yield {
      type: 'error',
      errorMessage: `${response.status} ${response.statusText}${text ? `: ${truncate(text, 500)}` : ''}`,
    };
    return;
  }

  const usage: ChatStreamEvent['usage'] = {};
  let stopReason: StopReason = 'end';
  // Anthropic content blocks are indexed; tool_use blocks span
  // multiple deltas. Track which active blocks are tool_use so we can
  // route input_json_delta to the right id.
  const blockToolId: Record<number, string> = {};

  try {
    for await (const data of parseSSE(response)) {
      let evt: AnthropicStreamEvent;
      try {
        evt = JSON.parse(data);
      } catch {
        continue;
      }
      switch (evt.type) {
        case 'content_block_start': {
          const cb = evt.content_block;
          if (cb?.type === 'tool_use' && typeof cb.id === 'string') {
            const idx = evt.index ?? -1;
            blockToolId[idx] = cb.id;
            yield {
              type: 'tool_call_start',
              toolCallStart: { id: cb.id, name: cb.name ?? '' },
            };
          }
          break;
        }
        case 'content_block_delta': {
          const dt = evt.delta?.type;
          if (dt === 'thinking_delta' && typeof evt.delta?.thinking === 'string') {
            yield { type: 'thinking_delta', thinkingDelta: evt.delta.thinking };
          } else if (dt === 'input_json_delta' && typeof evt.delta?.partial_json === 'string') {
            const idx = evt.index ?? -1;
            const id = blockToolId[idx];
            if (id) {
              yield {
                type: 'tool_call_args_delta',
                toolCallArgsDelta: { id, chunk: evt.delta.partial_json },
              };
            }
          } else {
            const text = evt.delta?.text;
            if (typeof text === 'string' && text.length > 0) {
              yield { type: 'delta', delta: text };
            }
          }
          break;
        }
        case 'content_block_stop': {
          const idx = evt.index ?? -1;
          const id = blockToolId[idx];
          if (id) {
            yield { type: 'tool_call_end', toolCallEnd: { id } };
            delete blockToolId[idx];
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
          if (evt.delta?.stop_reason) {
            stopReason = mapAnthropicStopReason(evt.delta.stop_reason);
          }
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

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicContentPart[];
}

function buildAnthropicMessages(turns: ChatTurn[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const t of turns) {
    if (t.role === 'tool') {
      const block: AnthropicContentPart = {
        type: 'tool_result',
        tool_use_id: t.toolCallId ?? '',
        content: t.content,
      };
      const prev = out[out.length - 1];
      // Collapse consecutive tool turns into one user message.
      if (
        prev &&
        prev.role === 'user' &&
        prev.content.every((p) => p.type === 'tool_result')
      ) {
        prev.content.push(block);
      } else {
        out.push({ role: 'user', content: [block] });
      }
      continue;
    }
    if (t.role === 'assistant') {
      const parts: AnthropicContentPart[] = [];
      if (t.content) parts.push({ type: 'text', text: t.content });
      if (t.toolCalls) {
        for (const tc of t.toolCalls) {
          parts.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.input ?? {},
          });
        }
      }
      if (parts.length === 0) parts.push({ type: 'text', text: '' });
      out.push({ role: 'assistant', content: parts });
      continue;
    }
    if (t.role === 'user') {
      out.push({
        role: 'user',
        content: buildAnthropicContent(t.content, t.attachments),
      });
    }
  }
  return out;
}

interface AnthropicStreamEvent {
  type: string;
  index?: number;
  content_block?: {
    type?: string;
    id?: string;
    name?: string;
  };
  delta?: {
    text?: string;
    type?: string;
    thinking?: string;
    partial_json?: string;
    stop_reason?: string;
  };
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
