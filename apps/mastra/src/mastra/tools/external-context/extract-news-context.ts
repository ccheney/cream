/**
 * Extract News Context Tool
 *
 * Extract events and context from news articles for trading analysis.
 */

import { extractNewsContextTool } from "@cream/agents";

// Re-export the existing tool
// Already uses v1 patterns with inputSchema, outputSchema, and execute
export const extractNewsContext = extractNewsContextTool;
