import { streamChat, type ChatTurn } from '../../api';
import type { ChatStreamEvent, ToolDef } from '../../api/types';
import type { Endpoint, ToolCallRecord } from '../../types';
import { findTool, type Tool, type ToolContext } from './index';

export interface ToolLoopCallbacks {
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
  /** Fires when a tool call finishes (after args are parsed and handler ran). */
  onToolCallResolved?: (call: ToolCallRecord) => void;
}

export interface ToolLoopResult {
  text: string;
  thinking: string;
  toolCalls: ToolCallRecord[];
  usage?: ChatStreamEvent['usage'];
  errored: boolean;
  errorMessage?: string;
}

/**
 * Run a streaming chat with tool support. If the model emits tool_use,
 * execute the tools locally, append assistant{text+tool_use} + tool_result
 * to the continuation, and re-stream. Loops until stop_reason ≠ tool_use
 * or maxRounds.
 *
 * Caller-side persistence: this helper just streams + executes. Periodic
 * onToolCallResolved + onTextDelta callbacks let the caller persist
 * progress between rounds.
 */
export async function runToolLoop(args: {
  endpoint: Endpoint;
  model: string;
  initialTurns: ChatTurn[];
  tools: Tool[];
  ctx: ToolContext;
  signal?: AbortSignal;
  maxRounds?: number;
  thinking?: { enabled: boolean; budgetTokens?: number };
  maxTokens?: number;
  temperature?: number;
  callbacks?: ToolLoopCallbacks;
}): Promise<ToolLoopResult> {
  const {
    endpoint,
    model,
    initialTurns,
    tools,
    ctx,
    signal,
    maxRounds = 6,
    thinking,
    maxTokens,
    temperature,
    callbacks,
  } = args;

  const defs: ToolDef[] = tools.map((t) => t.def);
  const continuation: ChatTurn[] = [...initialTurns];
  let text = '';
  let thinkingAcc = '';
  let usage: ChatStreamEvent['usage'];
  let errored = false;
  let errorMessage: string | undefined;
  const toolCalls: ToolCallRecord[] = [];

  outer: for (let round = 0; round < maxRounds; round++) {
    let stopReason: string | undefined;
    let roundText = '';
    const active: Record<string, { name: string; argsBuf: string }> = {};
    const completed: { id: string; name: string; input: unknown }[] = [];

    try {
      for await (const evt of streamChat({
        endpoint,
        model,
        messages: continuation,
        signal,
        thinking,
        maxTokens,
        temperature,
        ...(defs.length > 0 && { tools: defs }),
      })) {
        if (evt.type === 'delta' && evt.delta) {
          text += evt.delta;
          roundText += evt.delta;
          callbacks?.onTextDelta?.(evt.delta);
        } else if (evt.type === 'thinking_delta' && evt.thinkingDelta) {
          thinkingAcc += evt.thinkingDelta;
          callbacks?.onThinkingDelta?.(evt.thinkingDelta);
        } else if (evt.type === 'tool_call_start' && evt.toolCallStart) {
          active[evt.toolCallStart.id] = {
            name: evt.toolCallStart.name,
            argsBuf: '',
          };
        } else if (evt.type === 'tool_call_args_delta' && evt.toolCallArgsDelta) {
          const a = active[evt.toolCallArgsDelta.id];
          if (a) a.argsBuf += evt.toolCallArgsDelta.chunk;
        } else if (evt.type === 'tool_call_end' && evt.toolCallEnd) {
          const a = active[evt.toolCallEnd.id];
          if (a) {
            let input: unknown = {};
            try {
              input = a.argsBuf ? JSON.parse(a.argsBuf) : {};
            } catch {
              input = { _rawArgs: a.argsBuf };
            }
            completed.push({ id: evt.toolCallEnd.id, name: a.name, input });
          }
        } else if (evt.type === 'error') {
          errored = true;
          errorMessage = evt.errorMessage;
          break outer;
        } else if (evt.type === 'done') {
          usage = evt.usage;
          stopReason = evt.stopReason;
        }
      }
    } catch (err) {
      errored = true;
      errorMessage = err instanceof Error ? err.message : String(err);
      break outer;
    }

    if (stopReason !== 'tool_use' || completed.length === 0) break;

    const toolResultTurns: ChatTurn[] = [];
    for (const call of completed) {
      const tool = findTool(tools, call.name);
      let result: unknown;
      let error: string | undefined;
      if (!tool) {
        error = `unknown tool: ${call.name}`;
      } else {
        try {
          result = await tool.handler(call.input, ctx);
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
      }
      const record: ToolCallRecord = {
        id: call.id,
        name: call.name,
        input: call.input,
        result,
        error,
      };
      toolCalls.push(record);
      callbacks?.onToolCallResolved?.(record);
      toolResultTurns.push({
        role: 'tool',
        toolCallId: call.id,
        content: JSON.stringify(error ? { error } : (result ?? null)),
      });
    }

    continuation.push({
      role: 'assistant',
      content: roundText,
      toolCalls: completed,
    });
    for (const tr of toolResultTurns) continuation.push(tr);
  }

  return { text, thinking: thinkingAcc, toolCalls, usage, errored, errorMessage };
}
