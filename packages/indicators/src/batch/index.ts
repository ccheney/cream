/**
 * Batch Processing
 *
 * Batch jobs for fetching and calculating indicators from external data sources.
 * These run on scheduled cron jobs (nightly/bi-weekly).
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

export {
  type BatchJobResult,
  // Calculation functions (exported for testing)
  calculateAccrualsRatio,
  calculateAssetGrowth,
  calculateBeneishMScore,
  calculateCashFlowQuality,
  calculateGrossProfitability,
  type FMPBalanceSheet,
  type FMPCashFlowStatement,
  type FMPCompanyProfile,
  type FMPIncomeStatement,
  type FMPKeyMetrics,
  // Batch job
  FundamentalsBatchJob,
  type FundamentalsBatchJobConfig,
  // FMP client interface
  type FundamentalsFMPClient,
} from "./fundamentals-batch.js";

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

export {
  // Calculation functions (exported for testing)
  aggregateSentimentScores,
  calculateRecencyWeight,
  calculateSentimentMomentum,
  calculateSentimentStrength,
  computeSentimentScore,
  detectEventRisk,
  // Types
  type AggregatedSentiment,
  type EventType,
  type ExtractedSentiment,
  type SentimentClassification,
  // Sentiment data provider interface
  type SentimentDataProvider,
  // Batch job
  SentimentAggregationJob,
  type SentimentBatchJobConfig,
  type SentimentScoringConfig,
} from "./sentiment-batch.js";
