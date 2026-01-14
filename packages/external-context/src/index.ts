/**
 * @cream/external-context
 *
 * External context extraction pipeline for news, sentiment, and fundamentals.
 *
 * Pipeline stages:
 * 1. Parse: Raw feeds → normalized format
 * 2. Extract: LLM structured outputs → structured data (via injected IExtractionClient)
 * 3. Score: Sentiment, importance, surprise scores
 * 4. Link: Entity names → ticker symbols
 * 5. Store: Events ready for HelixDB storage
 *
 * @example
 * ```typescript
 * import { createExtractionClient } from "@cream/agents";
 * import { createExtractionPipeline } from "@cream/external-context";
 *
 * const extractionClient = createExtractionClient();
 * const pipeline = createExtractionPipeline({
 *   extractionClient,
 *   targetSymbols: ["AAPL", "MSFT", "GOOGL"],
 * });
 *
 * const result = await pipeline.processNews(fmpNewsArticles);
 * console.log(result.events);
 * ```
 */

// Academic APIs
export {
	createSemanticScholarClient,
	SemanticScholarClient,
	type SemanticScholarConfig,
	type SemanticScholarPaper,
	type SemanticScholarSearchResponse,
} from "./academic/index.js";
// HelixDB Integration
export {
	type EventIngestionResult,
	ingestExtractedEvent,
	ingestExtractedEvents,
	searchSimilarEvents,
} from "./helix-integration.js";
// Linking
export {
	createEntityLinker,
	EntityLinker,
	type EntityLinkerConfig,
} from "./linking/index.js";
// Parsers
export {
	type AlphaVantageEconomicIndicator,
	calculateMacroSurprise,
	extractTranscriptSections,
	type FMPEconomicEvent,
	type FREDEconomicEvent,
	type FREDLatestValues,
	type FREDObservationEntry,
	type FREDObservationMetadata,
	filterNewsBySymbols,
	filterRecentMacroReleases,
	filterRecentNews,
	filterSignificantFREDEvents,
	getExecutiveComments,
	groupByIndicator,
	isMacroReleaseSignificant,
	MACRO_INDICATORS,
	type MacroIndicatorType,
	type NewsParserConfig,
	parseAlphaVantageIndicator,
	parseFMPEconomicEvents,
	parseFREDObservations,
	parseFREDReleaseDates,
	parseNewsArticle,
	parseNewsArticles,
	parseTranscript,
	sortFREDEventsByDateAndImpact,
	type TranscriptParserConfig,
} from "./parsers/index.js";
// Pipeline
export {
	createExtractionPipeline,
	ExtractionPipeline,
	type PipelineConfig,
	type PipelineResult,
} from "./pipeline.js";
// Scoring
export {
	aggregateSentimentScores,
	applyEventTypeBoost,
	classifyImportance,
	classifySentimentScore,
	classifySurprise,
	computeAggregatedSurprise,
	computeEntityRelevance,
	computeImportanceScore,
	computeRecencyScore,
	computeSentimentFromExtraction,
	computeSentimentMomentum,
	computeSentimentScore,
	computeSurpriseFromExtraction,
	computeSurpriseScore,
	getSourceCredibility,
	getSurpriseDirection,
	type ImportanceScoringConfig,
	isSurpriseSignificant,
	type MetricExpectation,
	type SentimentScoringConfig,
	type SurpriseScoringConfig,
} from "./scoring/index.js";
// Types
export type {
	// Scoring types
	ContentScores,
	// Pipeline types
	ContentSourceType,
	DataPoint,
	// Linking types
	EntityLink,
	EntityType,
	EventType,
	ExtractedEntity,
	ExtractedEvent,
	ExtractionResult,
	FMPCompanySearch,
	// FMP types
	FMPNewsArticle,
	FMPTranscript,
	// Extraction client interface (for DI)
	IExtractionClient,
	ParsedMacroRelease,
	// Parser types
	ParsedNews,
	ParsedPressRelease,
	ParsedTranscript,
	PipelineInput,
	// Extraction types
	Sentiment,
	TranscriptSpeaker,
} from "./types.js";
// Zod schemas
export {
	DataPointSchema,
	EntityTypeSchema,
	EventTypeSchema,
	ExtractedEntitySchema,
	ExtractionResultSchema,
	SentimentSchema,
} from "./types.js";
