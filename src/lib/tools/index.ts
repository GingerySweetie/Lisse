import type { ToolDef } from '../../api/types';
import type { Persona } from '../../types';
import { memoryTools } from './memory';
import { musicTools } from './music';
import { documentTools } from './documents';
import { toyTools } from './toy';
import { mcpTools } from '../mcp/tools';

/**
 * Tool registry. Each Tool pairs an API-level definition (name +
 * JSON schema, sent to the model) with a local handler (called when
 * the model emits a tool_use). Adapters in src/api/{openai,anthropic}
 * translate the ToolDef shape to each provider's format.
 *
 * Built-ins: memory (remember / recall / update_memory / forget_memory),
 *            music (play / search / history),
 *            documents (parse_document),
 *            toy (control_toy — when 玩具 is started in chat settings).
 * External:  MCP servers registered on /mcp page (streamable HTTP).
 */

export interface ToolContext {
  persona?: Persona;
  conversationId: string;
}

export interface Tool {
  def: ToolDef;
  /** Implementation invoked with the parsed input. Return value is
   *  serialized to JSON and sent back to the model as the tool result. */
  handler: (input: unknown, ctx: ToolContext) => Promise<unknown>;
}

/** Return the full set of tools available to the model in the given
 *  context. Tools requiring missing prerequisites (e.g. memory tools
 *  need an embedding endpoint configured) are filtered out. */
export async function availableTools(ctx: ToolContext): Promise<Tool[]> {
  const out: Tool[] = [];
  for (const t of await memoryTools(ctx)) out.push(t);
  for (const t of await musicTools(ctx)) out.push(t);
  for (const t of await documentTools(ctx)) out.push(t);
  for (const t of await toyTools(ctx)) out.push(t);
  for (const t of await mcpTools(ctx)) out.push(t);
  return out;
}

export function toolDefs(tools: Tool[]): ToolDef[] {
  return tools.map((t) => t.def);
}

export function findTool(tools: Tool[], name: string): Tool | undefined {
  return tools.find((t) => t.def.name === name);
}
