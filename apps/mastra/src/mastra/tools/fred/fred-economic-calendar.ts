/**
 * FRED Economic Calendar Tool
 *
 * Fetch upcoming economic events from FRED (Federal Reserve Economic Data).
 */

import { fredEconomicCalendarTool } from "@cream/agents";

// Re-export the existing tool
// Already uses v1 patterns with inputSchema, outputSchema, and execute
export const fredEconomicCalendar = fredEconomicCalendarTool;
