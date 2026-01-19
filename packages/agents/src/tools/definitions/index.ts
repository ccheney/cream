/**
 * Mastra Tool Definitions
 *
 * Exports Mastra-compatible tool definitions for agent use.
 * These tools wrap the core implementations with proper schemas
 * for input validation and output typing.
 */

// Academic paper tools
export {
	GetPaperInputSchema,
	GetPaperOutputSchema,
	getAcademicPaperTool,
	IngestPapersInputSchema,
	IngestPapersOutputSchema,
	ingestAcademicPapersTool,
	SearchExternalPapersInputSchema,
	SearchExternalPapersOutputSchema,
	SearchPapersInputSchema,
	SearchPapersOutputSchema,
	searchAcademicPapersTool,
	searchExternalPapersTool,
} from "./academicPaperTools.js";
// Company relationship tools
export {
	type CompanyRelationshipsInput,
	CompanyRelationshipsInputSchema,
	type CompanyRelationshipsOutput,
	CompanyRelationshipsOutputSchema,
	companyRelationshipsTool,
	companyRelationshipTools,
	type SectorPeersInput,
	SectorPeersInputSchema,
	type SectorPeersOutput,
	SectorPeersOutputSchema,
	type SupplyChainInput,
	SupplyChainInputSchema,
	type SupplyChainOutput,
	SupplyChainOutputSchema,
	sectorPeersTool,
	supplyChainTool,
} from "./companyRelationshipTools.js";
export {
	FREDCalendarInputSchema,
	FREDCalendarOutputSchema,
	fredEconomicCalendarTool,
	fredMacroIndicatorsTool,
	HelixQueryInputSchema,
	HelixQueryOutputSchema,
	helixQueryTool,
	MacroIndicatorsInputSchema,
	MacroIndicatorsOutputSchema,
	RecalcIndicatorInputSchema,
	RecalcIndicatorOutputSchema,
	recalcIndicatorTool,
} from "./dataTools.js";
export {
	AnalyzeContentInputSchema,
	AnalyzeContentOutputSchema,
	analyzeContentTool,
	ContentScoresSchema,
	ExtractedEventSchema,
	ExtractNewsContextInputSchema,
	ExtractNewsContextOutputSchema,
	extractNewsContextTool,
} from "./externalContextTools.js";
// Filing search tools
export {
	FilingChunkSummarySchema,
	SearchFilingsInputSchema,
	SearchFilingsOutputSchema,
	searchFilingsTool,
} from "./filingTools.js";
// Data tools (indicators, news, calendar, helix)
// GraphRAG unified search tool
export {
	type GraphRAGQueryInput,
	GraphRAGQueryInputSchema,
	type GraphRAGQueryOutput,
	GraphRAGQueryOutputSchema,
	graphragQueryTool,
} from "./graphragTools.js";
// Macro exposure tools
export {
	type CompaniesAffectedInput,
	CompaniesAffectedInputSchema,
	type CompaniesAffectedOutput,
	CompaniesAffectedOutputSchema,
	type CompanyMacroExposureInput,
	CompanyMacroExposureInputSchema,
	type CompanyMacroExposureOutput,
	CompanyMacroExposureOutputSchema,
	companiesAffectedByMacroTool,
	companyMacroExposureTool,
	type ListMacroFactorsInput,
	ListMacroFactorsInputSchema,
	type ListMacroFactorsOutput,
	ListMacroFactorsOutputSchema,
	listMacroFactorsTool,
	macroExposureTools,
	type PortfolioMacroExposureInput,
	PortfolioMacroExposureInputSchema,
	type PortfolioMacroExposureOutput,
	PortfolioMacroExposureOutputSchema,
	portfolioMacroExposureTool,
} from "./macroExposureTools.js";
// Prediction market tools
export {
	GetMarketSnapshotsInputSchema,
	GetMarketSnapshotsOutputSchema,
	GetPredictionSignalsInputSchema,
	GetPredictionSignalsOutputSchema,
	getMarketSnapshotsTool,
	getPredictionSignalsTool,
	setPredictionMarketsRepoProvider,
} from "./predictionMarketTools.js";
// Trading tools (quotes, portfolio, options)
export {
	GetGreeksInputSchema,
	GetGreeksOutputSchema,
	GetOptionChainInputSchema,
	GetOptionChainOutputSchema,
	GetPortfolioStateInputSchema,
	GetPortfolioStateOutputSchema,
	GetQuotesInputSchema,
	GetQuotesOutputSchema,
	getGreeksTool,
	getOptionChainTool,
	getPortfolioStateTool,
	getQuotesTool,
} from "./tradingTools.js";
