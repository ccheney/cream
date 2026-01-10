/**
 * Context7 MCP Client
 *
 * Provides access to up-to-date library documentation via the Context7 MCP server.
 *
 * Tools provided:
 * - context7_resolve-library-id: Find the library ID for a package/library name
 * - context7_query-docs: Query documentation for a specific library
 */

import { MCPClient } from "@mastra/mcp";

/**
 * Context7 MCP client for documentation access
 *
 * Usage with agents:
 * ```typescript
 * const tools = await context7Client.listTools();
 * const agent = new Agent({
 *   tools: { ...tools },
 *   // ...
 * });
 * ```
 */
export const context7Client = new MCPClient({
  servers: {
    context7: {
      command: "npx",
      args: ["-y", "@upstash/context7-mcp@latest"],
    },
  },
});

/**
 * Get Context7 tools for use with agents
 *
 * Must call connectContext7() first.
 *
 * Returns tools:
 * - resolve-library-id
 * - query-docs
 */
export async function getContext7Tools() {
  return context7Client.listTools();
}

/**
 * Connect to the Context7 MCP server
 * @deprecated MCPClient manages connections automatically - this is a no-op
 */
export async function connectContext7() {
  // MCPClient handles connections internally
}

/**
 * Disconnect from the Context7 MCP server
 */
export async function disconnectContext7() {
  await context7Client.disconnect();
}
