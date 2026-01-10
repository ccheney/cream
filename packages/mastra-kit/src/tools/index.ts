/**
 * Agent Tools
 *
 * Tools that agents can invoke during execution to access
 * real-time data and perform calculations.
 *
 * @see docs/plans/05-agents.md
 */

// Indicator trigger detection tool
export {
  type CheckIndicatorTriggerInput,
  type CheckIndicatorTriggerOutput,
  checkIndicatorTrigger,
} from "./checkIndicatorTrigger.js";
// Claude Code indicator implementation tool
export {
  buildImplementationPrompt,
  type ClaudeCodeConfig,
  claudeCodeIndicator,
  type ImplementIndicatorInput,
  ImplementIndicatorInputSchema,
  type ImplementIndicatorOutput,
  ImplementIndicatorOutputSchema,
  implementIndicator,
} from "./claudeCodeIndicator.js";
// Mastra tool definitions
export {
  // External context tools
  AnalyzeContentInputSchema,
  AnalyzeContentOutputSchema,
  analyzeContentTool,
  // Factor Zoo tools
  type CheckFactorDecayInput,
  CheckFactorDecayInputSchema,
  type CheckFactorDecayOutput,
  CheckFactorDecayOutputSchema,
  type CheckResearchStatusInput,
  CheckResearchStatusInputSchema,
  type CheckResearchStatusOutput,
  CheckResearchStatusOutputSchema,
  type CheckTriggerConditionsInput,
  CheckTriggerConditionsInputSchema,
  type CheckTriggerConditionsOutput,
  CheckTriggerConditionsOutputSchema,
  type ComputeMegaAlphaForSymbolsInput,
  ComputeMegaAlphaForSymbolsInputSchema,
  type ComputeMegaAlphaForSymbolsOutput,
  ComputeMegaAlphaForSymbolsOutputSchema,
  type ComputeMegaAlphaInput,
  ComputeMegaAlphaInputSchema,
  type ComputeMegaAlphaOutput,
  ComputeMegaAlphaOutputSchema,
  ContentScoresSchema,
  createCheckFactorDecayTool,
  createCheckResearchStatusTool,
  createCheckTriggerConditionsTool,
  createComputeMegaAlphaForSymbolsTool,
  createComputeMegaAlphaTool,
  createGetCurrentWeightsTool,
  createGetFactorZooStatsTool,
  // Research trigger tools
  createTriggerResearchTool,
  // Factor Zoo tools
  createUpdateDailyWeightsTool,
  // Data tools
  EconomicCalendarInputSchema,
  EconomicCalendarOutputSchema,
  ExtractedEventSchema,
  ExtractNewsContextInputSchema,
  ExtractNewsContextOutputSchema,
  ExtractTranscriptInputSchema,
  ExtractTranscriptOutputSchema,
  economicCalendarTool,
  extractNewsContextTool,
  extractTranscriptTool,
  // Filing search tool
  FilingChunkSummarySchema,
  type GetCurrentWeightsInput,
  GetCurrentWeightsInputSchema,
  type GetCurrentWeightsOutput,
  GetCurrentWeightsOutputSchema,
  type GetFactorZooStatsInput,
  GetFactorZooStatsInputSchema,
  type GetFactorZooStatsOutput,
  GetFactorZooStatsOutputSchema,
  GetGreeksInputSchema,
  GetGreeksOutputSchema,
  GetMarketSnapshotsInputSchema,
  GetMarketSnapshotsOutputSchema,
  GetOptionChainInputSchema,
  GetOptionChainOutputSchema,
  GetPortfolioStateInputSchema,
  GetPortfolioStateOutputSchema,
  // Prediction market tools
  GetPredictionSignalsInputSchema,
  GetPredictionSignalsOutputSchema,
  // Trading tools
  GetQuotesInputSchema,
  GetQuotesOutputSchema,
  getGreeksTool,
  getMarketSnapshotsTool,
  getOptionChainTool,
  getPortfolioStateTool,
  getPredictionSignalsTool,
  getQuotesTool,
  HelixQueryInputSchema,
  HelixQueryOutputSchema,
  helixQueryTool,
  NewsSearchInputSchema,
  NewsSearchOutputSchema,
  newsSearchTool,
  RecalcIndicatorInputSchema,
  RecalcIndicatorOutputSchema,
  recalcIndicatorTool,
  SearchFilingsInputSchema,
  SearchFilingsOutputSchema,
  searchFilingsTool,
  setPredictionMarketsRepoProvider,
  type TriggerResearchInput,
  TriggerResearchInputSchema,
  type TriggerResearchOutput,
  TriggerResearchOutputSchema,
  type UpdateDailyWeightsInput,
  UpdateDailyWeightsInputSchema,
  type UpdateDailyWeightsOutput,
  UpdateDailyWeightsOutputSchema,
  // Web search tool
  WebSearchInputSchema,
  WebSearchOutputSchema,
  webSearchTool,
} from "./definitions/index.js";
// Re-export implementations
export {
  type AnalyzeContentParams,
  type AnalyzeContentResult,
  analyzeContent,
  type ExtractNewsContextParams,
  type ExtractNewsContextResult,
  type ExtractTranscriptParams,
  type ExtractTranscriptResult,
  extractNewsContext,
  extractTranscript,
  getEconomicCalendar,
  getGreeks,
  getOptionChain,
  getPortfolioState,
  getQuotes,
  helixQuery,
  parseOSISymbol,
  recalcIndicator,
  searchNews,
} from "./implementations/index.js";
// Re-export registry
export { getAvailableTools, getTool, TOOL_REGISTRY, type ToolName } from "./registry.js";
// Search filings tool
export {
  type FilingChunkSummary,
  type SearchFilingsParams,
  type SearchFilingsResult,
  searchFilings,
} from "./searchFilings.js";
// Re-export types
export type {
  EconomicEvent,
  Greeks,
  HelixQueryResult,
  IndicatorResult,
  NewsItem,
  OptionChainResponse,
  OptionContract,
  OptionExpiration,
  PortfolioPosition,
  PortfolioStateResponse,
  Quote,
} from "./types.js";
export type { WebSearchResult } from "./webSearch.js";
// Web search types and function
export { type WebSearchParams, type WebSearchResponse, webSearch } from "./webSearch.js";
