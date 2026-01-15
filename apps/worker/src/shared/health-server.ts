/**
 * Health Server
 *
 * HTTP endpoint for health checks and runtime status.
 */

import type { RuntimeEnvironment } from "@cream/config";
import type { JobState } from "../contexts/indicators/index.js";
import type { IndicatorSynthesisScheduler } from "../contexts/synthesis/index.js";
import { log } from "./logger.js";

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
	getRunningStatus: () => {
		tradingCycle: boolean;
		predictionMarkets: boolean;
		filingsSync: boolean;
	};
	getIndicatorJobStatus: () => Record<string, JobState> | null;
	getSynthesisScheduler: () => IndicatorSynthesisScheduler | null;
	getStartedAt: () => Date;
	onReload: () => Promise<void>;
}

const DEFAULT_PORT = 3002;

export function createHealthServer(deps: HealthServerDeps, port?: number) {
	const healthPort = port ?? Number(Bun.env.HEALTH_PORT ?? DEFAULT_PORT);

	function buildHealthResponse() {
		const intervals = deps.getIntervals();
		const indicatorJobs = deps.getIndicatorJobStatus();
		const synthesisScheduler = deps.getSynthesisScheduler();
		const startedAt = deps.getStartedAt();

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
			running: deps.getRunningStatus(),
			indicator_batch_jobs: formatIndicatorJobs(indicatorJobs),
			synthesis_scheduler: formatSynthesisScheduler(synthesisScheduler),
			started_at: startedAt.toISOString(),
		};
	}

	function start() {
		Bun.serve({
			port: healthPort,
			fetch(req) {
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
