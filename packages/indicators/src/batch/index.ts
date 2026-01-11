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
