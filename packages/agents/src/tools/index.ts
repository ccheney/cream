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
	// External context tools
	AnalyzeContentInputSchema,
	AnalyzeContentOutputSchema,
	analyzeContentTool,
	ContentScoresSchema,
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
	// Enriched portfolio tool
	GetEnrichedPortfolioStateInputSchema,
	GetEnrichedPortfolioStateOutputSchema,
	GetGreeksInputSchema,
	GetGreeksOutputSchema,
	GetMarketSnapshotsInputSchema,
	GetMarketSnapshotsOutputSchema,
	GetOptionChainInputSchema,
	GetOptionChainOutputSchema,
	GetPaperInputSchema,
	GetPaperOutputSchema,
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
	// Academic paper tools
	getAcademicPaperTool,
	getEnrichedPortfolioStateTool,
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
	IngestPapersInputSchema,
	IngestPapersOutputSchema,
	ingestAcademicPapersTool,
	MacroIndicatorsInputSchema,
	MacroIndicatorsOutputSchema,
	RecalcIndicatorInputSchema,
	RecalcIndicatorOutputSchema,
	recalcIndicatorTool,
	SearchExternalPapersInputSchema,
	SearchExternalPapersOutputSchema,
	SearchFilingsInputSchema,
	SearchFilingsOutputSchema,
	SearchPapersInputSchema,
	SearchPapersOutputSchema,
	searchAcademicPapersTool,
	searchExternalPapersTool,
	searchFilingsTool,
	setPredictionMarketsRepoProvider,
} from "./definitions/index.js";
// Re-export implementations
export {
	type AnalyzeContentParams,
	type AnalyzeContentResult,
	analyzeContent,
	type ExtractNewsContextParams,
	type ExtractNewsContextResult,
	enrichPositions,
	extractNewsContext,
	type GraphRAGQueryParams,
	type GraphRAGQueryResult,
	getEnrichedPortfolioState,
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
	EnrichedPortfolioPosition,
	EnrichedPortfolioStateResponse,
	Greeks,
	HelixQueryResult,
	IndicatorResult,
	OptionChainResponse,
	OptionContract,
	OptionExpiration,
	PdtStatus,
	PortfolioPosition,
	PortfolioStateResponse,
	PositionRiskParams,
	PositionStrategy,
	PositionThesisContext,
	Quote,
} from "./types.js";
