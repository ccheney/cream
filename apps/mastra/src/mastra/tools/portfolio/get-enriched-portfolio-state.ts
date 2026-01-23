/**
 * Get Enriched Portfolio State Tool
 *
 * Fetches enriched portfolio state with strategy, risk, and thesis context.
 */

import { getEnrichedPortfolioStateTool } from "@cream/agents";

// Re-export the existing tool
// Already uses v1 patterns with inputSchema, outputSchema, and execute
export const getEnrichedPortfolioState = getEnrichedPortfolioStateTool;
