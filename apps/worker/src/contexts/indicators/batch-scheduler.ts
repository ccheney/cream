/**
 * Indicator Batch Scheduler
 *
 * Uses croner to schedule batch data fetching jobs for the indicator engine.
 * Jobs run on different schedules based on data freshness requirements.
 *
 * Schedule (all times in America/New_York timezone):
 * - Short Interest: 6:00 PM daily (after FINRA publishes)
 * - Sentiment: Hourly from 9:00 AM - 4:00 PM (market hours)
 * - Corporate Actions: 6:00 AM daily (before market open)
 */

import type { BatchJobResult } from "@cream/indicators";
import {
	CorporateActionsBatchJob,
	SentimentAggregationJob,
	ShortInterestBatchJob,
} from "@cream/indicators";
import { Cron } from "croner";
import { log } from "../../shared/logger.js";
import {
	CRON_SCHEDULES,
	type IndicatorSchedulerConfig,
	type IndicatorSchedulerDependencies,
	type JobName,
	JobNameSchema,
	type JobState,
	TIMEZONE,
} from "./types.js";

export class IndicatorBatchScheduler {
	private readonly deps: IndicatorSchedulerDependencies;
	private readonly config: IndicatorSchedulerConfig;
	private readonly jobs: Map<JobName, Cron> = new Map();
	private readonly state: Map<JobName, JobState> = new Map();

	constructor(deps: IndicatorSchedulerDependencies, config: IndicatorSchedulerConfig) {
		this.deps = deps;
		this.config = config;

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

	stop(): void {
		log.info({}, "Stopping indicator batch scheduler");

		for (const [name, job] of this.jobs) {
			job.stop();
			log.debug({ job: name }, "Stopped job");
		}

		this.jobs.clear();
	}

	getJobStatus(): Record<JobName, JobState> {
		const result: Record<JobName, JobState> = {} as Record<JobName, JobState>;

		for (const jobName of JobNameSchema.options) {
			const state = this.state.get(jobName);
			const job = this.jobs.get(jobName);

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
			const today = new Date().toISOString().split("T")[0] ?? "";
			return job.run(symbols, today);
		});
	}

	private async runCorporateActionsJob(): Promise<BatchJobResult> {
		return this.executeJob("corporateActions", async (symbols) => {
			const job = new CorporateActionsBatchJob(
				this.deps.alpacaClient,
				this.deps.corporateActionsRepo,
				undefined,
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
