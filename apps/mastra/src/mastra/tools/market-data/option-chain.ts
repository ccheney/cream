/**
 * Option Chain Tool
 *
 * Fetches option chain data for an underlying symbol.
 */

import { getOptionChainTool } from "@cream/agents";

// Re-export the existing tool
// Already uses v1 patterns with inputSchema, outputSchema, and execute
export const optionChain = getOptionChainTool;
