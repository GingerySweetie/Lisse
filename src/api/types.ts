import type { Attachment, Endpoint, Role } from '../types';

export interface ChatTurn {
  role: Role;
  content: string;
  /** Optional images/files attached to this turn (user role typical). */
  attachments?: Attachment[];
}

export interface ChatRequest {
  endpoint: Endpoint;
  model: string;
  messages: ChatTurn[];
  /** abort controller signal; caller drives cancellation. */
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  /** Enable extended thinking (Anthropic). Caller must check model support. */
  thinking?: { enabled: boolean; budgetTokens?: number };
}

export interface ChatStreamEvent {
  type: 'delta' | 'thinking_delta' | 'done' | 'error';
  /** delta text chunk for `type: 'delta'`. */
  delta?: string;
  /** thinking text chunk for `type: 'thinking_delta'`. */
  thinkingDelta?: string;
  /** populated on `type: 'done'`. */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
  };
  errorMessage?: string;
}
