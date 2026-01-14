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
	AlpacaSentimentAdapter,
	createAlpacaCorporateActionsFromEnv,
	createFINRAClient,
	createSentimentProviderFromEnv,
	FINRAClientAdapter,
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
