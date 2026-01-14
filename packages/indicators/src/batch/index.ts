/**
 * Batch Processing
 *
 * Batch jobs for fetching and calculating indicators from external data sources.
 * These run on scheduled cron jobs (nightly/bi-weekly).
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

export {
	// Types
	type AlpacaActionType,
	type AlpacaCorporateAction,
	type AlpacaCorporateActionsClient,
	// Batch job
	CorporateActionsBatchJob,
	type CorporateActionsBatchJobConfig,
	// Calculation functions (exported for testing)
	calculateDaysToExDividend,
	calculateDividendGrowth,
	calculateDividendIndicators,
	calculateSplitAdjustmentFactor,
	calculateTrailingDividendYield,
	type DividendIndicators,
	hasPendingSplit,
	mapAlpacaActionType,
	type PriceProvider,
} from "./corporate-actions-batch.js";
export {
	// Types
	type AggregatedSentiment,
	// Calculation functions (exported for testing)
	aggregateSentimentScores,
	calculateRecencyWeight,
	calculateSentimentMomentum,
	calculateSentimentStrength,
	computeSentimentScore,
	detectEventRisk,
	type EventType,
	type ExtractedSentiment,
	type RawSentimentClassification,
	// Batch job
	SentimentAggregationJob,
	type SentimentBatchJobConfig,
	// Sentiment data provider interface
	type SentimentDataProvider,
	type SentimentScoringConfig,
} from "./sentiment-batch.js";
export {
	// Calculation functions (exported for testing)
	calculateShortInterestMomentum,
	calculateShortInterestRatio,
	calculateShortPctFloat,
	// FINRA client interface
	type FINRAClient,
	type FINRAQueryFilter,
	type FINRAQueryRequest,
	type FINRAShortInterestRecord,
	// Shares provider interface
	type SharesOutstandingProvider,
	// Batch job
	ShortInterestBatchJob,
	type ShortInterestBatchJobConfig,
} from "./short-interest-batch.js";
export type { BatchJobResult } from "./types.js";
