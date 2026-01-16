/**
 * Health Server
 *
 * HTTP endpoint for health checks, runtime status, and service triggers.
 */

import type { RuntimeEnvironment } from "@cream/config";
import type { JobState } from "../contexts/indicators/index.js";
import type { IndicatorSynthesisScheduler } from "../contexts/synthesis/index.js";
import { log } from "./logger.js";

// ============================================
// Service Trigger Types
// ============================================

export type WorkerService =
	| "macro_watch"
	| "newspaper"
	| "filings_sync"
	| "short_interest"
	| "sentiment"
	| "corporate_actions";

export interface TriggerResult {
	success: boolean;
	message: string;
	processed?: number;
	failed?: number;
	durationMs?: number;
	error?: string;
}

export interface ServiceTriggers {
	triggerMacroWatch: () => Promise<TriggerResult>;
	triggerNewspaper: () => Promise<TriggerResult>;
	triggerFilingsSync: () => Promise<TriggerResult>;
	triggerShortInterest: () => Promise<TriggerResult>;
	triggerSentiment: () => Promise<TriggerResult>;
	triggerCorporateActions: () => Promise<TriggerResult>;
}

// ============================================
// Health Server Deps
// ============================================

export interface NextRunTimes {
	tradingCycle: Date | null;
	predictionMarkets: Date | null;
	filingsSync: Date | null;
}

export interface HealthServerDeps {
	getEnvironment: () => RuntimeEnvironment;
	getConfigId: () => string;
	getIntervals: () => {
		tradingCycleIntervalMs: number;
		predictionMarketsIntervalMs: number;
	};
	getInstruments: () => string[];
	getLastRun: () => {
		tradingCycle: Date | null;
		predictionMarkets: Date | null;
		filingsSync: Date | null;
	};
	getNextRun: () => NextRunTimes | null;
	getRunningStatus: () => {
		tradingCycle: boolean;
		predictionMarkets: boolean;
		filingsSync: boolean;
		macroWatch: boolean;
		newspaper: boolean;
	};
	getIndicatorJobStatus: () => Record<string, JobState> | null;
	getSynthesisScheduler: () => IndicatorSynthesisScheduler | null;
	getStartedAt: () => Date;
	onReload: () => Promise<void>;
	triggers?: ServiceTriggers;
}

const DEFAULT_PORT = 3002;

export function createHealthServer(deps: HealthServerDeps, port?: number) {
	const healthPort = port ?? Number(Bun.env.HEALTH_PORT ?? DEFAULT_PORT);

	function buildHealthResponse() {
		const intervals = deps.getIntervals();
		const indicatorJobs = deps.getIndicatorJobStatus();
		const synthesisScheduler = deps.getSynthesisScheduler();
		const startedAt = deps.getStartedAt();
		const nextRun = deps.getNextRun();

		return {
			status: "ok",
			uptime_ms: Date.now() - startedAt.getTime(),
			environment: deps.getEnvironment(),
			config_id: deps.getConfigId(),
			intervals: {
				trading_cycle_ms: intervals.tradingCycleIntervalMs,
				prediction_markets_ms: intervals.predictionMarketsIntervalMs,
			},
			instruments: deps.getInstruments(),
			last_run: formatLastRun(deps.getLastRun()),
			next_run: nextRun ? formatNextRun(nextRun) : null,
			running: deps.getRunningStatus(),
			indicator_batch_jobs: formatIndicatorJobs(indicatorJobs),
			synthesis_scheduler: formatSynthesisScheduler(synthesisScheduler),
			started_at: startedAt.toISOString(),
		};
	}

	const serviceTriggerMap: Record<WorkerService, (() => Promise<TriggerResult>) | undefined> = {
		macro_watch: deps.triggers?.triggerMacroWatch,
		newspaper: deps.triggers?.triggerNewspaper,
		filings_sync: deps.triggers?.triggerFilingsSync,
		short_interest: deps.triggers?.triggerShortInterest,
		sentiment: deps.triggers?.triggerSentiment,
		corporate_actions: deps.triggers?.triggerCorporateActions,
	};

	async function handleTrigger(service: WorkerService): Promise<Response> {
		const trigger = serviceTriggerMap[service];
		if (!trigger) {
			return new Response(JSON.stringify({ error: "Service triggers not configured" }), {
				status: 503,
				headers: { "Content-Type": "application/json" },
			});
		}

		try {
			log.info({ service }, "Service trigger requested via HTTP");
			const result = await trigger();
			log.info({ service, result }, "Service trigger completed");

			return new Response(JSON.stringify(result), {
				status: result.success ? 200 : 500,
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			log.error({ service, error: message }, "Service trigger failed");

			return new Response(JSON.stringify({ success: false, message, error: message }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			});
		}
	}

	function start() {
		Bun.serve({
			port: healthPort,
			async fetch(req) {
				const url = new URL(req.url);

				if (url.pathname === "/health" || url.pathname === "/") {
					const health = buildHealthResponse();
					return new Response(JSON.stringify(health, null, 2), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				}

				if (url.pathname === "/reload") {
					if (req.method === "POST") {
						deps.onReload().catch(() => {});
						return new Response(JSON.stringify({ status: "reloading" }), {
							status: 202,
							headers: { "Content-Type": "application/json" },
						});
					}
					return new Response("Method not allowed", { status: 405 });
				}

				// Service trigger endpoints: POST /trigger/:service
				const triggerMatch = url.pathname.match(/^\/trigger\/([a-z_]+)$/);
				if (triggerMatch) {
					if (req.method !== "POST") {
						return new Response("Method not allowed", { status: 405 });
					}

					const service = triggerMatch[1] as WorkerService;
					const validServices: WorkerService[] = [
						"macro_watch",
						"newspaper",
						"filings_sync",
						"short_interest",
						"sentiment",
						"corporate_actions",
					];

					if (!validServices.includes(service)) {
						return new Response(JSON.stringify({ error: `Unknown service: ${service}` }), {
							status: 400,
							headers: { "Content-Type": "application/json" },
						});
					}

					return handleTrigger(service);
				}

				return new Response("Not found", { status: 404 });
			},
		});

		log.info({ port: healthPort }, "Health endpoint listening");
	}

	return { start, buildHealthResponse };
}

function formatLastRun(lastRun: {
	tradingCycle: Date | null;
	predictionMarkets: Date | null;
	filingsSync: Date | null;
}) {
	return {
		trading_cycle: lastRun.tradingCycle?.toISOString() ?? null,
		prediction_markets: lastRun.predictionMarkets?.toISOString() ?? null,
		filings_sync: lastRun.filingsSync?.toISOString() ?? null,
	};
}

function formatNextRun(nextRun: NextRunTimes) {
	return {
		trading_cycle: nextRun.tradingCycle?.toISOString() ?? null,
		prediction_markets: nextRun.predictionMarkets?.toISOString() ?? null,
		filings_sync: nextRun.filingsSync?.toISOString() ?? null,
	};
}

function formatIndicatorJobs(jobs: Record<string, JobState> | null) {
	if (!jobs) {
		return null;
	}

	return Object.fromEntries(
		Object.entries(jobs).map(([name, job]) => [
			name,
			{
				status: job.status,
				last_run: job.lastRun?.toISOString() ?? null,
				next_run: job.nextRun?.toISOString() ?? null,
				run_count: job.runCount,
				last_error: job.lastError,
				last_result: job.lastResult
					? {
							processed: job.lastResult.processed,
							failed: job.lastResult.failed,
							duration_ms: job.lastResult.durationMs,
						}
					: null,
			},
		])
	);
}

function formatSynthesisScheduler(scheduler: IndicatorSynthesisScheduler | null) {
	if (!scheduler) {
		return { enabled: false };
	}

	const state = scheduler.getState();
	return {
		enabled: true,
		last_run: state.lastRun?.toISOString() ?? null,
		next_run: state.nextRun?.toISOString() ?? null,
		run_count: state.runCount,
		last_trigger_result: state.lastTriggerResult,
		last_error: state.lastError,
	};
}
