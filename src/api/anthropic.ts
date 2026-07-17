import type { Attachment } from '../types';
import type {
  ChatRequest,
  ChatStreamEvent,
  ChatTurn,
  StopReason,
} from './types';
import { parseSSE } from './sse';

const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';

// Anthropic allows at most 4 cache_control breakpoints per request.
// Reserve 1 for messages rolling breakpoint (BP4), leaving 3 for system layers.
const MAX_SYSTEM_BREAKPOINTS = 3;

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

/**
 * Build system content blocks with layered cache_control breakpoints.
 *
 * Anthropic allows up to 4 breakpoints per request. We reserve 1 for the
 * messages rolling breakpoint (BP4), so at most 3 go to system layers.
 *
 * Expected ordering from chat.ts (most-stable → least-stable):
 *   [0] BP1: persona                     (almost never changes)
 *   [1] BP2: writing style               (stable per conversation)
 *   [2] BP3: pinned long-term memory     (changes only on pin/unpin)
 * Extra stable layers (e.g. group awareness) merge untagged after BP3 and
 * are still covered by the rolling message breakpoint.
 * Volatile content (memory recall, current time, health) + a fixed one-line
 * style nudge live inside the current user message — after every breakpoint.
 *
 * Each of the first 3 system messages gets its own cache_control.
 * Any extra messages (≥4th) are merged without a tag — same as before.
 */
function buildSystemBlocks(
  systemMessages: ChatTurn[],
  cacheControl: { type: 'ephemeral'; ttl?: '5m' | '1h' },
): Array<{
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' };
}> {
  if (systemMessages.length === 0) return [];

  const blocks: Array<{
    type: 'text';
    text: string;
    cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' };
  }> = [];

  const breakpointCount = Math.min(systemMessages.length, MAX_SYSTEM_BREAKPOINTS);

  for (let i = 0; i < breakpointCount; i++) {
    const content = systemMessages[i].content;
    if (!content) continue;
    blocks.push({ type: 'text', text: content, cache_control: cacheControl });
  }

  // Layers beyond the 3 breakpoints: merge into one untagged block (safety net).
  if (systemMessages.length > breakpointCount) {
    const rest = systemMessages
      .slice(breakpointCount)
      .map((m) => m.content)
      .filter(Boolean)
      .join('\n\n');
    if (rest) blocks.push({ type: 'text', text: rest });
  }

  return blocks;
}

/**
 * Attach the rolling cache_control breakpoint (BP4) to the LAST history
 * message — the message immediately before the final one.
 *
 * The final message is this turn's fresh input (volatile context + new user
 * text): tagging it would write a prefix that never matches again. But
 * EVERYTHING before it is immutable history, so the optimal boundary is the
 * very end of that history:
 *
 *   [..., user_prev, assistant_last, user_current]
 *                    ↑ BP4 here          ↑ never tagged
 *
 * Compared to tagging the second-to-last USER message, this pulls the whole
 * previous assistant reply (typically the largest per-turn item) into the
 * cache-read region — each turn reads one extra assistant reply from cache,
 * pushing long-conversation hit rates toward 98%+.
 *
 * Bonus: in tool loops, continuation rounds end with
 * [..., user_current, assistant_tool_use, user_tool_result] — the boundary
 * then lands on assistant_tool_use, so subsequent rounds within the same
 * turn re-read the (large) current context instead of re-paying for it.
 *
 * We skip empty text blocks (the API rejects cache_control on them) and walk
 * further back if an entire message has no taggable block.
 */
function attachRollingBreakpoint(
  messages: Array<{ role: string; content: unknown }>,
  cacheControl: { type: 'ephemeral'; ttl?: '5m' | '1h' },
) {
  for (let i = messages.length - 2; i >= 0; i--) {
    const target = messages[i];
    if (Array.isArray(target.content)) {
      for (let j = target.content.length - 1; j >= 0; j--) {
        const blk = target.content[j] as Record<string, unknown> | null;
        if (!blk || typeof blk !== 'object') continue;
        // cache_control is invalid on empty text blocks.
        if (blk.type === 'text' && !blk.text) continue;
        blk.cache_control = cacheControl;
        return;
      }
    } else if (typeof target.content === 'string' && target.content) {
      target.content = [
        { type: 'text', text: target.content as string, cache_control: cacheControl },
      ];
      return;
    }
    // No taggable block in this message — try the one before it.
  }
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

  // ─── Prompt Caching (BP1–BP4 strategy) ───────────────────────────
  // Aligned with NyraSeithhh/cache layout. The key insight:
  // Anthropic cache is prefix-matched byte-for-byte. Anything that can
  // change between turns MUST live after the cache breakpoints.
  //
  // BP1: persona (almost never changes) → cache_control
  // BP2: writing style (stable per conversation) → cache_control
  // BP3: pinned long-term memory (changes only on pin/unpin) → cache_control
  // BP4: rolling message cache on second-to-last user message
  // Volatile data (memory, time, health) + fixed style nudge ride inside
  // the CURRENT user message — after all breakpoints, never cached.
  //
  // Default 5-minute TTL (1.25× write, 0.1× read).
  // When cacheLongTTL is on: use 1h TTL (2× write, 0.1× read).
  // AIHubMix requires the anthropic-beta header for 1h TTL.
  const use1h = req.endpoint.cacheLongTTL === true;
  const cacheControl = use1h
    ? { type: 'ephemeral' as const, ttl: '1h' as const }
    : { type: 'ephemeral' as const };

  // AIHubMix 1h TTL requires this beta header (per their docs).
  if (use1h) {
    headers['anthropic-beta'] = 'extended-cache-ttl-2025-04-11';
  }

  // Build system blocks with layered cache_control (BP1–BP3).
  // chat.ts only sends STABLE layers as system turns (persona, group
  // awareness); first 3 each get their own cache_control breakpoint.
  const systemMsgs = req.messages.filter((m) => m.role === 'system');
  const system = buildSystemBlocks(systemMsgs, cacheControl);

  // Collapse our flat ChatTurn list into Anthropic messages. Runs of
  // consecutive `tool` turns following an assistant's tool_use become a
  // single user message containing N tool_result content blocks.
  const messages = buildAnthropicMessages(
    req.messages.filter((m) => m.role !== 'system'),
  );

  // BP4 — rolling breakpoint at the very end of history (the message just
  // before the current user input). Everything before this turn's fresh
  // input is immutable, so the cache boundary covers ALL history including
  // the previous assistant reply — the main driver of 96%+ hit rates.
  attachRollingBreakpoint(messages, cacheControl);

  // Extended thinking: when enabled, thinking deltas come in their own block
  // type and the model has a separate budget. Temperature must be 1 (or unset)
  // when thinking / adaptive-think models are in play — never send 0.7 etc.
  const thinkingEnabled = req.thinking?.enabled === true;
  const adaptiveThinkModel = /think/i.test(req.model);
  const thinkingBudget = Math.max(1024, req.thinking?.budgetTokens ?? 6000);
  const maxTokens = Math.max(
    req.maxTokens ?? 4096,
    thinkingEnabled ? thinkingBudget + 1024 : 0,
  );

  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: maxTokens,
    stream: true,
    ...(system.length > 0 && { system }),
    messages,
    // CRITICAL: Fixed user_id ensures sticky routing to same backend node.
    // Without this, AIHubMix load balancer distributes requests randomly:
    //   Turn 1: Node A creates cache → Turn 2: Node B has no cache → 0% hit.
    metadata: { user_id: 'lisse-stable-user' },
    ...(thinkingEnabled
      ? { thinking: { type: 'enabled', budget_tokens: thinkingBudget } }
      : !adaptiveThinkModel &&
        req.temperature !== undefined && { temperature: req.temperature }),
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
          if (
            dt === 'thinking_delta' &&
            typeof evt.delta?.thinking === 'string'
          ) {
            yield { type: 'thinking_delta', thinkingDelta: evt.delta.thinking };
          } else if (
            dt === 'input_json_delta' &&
            typeof evt.delta?.partial_json === 'string'
          ) {
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
            // Anthropic's input_tokens EXCLUDES cached tokens: the real prompt
            // size is input + cache_creation + cache_read. Normalize
            // inputTokens to the TOTAL so it matches OpenAI's prompt_tokens
            // semantics (which already includes cached_tokens) — downstream
            // consumers (UI, pricing, hit-rate) can then treat both providers
            // uniformly.
            const raw = u.input_tokens ?? 0;
            const cc = u.cache_creation_input_tokens ?? 0;
            const cr = u.cache_read_input_tokens ?? 0;
            usage.inputTokens = raw + cc + cr;
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

  // ─── Cache Hit-Rate Diagnostic Logging ─────────────────────────────
  // usage.inputTokens is already normalized to the TOTAL prompt size
  // (uncached + cache_creation + cache_read). Hit rate = read / total —
  // same definition as the tutorial's "47354/49310 = 96%".
  const creation = usage.cacheCreationTokens ?? 0;
  const read = usage.cacheReadTokens ?? 0;
  const total = usage.inputTokens ?? 0;
  const uncached = Math.max(0, total - creation - read);
  const cached = creation + read;
  const hitRate = total > 0 ? Math.round((read / total) * 100) : 0;
  const cachedPct = total > 0 ? Math.round((cached / total) * 100) : 0;

  // BP4 fires whenever there is at least one history message before the
  // current input (i.e. any request beyond the very first turn).
  const bp4Applied = messages.length >= 2;

  console.groupCollapsed(
    `💾 Cache | model=${req.model} | ${hitRate}% hit | ${cachedPct}% cached`,
  );
  console.log('total prompt tokens            =', total);
  console.log('uncached input_tokens          =', uncached);
  console.log('cache_read_input_tokens        =', read, read > 0 ? '✅ HIT' : '❌ MISS');
  console.log('cache_creation_input_tokens    =', creation, creation > 0 ? '(writing new cache)' : '');
  console.log('cache coverage                 =', `${cachedPct}%`, `(${cached} / ${total})`);
  console.log('hit rate                       =', `${hitRate}%`, `(${read} / ${total})`);
  console.log('TTL mode                       =', use1h ? '1h long TTL' : '5m default TTL');
  console.log('sticky user_id                 =', 'lisse-stable-user');
  console.log('system breakpoints (BP1–BP3)   =', system.filter((b) => b.cache_control).length);
  console.log('BP4 rolling breakpoint         =', bp4Applied ? `✅ applied (${messages.length} msgs, boundary at end of history)` : '⏭ skipped (first turn)');
  if (read === 0 && total > 1000) {
    console.warn(
      '⚠️  Cache never hit! Possible causes:\n' +
        '  1. Proxy (AIHubMix) does not support prompt caching\n' +
        '  2. Running old code — verify you deployed the latest build\n' +
        '  3. Persona/system prompt changed, invalidating BP1\n' +
        '  4. Tools order changes each request\n' +
        '  → Try with official Anthropic API key to isolate the issue.',
    );
  }
  console.groupEnd();

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
