/**
 * @cream/external-context
 *
 * External context extraction pipeline for news, sentiment, and fundamentals.
 *
 * Pipeline stages:
 * 1. Parse: Raw feeds → normalized format
 * 2. Extract: Claude Structured Outputs → structured data
 * 3. Score: Sentiment, importance, surprise scores
 * 4. Link: Entity names → ticker symbols
 * 5. Store: Events ready for HelixDB storage
 *
 * @example
 * ```typescript
 * import { createExtractionPipeline } from "@cream/external-context";
 *
 * const pipeline = createExtractionPipeline({
 *   targetSymbols: ["AAPL", "MSFT", "GOOGL"],
 * });
 *
 * const result = await pipeline.processNews(fmpNewsArticles);
 * console.log(result.events);
 * ```
 */

// Types
export type {
  // Parser types
  ParsedNews,
  ParsedPressRelease,
  ParsedTranscript,
  ParsedMacroRelease,
  TranscriptSpeaker,
  // Extraction types
  Sentiment,
  EntityType,
  ExtractedEntity,
  DataPoint,
  EventType,
  ExtractionResult,
  // Scoring types
  ContentScores,
  // Linking types
  EntityLink,
  // Pipeline types
  ContentSourceType,
  PipelineInput,
  ExtractedEvent,
  // FMP types
  FMPNewsArticle,
  FMPTranscript,
  FMPCompanySearch,
} from "./types.js";

// Zod schemas
export {
  SentimentSchema,
  EntityTypeSchema,
  ExtractedEntitySchema,
  DataPointSchema,
  EventTypeSchema,
  ExtractionResultSchema,
} from "./types.js";

// Parsers
export {
  parseNewsArticles,
  parseNewsArticle,
  filterRecentNews,
  filterNewsBySymbols,
  parseTranscript,
  extractTranscriptSections,
  getExecutiveComments,
  parseAlphaVantageIndicator,
  parseFMPEconomicEvents,
  calculateMacroSurprise,
  isMacroReleaseSignificant,
  filterRecentMacroReleases,
  groupByIndicator,
  MACRO_INDICATORS,
  type NewsParserConfig,
  type TranscriptParserConfig,
  type MacroIndicatorType,
  type AlphaVantageEconomicIndicator,
  type FMPEconomicEvent,
} from "./parsers/index.js";

// Extraction
export {
  ExtractionClient,
  createExtractionClient,
  type ExtractionClientConfig,
} from "./extraction/index.js";

// Scoring
export {
  computeSentimentScore,
  computeSentimentFromExtraction,
  aggregateSentimentScores,
  classifySentimentScore,
  computeSentimentMomentum,
  computeImportanceScore,
  getSourceCredibility,
  computeRecencyScore,
  computeEntityRelevance,
  applyEventTypeBoost,
  classifyImportance,
  computeSurpriseScore,
  computeAggregatedSurprise,
  computeSurpriseFromExtraction,
  classifySurprise,
  isSurpriseSignificant,
  getSurpriseDirection,
  type SentimentScoringConfig,
  type ImportanceScoringConfig,
  type SurpriseScoringConfig,
  type MetricExpectation,
} from "./scoring/index.js";

// Linking
export {
  EntityLinker,
  createEntityLinker,
  type EntityLinkerConfig,
} from "./linking/index.js";

// Pipeline
export {
  ExtractionPipeline,
  createExtractionPipeline,
  type PipelineConfig,
  type PipelineResult,
} from "./pipeline.js";
