import type { Endpoint, Role } from '../types';

export interface ChatTurn {
  role: Role;
  content: string;
}

export interface ChatRequest {
  endpoint: Endpoint;
  model: string;
  messages: ChatTurn[];
  /** abort controller signal; caller drives cancellation. */
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatStreamEvent {
  type: 'delta' | 'done' | 'error';
  /** delta text chunk for `type: 'delta'`. */
  delta?: string;
  /** populated on `type: 'done'`. */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
  };
  errorMessage?: string;
}
