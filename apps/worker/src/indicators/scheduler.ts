/**
 * Indicator Batch Jobs Scheduler
 *
 * Uses croner to schedule batch data fetching jobs for the v2 indicator engine.
 * Jobs run on different schedules based on data freshness requirements.
 *
 * Schedule (all times in America/New_York timezone):
 * - Short Interest: 6:00 PM daily (after FINRA publishes)
 * - Sentiment: Hourly from 9:00 AM - 4:00 PM (market hours)
 * - Corporate Actions: 6:00 AM daily (before market open)
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import {
	type AlpacaCorporateActionsClient,
	type BatchJobResult,
	CorporateActionsBatchJob,
	type FINRAClient,
	SentimentAggregationJob,
	type SentimentDataProvider,
	type SharesOutstandingProvider,
	ShortInterestBatchJob,
} from "@cream/indicators";
import type {
	CorporateActionsRepository,
	SentimentRepository,
	ShortInterestRepository,
} from "@cream/storage";
import { Cron } from "croner";
import { z } from "zod";
import { log } from "../logger";

// ============================================
// Constants
// ============================================

const TIMEZONE = "America/New_York";

// Cron expressions (minute hour day month weekday)
// Note: croner uses 6-field cron with seconds, so we use 5-field with implicit "0" seconds
const CRON_SCHEDULES = {
	// 6:00 PM ET daily - after FINRA publishes short interest data
	shortInterest: "0 18 * * *",
	// Every hour from 9 AM - 4 PM ET (market hours), Mon-Fri
	sentiment: "0 9-16 * * 1-5",
	// 6:00 AM ET daily - before market open
	corporateActions: "0 6 * * *",
} as const;

// ============================================
// Types
// ============================================

export const JobStatusSchema = z.enum(["idle", "running", "error", "disabled"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobNameSchema = z.enum(["shortInterest", "sentiment", "corporateActions"]);
export type JobName = z.infer<typeof JobNameSchema>;

export interface JobState {
	status: JobStatus;
	lastRun: Date | null;
	lastResult: BatchJobResult | null;
	lastError: string | null;
	nextRun: Date | null;
	runCount: number;
}

export interface IndicatorSchedulerConfig {
	/** Enable/disable individual jobs */
	enabled: {
		shortInterest: boolean;
		sentiment: boolean;
		corporateActions: boolean;
	};
	/** Override job configurations */
	jobConfigs?: {
		shortInterest?: { rateLimitDelayMs?: number };
		sentiment?: { rateLimitDelayMs?: number };
		corporateActions?: { rateLimitDelayMs?: number };
	};
}

export interface IndicatorSchedulerDependencies {
	// Data providers (injected for testability)
	finraClient: FINRAClient;
	sharesProvider: SharesOutstandingProvider;
	sentimentProvider: SentimentDataProvider;
	alpacaClient: AlpacaCorporateActionsClient;

	// Repositories
	shortInterestRepo: ShortInterestRepository;
	sentimentRepo: SentimentRepository;
	corporateActionsRepo: CorporateActionsRepository;

	// Universe symbols provider
	getSymbols: () => string[];
}

// ============================================
// Scheduler Class
// ============================================

/**
 * Manages scheduled batch jobs for indicator data fetching.
 *
 * @example
 * ```typescript
 * const scheduler = new IndicatorBatchScheduler(deps, config);
 * scheduler.start();
 *
 * // Get job status for health endpoint
 * const status = scheduler.getJobStatus();
 *
 * // Trigger a job manually
 * await scheduler.triggerJob("fundamentals");
 *
 * // Graceful shutdown
 * scheduler.stop();
 * ```
 */
export class IndicatorBatchScheduler {
	private readonly deps: IndicatorSchedulerDependencies;
	private readonly config: IndicatorSchedulerConfig;
	private readonly jobs: Map<JobName, Cron> = new Map();
	private readonly state: Map<JobName, JobState> = new Map();

	constructor(deps: IndicatorSchedulerDependencies, config: IndicatorSchedulerConfig) {
		this.deps = deps;
		this.config = config;

		// Initialize state for all jobs
		for (const jobName of JobNameSchema.options) {
			this.state.set(jobName, {
				status: config.enabled[jobName] ? "idle" : "disabled",
				lastRun: null,
				lastResult: null,
				lastError: null,
				nextRun: null,
				runCount: 0,
			});
		}
	}

	/**
	 * Start all enabled scheduled jobs.
	 */
	start(): void {
		log.info({}, "Starting indicator batch scheduler");

		if (this.config.enabled.shortInterest) {
			this.scheduleJob("shortInterest", CRON_SCHEDULES.shortInterest, () =>
				this.runShortInterestJob()
			);
		}

		if (this.config.enabled.sentiment) {
			this.scheduleJob("sentiment", CRON_SCHEDULES.sentiment, () => this.runSentimentJob());
		}

		if (this.config.enabled.corporateActions) {
			this.scheduleJob("corporateActions", CRON_SCHEDULES.corporateActions, () =>
				this.runCorporateActionsJob()
			);
		}

		// Log next run times
		for (const [name, job] of this.jobs) {
			const nextRun = job.nextRun();
			const state = this.state.get(name);
			if (state && nextRun) {
				state.nextRun = nextRun;
			}
			log.info(
				{ job: name, nextRun: nextRun?.toISOString() ?? "none" },
				"Scheduled indicator batch job"
			);
		}
	}

	/**
	 * Stop all scheduled jobs gracefully.
	 */
	stop(): void {
		log.info({}, "Stopping indicator batch scheduler");

		for (const [name, job] of this.jobs) {
			job.stop();
			log.debug({ job: name }, "Stopped job");
		}

		this.jobs.clear();
	}

	/**
	 * Get current status of all jobs.
	 */
	getJobStatus(): Record<JobName, JobState> {
		const result: Record<JobName, JobState> = {} as Record<JobName, JobState>;

		for (const jobName of JobNameSchema.options) {
			const state = this.state.get(jobName);
			const job = this.jobs.get(jobName);

			// Update next run time from cron job
			if (state && job) {
				state.nextRun = job.nextRun();
			}

			result[jobName] = state ?? {
				status: "disabled",
				lastRun: null,
				lastResult: null,
				lastError: null,
				nextRun: null,
				runCount: 0,
			};
		}

		return result;
	}

	/**
	 * Manually trigger a specific job.
	 * Returns the job result or throws if job is already running.
	 */
	async triggerJob(jobName: JobName): Promise<BatchJobResult> {
		const state = this.state.get(jobName);
		if (!state) {
			throw new Error(`Unknown job: ${jobName}`);
		}

		if (state.status === "running") {
			throw new Error(`Job ${jobName} is already running`);
		}

		if (state.status === "disabled") {
			throw new Error(`Job ${jobName} is disabled`);
		}

		switch (jobName) {
			case "shortInterest":
				return this.runShortInterestJob();
			case "sentiment":
				return this.runSentimentJob();
			case "corporateActions":
				return this.runCorporateActionsJob();
		}
	}

	// ============================================
	// Private Methods
	// ============================================

	private scheduleJob(
		name: JobName,
		cronExpr: string,
		handler: () => Promise<BatchJobResult>
	): void {
		const errorHandler = (error: unknown) => {
			const state = this.state.get(name);
			if (state) {
				state.status = "error";
				state.lastError = error instanceof Error ? error.message : String(error);
			}
			log.error({ job: name, error: state?.lastError }, "Indicator batch job error");
		};

		const protectCallback = (job: Cron) => {
			log.warn(
				{
					job: name,
					blockedAt: new Date().toISOString(),
					startedAt: job.currentRun()?.toISOString(),
				},
				"Job execution blocked - previous run still in progress"
			);
		};

		const job = new Cron(
			cronExpr,
			{
				timezone: TIMEZONE,
				catch: errorHandler,
				protect: protectCallback,
			},
			async () => {
				try {
					await handler();
				} catch (error) {
					errorHandler(error);
				}
			}
		);

		this.jobs.set(name, job);
	}

	private async runShortInterestJob(): Promise<BatchJobResult> {
		return this.executeJob("shortInterest", async (symbols) => {
			const job = new ShortInterestBatchJob(
				this.deps.finraClient,
				this.deps.shortInterestRepo,
				this.deps.sharesProvider,
				this.config.jobConfigs?.shortInterest
			);
			return job.run(symbols);
		});
	}

	private async runSentimentJob(): Promise<BatchJobResult> {
		return this.executeJob("sentiment", async (symbols) => {
			const job = new SentimentAggregationJob(
				this.deps.sentimentProvider,
				this.deps.sentimentRepo,
				this.config.jobConfigs?.sentiment
			);
			// Get today's date in YYYY-MM-DD format
			const today = new Date().toISOString().split("T")[0] ?? "";
			return job.run(symbols, today);
		});
	}

	private async runCorporateActionsJob(): Promise<BatchJobResult> {
		return this.executeJob("corporateActions", async (symbols) => {
			const job = new CorporateActionsBatchJob(
				this.deps.alpacaClient,
				this.deps.corporateActionsRepo,
				undefined, // priceProvider - reserved for future use
				this.config.jobConfigs?.corporateActions
			);
			return job.run(symbols);
		});
	}

	private async executeJob(
		name: JobName,
		runner: (symbols: string[]) => Promise<BatchJobResult>
	): Promise<BatchJobResult> {
		const state = this.state.get(name);
		if (!state) {
			throw new Error(`Unknown job: ${name}`);
		}

		state.status = "running";
		state.lastRun = new Date();
		state.runCount++;

		log.info({ job: name, runCount: state.runCount }, "Starting indicator batch job");

		try {
			const symbols = this.deps.getSymbols();
			const result = await runner(symbols);

			state.status = "idle";
			state.lastResult = result;
			state.lastError = null;

			log.info(
				{
					job: name,
					processed: result.processed,
					failed: result.failed,
					durationMs: result.durationMs,
				},
				"Completed indicator batch job"
			);

			return result;
		} catch (error) {
			state.status = "error";
			state.lastError = error instanceof Error ? error.message : String(error);

			log.error({ job: name, error: state.lastError }, "Indicator batch job failed");

			throw error;
		}
	}
}

// ============================================
// Factory
// ============================================

/**
 * Create default scheduler configuration.
 * All jobs enabled by default.
 */
export function createDefaultConfig(): IndicatorSchedulerConfig {
	return {
		enabled: {
			shortInterest: true,
			sentiment: true,
			corporateActions: true,
		},
	};
}
