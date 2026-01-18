/**
 * Agent Tools
 *
 * Tools that agents can invoke during execution to access
 * real-time data and perform calculations.
 *
 * @see docs/plans/05-agents.md
 */

// Mastra tool definitions
export {
	// Academic paper tools
	getAcademicPaperTool,
	GetPaperInputSchema,
	GetPaperOutputSchema,
	ingestAcademicPapersTool,
	IngestPapersInputSchema,
	IngestPapersOutputSchema,
	searchAcademicPapersTool,
	SearchPapersInputSchema,
	SearchPapersOutputSchema,
	searchExternalPapersTool,
	SearchExternalPapersInputSchema,
	SearchExternalPapersOutputSchema,
	// External context tools
	AnalyzeContentInputSchema,
	AnalyzeContentOutputSchema,
	analyzeContentTool,
	// Factor Zoo tools
	type CheckFactorDecayInput,
	CheckFactorDecayInputSchema,
	type CheckFactorDecayOutput,
	CheckFactorDecayOutputSchema,
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
	createComputeMegaAlphaForSymbolsTool,
	createComputeMegaAlphaTool,
	createGetCurrentWeightsTool,
	createGetFactorZooStatsTool,
	createUpdateDailyWeightsTool,
	// Data tools
	ExtractedEventSchema,
	ExtractNewsContextInputSchema,
	ExtractNewsContextOutputSchema,
	extractNewsContextTool,
	// Filing search tool
	FilingChunkSummarySchema,
	// FRED tools
	FREDCalendarInputSchema,
	FREDCalendarOutputSchema,
	fredEconomicCalendarTool,
	fredMacroIndicatorsTool,
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
	// GraphRAG unified search tool
	type GraphRAGQueryInput,
	GraphRAGQueryInputSchema,
	type GraphRAGQueryOutput,
	GraphRAGQueryOutputSchema,
	getGreeksTool,
	getMarketSnapshotsTool,
	getOptionChainTool,
	getPortfolioStateTool,
	getPredictionSignalsTool,
	getQuotesTool,
	graphragQueryTool,
	HelixQueryInputSchema,
	HelixQueryOutputSchema,
	helixQueryTool,
	MacroIndicatorsInputSchema,
	MacroIndicatorsOutputSchema,
	RecalcIndicatorInputSchema,
	RecalcIndicatorOutputSchema,
	recalcIndicatorTool,
	SearchFilingsInputSchema,
	SearchFilingsOutputSchema,
	searchFilingsTool,
	setPredictionMarketsRepoProvider,
	type UpdateDailyWeightsInput,
	UpdateDailyWeightsInputSchema,
	type UpdateDailyWeightsOutput,
	UpdateDailyWeightsOutputSchema,
} from "./definitions/index.js";
// Re-export implementations
export {
	type AnalyzeContentParams,
	type AnalyzeContentResult,
	analyzeContent,
	type ExtractNewsContextParams,
	type ExtractNewsContextResult,
	extractNewsContext,
	type GraphRAGQueryParams,
	type GraphRAGQueryResult,
	// FRED implementations
	getFredEconomicCalendar,
	getGreeks,
	getMacroIndicators,
	getOptionChain,
	getPortfolioState,
	getQuotes,
	graphragQuery,
	helixQuery,
	type MacroIndicatorValue,
	parseOSISymbol,
	recalcIndicator,
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
	OptionChainResponse,
	OptionContract,
	OptionExpiration,
	PortfolioPosition,
	PortfolioStateResponse,
	Quote,
} from "./types.js";
