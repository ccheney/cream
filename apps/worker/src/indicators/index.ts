/**
 * Indicator Batch Jobs
 *
 * Scheduled batch data fetching for the v2 indicator engine.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

export {
  // Adapters
  AlpacaCorporateActionsAdapter,
  createAlpacaCorporateActionsFromEnv,
  createFINRAClient,
  createFMPClientFromEnv,
  createSentimentProviderFromEnv,
  createSharesOutstandingProviderFromEnv,
  FINRAClientAdapter,
  FMPClientAdapter,
  SentimentDataAdapter,
  SharesOutstandingAdapter,
} from "./adapters.js";
export {
  createDefaultConfig,
  IndicatorBatchScheduler,
  type IndicatorSchedulerConfig,
  type IndicatorSchedulerDependencies,
  type JobName,
  JobNameSchema,
  type JobState,
  type JobStatus,
  JobStatusSchema,
} from "./scheduler.js";
