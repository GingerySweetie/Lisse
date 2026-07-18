import type { Endpoint } from '../types';

/** Soft guidance for adaptive thinking (Opus 4.6+ / Sonnet 4.6+). */
export type ThinkingEffort = 'low' | 'medium' | 'high' | 'max';

/** Options passed into streamChat / runToolLoop. */
export interface ThinkingOpts {
  enabled: boolean;
  /** Manual extended thinking budget (legacy Sonnet/Opus 4.5 and below). */
  budgetTokens?: number;
  /** Adaptive thinking effort (Opus 4.6+). Defaults to high when omitted. */
  effort?: ThinkingEffort;
}

/**
 * Models that support (or require) adaptive thinking instead of
 * `thinking.type: "enabled" + budget_tokens`.
 *
 * Matches Anthropic ids and common relay spellings (AIHubMix etc.).
 */
export function modelSupportsAdaptiveThinking(model: string): boolean {
  const m = model.toLowerCase();
  if (/claude-fable|claude-mythos/.test(m)) return true;
  if (/claude-sonnet-5\b/.test(m) || /sonnet[_-]?5\b/.test(m)) return true;
  // Opus/Sonnet 4.6 and newer (4.6, 4.7, 4.8, 4.10, …)
  if (/claude-opus-4-[6-9]/.test(m) || /claude-opus-4\.[6-9]/.test(m)) return true;
  if (/claude-sonnet-4-[6-9]/.test(m) || /claude-sonnet-4\.[6-9]/.test(m)) return true;
  if (/opus[_-]?4[._-]([6-9]|1[0-9])/.test(m)) return true;
  if (/sonnet[_-]?4[._-]([6-9]|1[0-9])/.test(m)) return true;
  return false;
}

/** Build streamChat thinking opts from an endpoint row. */
export function thinkingOptsFromEndpoint(
  endpoint: Endpoint,
): ThinkingOpts | undefined {
  if (endpoint.format !== 'anthropic' || !endpoint.thinkingEnabled) {
    return undefined;
  }
  return {
    enabled: true,
    budgetTokens: endpoint.thinkingBudget,
    effort: endpoint.thinkingEffort ?? 'high',
  };
}
