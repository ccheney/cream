/**
 * Get Greeks Tool
 *
 * Fetches option Greeks for a contract symbol.
 */

import { getGreeksTool } from "@cream/agents";

// Re-export the existing tool
// Already uses v1 patterns with inputSchema, outputSchema, and execute
export const getGreeks = getGreeksTool;
