/**
 * Get Portfolio State Tool
 *
 * Fetches current portfolio state including positions and buying power.
 */

import { getPortfolioStateTool } from "@cream/agents";

// Re-export the existing tool
// Already uses v1 patterns with inputSchema, outputSchema, and execute
export const getPortfolioState = getPortfolioStateTool;
