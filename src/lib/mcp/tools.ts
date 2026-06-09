import { db } from '../../db';
import type { McpServer } from '../../types';
import type { Tool, ToolContext } from '../tools';
import { flattenContent, getSession } from './client';

/**
 * Expose MCP server tools to the chat tool loop. For every enabled server:
 *   - use the cached tools/list if present
 *   - lazily fetch + cache on first call if the cache is empty
 * Each remote tool is namespaced as `<serverName>_<toolName>` so two
 * servers exposing the same name don't collide, and handlers can route
 * back to the right session.
 */

const NAMESPACE_SEP = '__';

function makeToolName(serverName: string, toolName: string): string {
  // Allowed by both OpenAI + Anthropic schemas: ^[a-zA-Z0-9_-]+$. Strip
  // anything else so a server with Chinese names still produces valid
  // identifiers.
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  return `${safe(serverName)}${NAMESPACE_SEP}${safe(toolName)}`;
}

function stripNamespace(toolName: string): string {
  const idx = toolName.indexOf(NAMESPACE_SEP);
  return idx === -1 ? toolName : toolName.slice(idx + NAMESPACE_SEP.length);
}

export async function mcpTools(_ctx: ToolContext): Promise<Tool[]> {
  const servers = await db.mcpServers.toArray();
  const enabled = servers.filter((s) => s.enabled);
  if (enabled.length === 0) return [];

  const out: Tool[] = [];
  for (const server of enabled) {
    const tools = await ensureToolList(server);
    for (const t of tools) {
      const namespaced = makeToolName(server.name, t.name);
      out.push({
        def: {
          name: namespaced,
          description: t.description ?? `MCP tool from ${server.name}`,
          parameters: t.inputSchema,
        },
        handler: async (input) => {
          const session = getSession(server);
          const result = await session.callTool(
            stripNamespace(namespaced),
            (input as Record<string, unknown>) ?? {},
          );
          if (result.isError) {
            throw new Error(flattenContent(result.content));
          }
          return { content: flattenContent(result.content) };
        },
      });
    }
  }
  return out;
}

/** Returns the cached tools list, or fetches + caches if missing. */
async function ensureToolList(server: McpServer) {
  if (server.cachedTools && server.cachedTools.length > 0) {
    return server.cachedTools;
  }
  try {
    const session = getSession(server);
    const tools = await session.listTools();
    await db.mcpServers.update(server.id, {
      cachedTools: tools,
      cachedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return tools;
  } catch {
    return [];
  }
}

/** Force-refresh the cached tools list. Called from the management UI's
 *  "测试连接" button. Returns the new list or throws on failure. */
export async function refreshServerTools(server: McpServer) {
  const session = getSession(server);
  const tools = await session.listTools();
  await db.mcpServers.update(server.id, {
    cachedTools: tools,
    cachedAt: Date.now(),
    updatedAt: Date.now(),
  });
  return tools;
}
