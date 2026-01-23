/**
 * Helix Query Tool
 *
 * Query the HelixDB knowledge graph.
 */

import { helixQueryTool } from "@cream/agents";

// Re-export the existing tool
// Already uses v1 patterns with inputSchema, outputSchema, and execute
export const helixQuery = helixQueryTool;
