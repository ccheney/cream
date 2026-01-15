/**
 * Indicators Bounded Context
 *
 * Batch jobs for indicator data collection (short interest, sentiment, corporate actions).
 * Includes adapters for external data providers and scheduling infrastructure.
 */

export {
	AlpacaCorporateActionsAdapter,
	AlpacaSentimentAdapter,
	createAlpacaCorporateActionsFromEnv,
	createFINRAClient,
	createSentimentProviderFromEnv,
	FINRAClientAdapter,
} from "./adapters/index.js";
export { IndicatorBatchScheduler } from "./batch-scheduler.js";
export {
	type IndicatorSchedulerInitDeps,
	type IndicatorSchedulerInitResult,
	initIndicatorScheduler,
	startIndicatorScheduler,
} from "./init.js";
export {
	createStubAlpacaClient,
	createStubSentimentProvider,
	createStubSharesProvider,
} from "./stubs.js";
export {
	CRON_SCHEDULES,
	createDefaultConfig,
	type IndicatorSchedulerConfig,
	type IndicatorSchedulerDependencies,
	type JobName,
	JobNameSchema,
	type JobState,
	type JobStatus,
	JobStatusSchema,
	TIMEZONE,
} from "./types.js";
