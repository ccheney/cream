/**
 * Analyze Content Tool
 *
 * Analyze content for sentiment, relevance, and actionability scores.
 */

import { analyzeContentTool } from "@cream/agents";

// Re-export the existing tool
// Already uses v1 patterns with inputSchema, outputSchema, and execute
export const analyzeContent = analyzeContentTool;
