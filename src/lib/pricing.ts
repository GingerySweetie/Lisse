import type { Message } from '../types';

/**
 * Per-model USD pricing per 1M tokens, used for a rough running-cost
 * estimate per conversation. These are the official list prices for
 * the providers as of late 2025/early 2026 — not necessarily the
 * price your relay charges, but close enough to give a sense.
 *
 * Keys are matched as substrings (case-insensitive) so versioned model
 * names (e.g. 'gpt-4o-2024-11-20') resolve to the base 'gpt-4o' entry.
 */
interface ModelPrice {
  input: number;
  output: number;
  /** Cache-read price; falls back to input * 0.5 if unset. */
  cacheRead?: number;
}

const PRICING: Array<{ match: RegExp; price: ModelPrice }> = [
  // Anthropic — list prices per 1M tokens.
  { match: /claude-opus-4(?:[-.]\d)?/i, price: { input: 15, output: 75, cacheRead: 1.5 } },
  { match: /claude-sonnet-4(?:[-.]\d)?/i, price: { input: 3, output: 15, cacheRead: 0.3 } },
  { match: /claude-haiku-4(?:[-.]\d)?/i, price: { input: 0.8, output: 4, cacheRead: 0.08 } },
  { match: /claude-3-5-sonnet/i, price: { input: 3, output: 15, cacheRead: 0.3 } },
  { match: /claude-3-5-haiku/i, price: { input: 0.8, output: 4, cacheRead: 0.08 } },
  { match: /claude-3-opus/i, price: { input: 15, output: 75, cacheRead: 1.5 } },
  // OpenAI — auto-cached for prompts > 1024 tokens.
  { match: /^o3(-mini)?\b/i, price: { input: 1.1, output: 4.4, cacheRead: 0.55 } },
  { match: /^o3\b/i, price: { input: 60, output: 240, cacheRead: 30 } },
  { match: /^o1-mini\b/i, price: { input: 3, output: 12, cacheRead: 1.5 } },
  { match: /^o1\b/i, price: { input: 15, output: 60, cacheRead: 7.5 } },
  { match: /^gpt-4o-mini/i, price: { input: 0.15, output: 0.6, cacheRead: 0.075 } },
  { match: /^gpt-4o/i, price: { input: 2.5, output: 10, cacheRead: 1.25 } },
  { match: /^gpt-4-turbo/i, price: { input: 10, output: 30 } },
  { match: /^gpt-4\b/i, price: { input: 30, output: 60 } },
  { match: /^gpt-3\.5/i, price: { input: 0.5, output: 1.5 } },
  // DeepSeek
  { match: /deepseek-r1/i, price: { input: 0.55, output: 2.19 } },
  { match: /deepseek-v3/i, price: { input: 0.27, output: 1.1 } },
  // Qwen / Kimi / GLM — rough estimates from public prices.
  { match: /qwen-?qw?q/i, price: { input: 0.5, output: 1.5 } },
  { match: /kimi/i, price: { input: 0.3, output: 1 } },
  { match: /glm-?zero/i, price: { input: 0.5, output: 1.5 } },
  // Embeddings
  { match: /text-embedding-3-small/i, price: { input: 0.02, output: 0 } },
  { match: /text-embedding-3-large/i, price: { input: 0.13, output: 0 } },
  { match: /bge-m3/i, price: { input: 0.07, output: 0 } },
];

function lookupPrice(model: string | undefined): ModelPrice | undefined {
  if (!model) return undefined;
  for (const entry of PRICING) {
    if (entry.match.test(model)) return entry.price;
  }
  return undefined;
}

/**
 * Estimate the USD cost of a single assistant message based on its usage.
 * Returns 0 if model is unknown or usage is missing.
 */
export function estimateMessageCostUSD(message: Message): number {
  const u = message.usage;
  if (!u || !message.model) return 0;
  const p = lookupPrice(message.model);
  if (!p) return 0;
  const input = u.inputTokens ?? 0;
  const output = u.outputTokens ?? 0;
  const cacheRead = u.cacheReadTokens ?? 0;
  const cacheCreation = u.cacheCreationTokens ?? 0;
  // Standard input minus cached portion (which is billed at the cheaper rate)
  const billedInput = Math.max(0, input - cacheRead);
  const cacheReadPrice = p.cacheRead ?? p.input * 0.5;
  // Anthropic charges 1.25x input for cache writes (already counted in 'input')
  // so we don't double-bill. Cache writes are part of inputTokens by spec.
  void cacheCreation;
  return (
    (billedInput * p.input + cacheRead * cacheReadPrice + output * p.output) /
    1_000_000
  );
}

export function estimateConversationCostUSD(messages: Message[]): number {
  let total = 0;
  for (const m of messages) {
    if (m.role !== 'assistant') continue;
    total += estimateMessageCostUSD(m);
  }
  return total;
}

export function formatUSD(amount: number): string {
  if (amount === 0) return '$0';
  if (amount < 0.001) return '<$0.001';
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}
