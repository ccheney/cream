/**
 * GraphRAG Query Tool
 *
 * Unified search across knowledge graph and vector embeddings.
 */

import { graphragQueryTool } from "@cream/agents";

// Re-export the existing tool
// Already uses v1 patterns with inputSchema, outputSchema, and execute
export const graphragQuery = graphragQueryTool;
