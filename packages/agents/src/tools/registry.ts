/**
 * Tool Registry
 *
 * Central registry for all agent tools.
 */

import { checkIndicatorTrigger } from "./checkIndicatorTrigger.js";
import { implementIndicator } from "./claudeCodeIndicator.js";
import {
  analyzeContent,
  extractNewsContext,
  extractTranscript,
  getEconomicCalendar,
  getFredEconomicCalendar,
  getGreeks,
  getMacroIndicators,
  getOptionChain,
  getPortfolioState,
  getQuotes,
  graphragQuery,
  helixQuery,
  recalcIndicator,
  searchNews,
} from "./implementations/index.js";
import { searchFilings } from "./searchFilings.js";

// ============================================
// Tool Registry
// ============================================

export const TOOL_REGISTRY = {
  get_quotes: getQuotes,
  get_portfolio_state: getPortfolioState,
  option_chain: getOptionChain,
  get_greeks: getGreeks,
  recalc_indicator: recalcIndicator,
  economic_calendar: getEconomicCalendar,
  news_search: searchNews,
  search_filings: searchFilings,
  graphrag_query: graphragQuery,
  helix_query: helixQuery,
  check_indicator_trigger: checkIndicatorTrigger,
  implement_indicator: implementIndicator,
  // External context extraction tools
  extract_news_context: extractNewsContext,
  extract_transcript: extractTranscript,
  analyze_content: analyzeContent,
  // FRED Economic Data tools
  fred_economic_calendar: getFredEconomicCalendar,
  fred_macro_indicators: getMacroIndicators,
} as const;

export type ToolName = keyof typeof TOOL_REGISTRY;

/**
 * Get a tool function by name
 */
export function getTool(name: ToolName): (typeof TOOL_REGISTRY)[ToolName] {
  const tool = TOOL_REGISTRY[name];
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return tool;
}

/**
 * Get all available tool names
 */
export function getAvailableTools(): ToolName[] {
  return Object.keys(TOOL_REGISTRY) as ToolName[];
}
