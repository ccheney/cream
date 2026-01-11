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
  EconomicCalendarInputSchema,
  EconomicCalendarOutputSchema,
  economicCalendarTool,
  HelixQueryInputSchema,
  HelixQueryOutputSchema,
  helixQueryTool,
  NewsSearchInputSchema,
  NewsSearchOutputSchema,
  newsSearchTool,
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
  ExtractTranscriptInputSchema,
  ExtractTranscriptOutputSchema,
  extractNewsContextTool,
  extractTranscriptTool,
} from "./externalContextTools.js";
// Factor Zoo tools (require FactorZooRepository dependency injection)
export {
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
  // Check factor decay tool
  createCheckFactorDecayTool,
  // Compute Mega-Alpha for symbols tool
  createComputeMegaAlphaForSymbolsTool,
  // Compute Mega-Alpha tool
  createComputeMegaAlphaTool,
  // Get active factors tool
  createGetActiveFactorsTool,
  // Get current weights tool
  createGetCurrentWeightsTool,
  // Get factor context tool
  createGetFactorContextTool,
  // Get Factor Zoo stats tool
  createGetFactorZooStatsTool,
  // Run decay monitor tool
  createRunDecayMonitorTool,
  // Update daily weights tool
  createUpdateDailyWeightsTool,
  type GetActiveFactorsInput,
  GetActiveFactorsInputSchema,
  type GetActiveFactorsOutput,
  GetActiveFactorsOutputSchema,
  type GetCurrentWeightsInput,
  GetCurrentWeightsInputSchema,
  type GetCurrentWeightsOutput,
  GetCurrentWeightsOutputSchema,
  type GetFactorContextInput,
  GetFactorContextInputSchema,
  type GetFactorContextOutput,
  GetFactorContextOutputSchema,
  type GetFactorZooStatsInput,
  GetFactorZooStatsInputSchema,
  type GetFactorZooStatsOutput,
  GetFactorZooStatsOutputSchema,
  type RunDecayMonitorInput,
  RunDecayMonitorInputSchema,
  type RunDecayMonitorOutput,
  RunDecayMonitorOutputSchema,
  type UpdateDailyWeightsInput,
  UpdateDailyWeightsInputSchema,
  type UpdateDailyWeightsOutput,
  UpdateDailyWeightsOutputSchema,
} from "./factorZoo.js";
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
// Indicator tools
export {
  GetIndicatorInputSchema,
  GetIndicatorOutputSchema,
  GetValidatedIndicatorsInputSchema,
  GetValidatedIndicatorsOutputSchema,
  getIndicatorTool,
  getValidatedIndicatorsTool,
  IngestIndicatorInputSchema,
  IngestIndicatorOutputSchema,
  indicatorTools,
  ingestIndicatorTool,
  SearchByCategoryInputSchema,
  SearchByCategoryOutputSchema,
  SearchSimilarIndicatorsInputSchema,
  SearchSimilarIndicatorsOutputSchema,
  searchIndicatorsByCategoryTool,
  searchSimilarIndicatorsTool,
} from "./indicatorTools.js";
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
// Research trigger tools (require FactorZooRepository dependency injection)
export {
  type CheckResearchStatusInput,
  CheckResearchStatusInputSchema,
  type CheckResearchStatusOutput,
  CheckResearchStatusOutputSchema,
  type CheckTriggerConditionsInput,
  CheckTriggerConditionsInputSchema,
  type CheckTriggerConditionsOutput,
  CheckTriggerConditionsOutputSchema,
  createCheckResearchStatusTool,
  createCheckTriggerConditionsTool,
  // Tool factories
  createTriggerResearchTool,
  // Input/Output types
  type TriggerResearchInput,
  // Schemas for validation
  TriggerResearchInputSchema,
  type TriggerResearchOutput,
  TriggerResearchOutputSchema,
} from "./researchTrigger.js";
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
export { WebSearchInputSchema, WebSearchOutputSchema, webSearchTool } from "./webSearch.js";
