import type { Attachment, Endpoint, Role } from '../types';

export interface ChatTurn {
  role: Role | 'tool';
  content: string;
  /** Optional images/files attached to this turn (user role typical). */
  attachments?: Attachment[];
  /** Tool calls emitted by the assistant on this turn (assistant role). */
  toolCalls?: ToolCallTurn[];
  /** When role='tool', the id of the assistant tool_call this is the
   *  result for. Required for the API to thread call→result correctly. */
  toolCallId?: string;
}

/** A tool call as emitted in a previously-completed assistant turn (used
 *  to reconstruct continuation requests). `input` is the parsed JSON
 *  object the model produced. */
export interface ToolCallTurn {
  id: string;
  name: string;
  input: unknown;
}

/** Definition of a tool that the model can call. Format-agnostic — the
 *  api/{openai,anthropic} adapters translate to each provider's shape. */
export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema for the function parameters. */
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  endpoint: Endpoint;
  model: string;
  messages: ChatTurn[];
  /** abort controller signal; caller drives cancellation. */
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  /** Enable extended thinking (Anthropic). Caller must check model support.
   *  On Opus/Sonnet 4.6+, `effort` drives adaptive thinking; `budgetTokens`
   *  is only used for older manual-thinking models. */
  thinking?: {
    enabled: boolean;
    budgetTokens?: number;
    effort?: 'low' | 'medium' | 'high' | 'max';
  };
  /** Tools available to the model. If non-empty, the request includes them
   *  and the stream may yield tool_call_* events. */
  tools?: ToolDef[];
}

export type StopReason =
  | 'end'
  | 'tool_use'
  | 'max_tokens'
  | 'stop_sequence'
  | 'unknown';

export interface ChatStreamEvent {
  type:
    | 'delta'
    | 'thinking_delta'
    | 'tool_call_start'
    | 'tool_call_args_delta'
    | 'tool_call_end'
    | 'done'
    | 'error';
  /** delta text chunk for `type: 'delta'`. */
  delta?: string;
  /** thinking text chunk for `type: 'thinking_delta'`. */
  thinkingDelta?: string;
  /** For tool_call_start: tells caller a new tool call began. */
  toolCallStart?: { id: string; name: string };
  /** For tool_call_args_delta: partial JSON args chunk. */
  toolCallArgsDelta?: { id: string; chunk: string };
  /** For tool_call_end: the call's input args are complete. */
  toolCallEnd?: { id: string };
  /** populated on `type: 'done'`. */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
  };
  /** populated on `type: 'done'`. */
  stopReason?: StopReason;
  errorMessage?: string;
}
