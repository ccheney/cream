import type { IndicatorSyncRun, SyncRunType } from "@cream/storage";
import {
	getCorporateActionsRepo,
	getFilingsRepo,
	getIndicatorSyncRunsRepo,
	getMacroWatchRepo,
	getPredictionMarketsRepo,
	getSentimentRepo,
	getShortInterestRepo,
} from "../db.js";
import log from "../logger.js";
import { broadcastWorkerRunUpdate } from "../websocket/channels.js";

export type WorkerService =
	| "macro_watch"
	| "newspaper"
	| "filings_sync"
	| "short_interest"
	| "sentiment"
	| "corporate_actions"
	| "prediction_markets";

export const WORKER_URL = Bun.env.WORKER_URL ?? "http://localhost:3002";

export const ALL_SERVICES: WorkerService[] = [
	"macro_watch",
	"newspaper",
	"filings_sync",
	"short_interest",
	"sentiment",
	"corporate_actions",
	"prediction_markets",
];

export const ServiceDisplayNames: Record<WorkerService, string> = {
	macro_watch: "Macro Watch",
	newspaper: "Morning Newspaper",
	filings_sync: "Filings Sync",
	short_interest: "Short Interest",
	sentiment: "Sentiment",
	corporate_actions: "Corporate Actions",
	prediction_markets: "Prediction Markets",
};

export function mapRunTypeToService(runType: string): WorkerService | null {
	const mapping: Record<string, WorkerService> = {
		short_interest: "short_interest",
		sentiment: "sentiment",
		corporate_actions: "corporate_actions",
		macro_watch: "macro_watch",
		newspaper: "newspaper",
		filings_sync: "filings_sync",
		prediction_markets: "prediction_markets",
	};
	return mapping[runType] ?? null;
}

export function formatResult(run: IndicatorSyncRun): string | null {
	if (run.errorMessage) {
		return run.errorMessage;
	}
	if (run.symbolsProcessed > 0) {
		return run.symbolsFailed > 0
			? `${run.symbolsProcessed} processed, ${run.symbolsFailed} failed`
			: `${run.symbolsProcessed} processed`;
	}
	return null;
}

function calculateDuration(startedAt: string, completedAt: string | null): number | null {
	if (!completedAt) {
		return null;
	}
	return Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000);
}

export function mapRunToSchema(run: IndicatorSyncRun) {
	const service = mapRunTypeToService(run.runType);
	if (!service) {
		return null;
	}
	return {
		id: run.id,
		service,
		status: run.status as "running" | "completed" | "failed",
		startedAt: run.startedAt,
		completedAt: run.completedAt,
		duration: calculateDuration(run.startedAt, run.completedAt),
		result: formatResult(run),
		error: run.errorMessage,
	};
}

interface WorkerHealthResponse {
	next_run?: {
		macro_watch: string | null;
		prediction_markets: string | null;
		filings_sync: string | null;
	};
	indicator_batch_jobs?: Record<
		string,
		{
			next_run: string | null;
		}
	>;
}

async function fetchNextRunByService(): Promise<Map<WorkerService, string | null>> {
	const nextRunByService = new Map<WorkerService, string | null>();
	try {
		const healthResponse = await fetch(`${WORKER_URL}/health`);
		if (!healthResponse.ok) {
			return nextRunByService;
		}
		const health = (await healthResponse.json()) as WorkerHealthResponse;
		if (health.next_run) {
			nextRunByService.set("macro_watch", health.next_run.macro_watch);
			nextRunByService.set("newspaper", health.next_run.macro_watch);
			nextRunByService.set("filings_sync", health.next_run.filings_sync);
			nextRunByService.set("prediction_markets", health.next_run.prediction_markets);
		}
		if (health.indicator_batch_jobs) {
			const jobs = health.indicator_batch_jobs;
			if (jobs.shortInterest?.next_run) {
				nextRunByService.set("short_interest", jobs.shortInterest.next_run);
			}
			if (jobs.sentiment?.next_run) {
				nextRunByService.set("sentiment", jobs.sentiment.next_run);
			}
			if (jobs.corporateActions?.next_run) {
				nextRunByService.set("corporate_actions", jobs.corporateActions.next_run);
			}
		}
	} catch {
		log.debug({}, "Worker health endpoint not available, schedule info unavailable");
	}
	return nextRunByService;
}

export async function getWorkerStatusServices() {
	const syncRunsRepo = getIndicatorSyncRunsRepo();
	const runningRuns = await syncRunsRepo.findAllRunning();
	const runningServices = new Set(
		runningRuns
			.map((run) => mapRunTypeToService(run.runType))
			.filter((service): service is WorkerService => service !== null),
	);
	const lastRunByType = await syncRunsRepo.getLastRunByType();
	const lastRunByService = new Map<
		WorkerService,
		{
			startedAt: string;
			completedAt: string | null;
			status: "completed" | "failed";
			result: string | null;
		}
	>();
	for (const [runType, run] of lastRunByType) {
		const service = mapRunTypeToService(runType);
		if (!service) {
			continue;
		}
		lastRunByService.set(service, {
			startedAt: run.startedAt,
			completedAt: run.completedAt,
			status: run.status as "completed" | "failed",
			result: formatResult(run),
		});
	}
	const nextRunByService = await fetchNextRunByService();
	return ALL_SERVICES.map((name) => ({
		name,
		displayName: ServiceDisplayNames[name],
		status: runningServices.has(name) ? ("running" as const) : ("idle" as const),
		lastRun: lastRunByService.get(name) ?? null,
		nextRun: nextRunByService.get(name) ?? null,
	}));
}

function broadcastRunStarted(runId: string, service: WorkerService, now: string): void {
	broadcastWorkerRunUpdate({
		type: "worker_run_update",
		data: {
			runId,
			service,
			status: "running",
			startedAt: now,
			completedAt: null,
			duration: null,
			result: null,
			error: null,
			timestamp: now,
		},
	});
}

async function completeRun(
	runId: string,
	service: WorkerService,
	now: string,
	result: {
		success: boolean;
		message: string;
		processed?: number;
		failed?: number;
		durationMs?: number;
		error?: string;
	},
): Promise<void> {
	const syncRunsRepo = getIndicatorSyncRunsRepo();
	const completedAt = new Date().toISOString();
	const status = result.success ? "completed" : "failed";
	await syncRunsRepo.update(runId, {
		status,
		symbolsProcessed: result.processed ?? 0,
		symbolsFailed: result.failed ?? 0,
		errorMessage: result.error ?? result.message ?? undefined,
	});
	const durationMs = result.durationMs ?? Date.now() - new Date(now).getTime();
	broadcastWorkerRunUpdate({
		type: "worker_run_update",
		data: {
			runId,
			service,
			status,
			startedAt: now,
			completedAt,
			duration: Math.round(durationMs / 1000),
			result: result.message,
			error: result.error ?? null,
			timestamp: completedAt,
		},
	});
	log.info(
		{ runId, service, status, processed: result.processed, failed: result.failed },
		"Worker service trigger completed",
	);
}

async function failRun(
	runId: string,
	service: WorkerService,
	now: string,
	error: unknown,
): Promise<void> {
	const syncRunsRepo = getIndicatorSyncRunsRepo();
	const errorMessage = error instanceof Error ? error.message : "Unknown error";
	await syncRunsRepo.update(runId, { status: "failed", errorMessage });
	const failedAt = new Date().toISOString();
	broadcastWorkerRunUpdate({
		type: "worker_run_update",
		data: {
			runId,
			service,
			status: "failed",
			startedAt: now,
			completedAt: failedAt,
			duration: Math.round((Date.now() - new Date(now).getTime()) / 1000),
			result: null,
			error: errorMessage,
			timestamp: failedAt,
		},
	});
	log.error({ runId, service, error: errorMessage }, "Worker service trigger failed");
}

export async function triggerWorkerService(
	service: WorkerService,
	priority: "normal" | "high",
	environment: string,
): Promise<{ runId: string }> {
	const syncRunsRepo = getIndicatorSyncRunsRepo();
	const runningRun = await syncRunsRepo.findRunningByType(service as SyncRunType);
	if (runningRun) {
		const error = new Error(`${ServiceDisplayNames[service]} is already running`);
		(error as Error & { code?: number }).code = 409;
		throw error;
	}
	const now = new Date().toISOString();
	const createdRun = await syncRunsRepo.create({ runType: service as SyncRunType, environment });
	const runId = createdRun.id;
	log.info({ runId, service, priority, environment }, "Worker service trigger starting");
	broadcastRunStarted(runId, service, now);

	void (async () => {
		try {
			const response = await fetch(`${WORKER_URL}/trigger/${service}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});
			const result = (await response.json()) as {
				success: boolean;
				message: string;
				processed?: number;
				failed?: number;
				durationMs?: number;
				error?: string;
			};
			await completeRun(runId, service, now, result);
		} catch (error) {
			await failRun(runId, service, now, error);
		}
	})();

	return { runId };
}

const SIGNAL_TYPE_LABELS: Record<string, string> = {
	fed_cut_probability: "Fed Cut Probability",
	fed_hike_probability: "Fed Hike Probability",
	recession_12m: "Recession (12m)",
	macro_uncertainty: "Macro Uncertainty",
	policy_event_risk: "Policy Event Risk",
	cpi_surprise: "CPI Surprise",
	gdp_surprise: "GDP Surprise",
	shutdown_probability: "Shutdown Probability",
	tariff_escalation: "Tariff Escalation",
};

export async function getRunDetailsData(
	service: WorkerService,
	startedAt: string,
	completedAt: string,
): Promise<unknown> {
	const detailsFetcher = runDetailsFetchers[service];
	if (!detailsFetcher) {
		return { type: "empty" as const, message: "No data available for this service type" };
	}
	return detailsFetcher(startedAt, completedAt);
}

type DetailsFetcher = (startedAt: string, completedAt: string) => Promise<unknown>;

async function getMacroWatchDetails(startedAt: string, completedAt: string): Promise<unknown> {
	const entries = await getMacroWatchRepo().findByCreatedAtRange(startedAt, completedAt, 100);
	return {
		type: "macro_watch" as const,
		entries: entries.map((e) => ({
			id: e.id,
			timestamp: e.timestamp,
			session: e.session,
			category: e.category,
			headline: e.headline,
			symbols: e.symbols,
			source: e.source,
		})),
	};
}

async function getNewspaperDetails(startedAt: string, completedAt: string): Promise<unknown> {
	const newspaper = await getMacroWatchRepo().getNewspaperByCompiledAtRange(startedAt, completedAt);
	if (!newspaper) {
		return { type: "empty" as const, message: "No newspaper compiled in this run" };
	}

	return {
		type: "newspaper" as const,
		newspaper: {
			id: newspaper.id,
			date: newspaper.date,
			compiledAt: newspaper.compiledAt,
			sections: newspaper.sections,
			entryCount: newspaper.rawEntryIds.length,
		},
	};
}

async function getShortInterestDetails(startedAt: string, completedAt: string): Promise<unknown> {
	const entries = await getShortInterestRepo().findByFetchedAtRange(startedAt, completedAt, 100);
	return {
		type: "indicators" as const,
		entries: entries.map((e) => ({
			symbol: e.symbol,
			date: e.settlementDate,
			values: {
				shortInterest: e.shortInterest,
				shortInterestRatio: e.shortInterestRatio,
				daysToCover: e.daysToCover,
				shortPctFloat: e.shortPctFloat,
			},
		})),
	};
}

async function getSentimentDetails(startedAt: string, completedAt: string): Promise<unknown> {
	const entries = await getSentimentRepo().findByComputedAtRange(startedAt, completedAt, 100);
	return {
		type: "indicators" as const,
		entries: entries.map((e) => ({
			symbol: e.symbol,
			date: e.date,
			values: {
				sentimentScore: e.sentimentScore,
				sentimentStrength: e.sentimentStrength,
				newsVolume: e.newsVolume,
			},
		})),
	};
}

async function getCorporateActionsDetails(
	startedAt: string,
	completedAt: string,
): Promise<unknown> {
	const entries = await getCorporateActionsRepo().findByCreatedAtRange(startedAt, completedAt, 100);
	return {
		type: "indicators" as const,
		entries: entries.map((e) => ({
			symbol: e.symbol,
			date: e.exDate,
			values: {
				actionType: e.actionType,
				recordDate: e.recordDate,
				payDate: e.payDate,
				ratio: e.ratio,
				amount: e.amount,
			},
		})),
	};
}

async function getFilingsDetails(startedAt: string, completedAt: string): Promise<unknown> {
	const entries = await getFilingsRepo().findByCreatedAtRange(startedAt, completedAt, 100);
	return {
		type: "indicators" as const,
		entries: entries.map((e) => ({
			symbol: e.symbol,
			date: e.filedDate,
			values: {
				formType: e.filingType,
				accessionNumber: e.accessionNumber,
			},
		})),
	};
}

async function getPredictionMarketsDetails(
	startedAt: string,
	completedAt: string,
): Promise<unknown> {
	const repo = getPredictionMarketsRepo();
	const [signals, snapshots] = await Promise.all([
		repo.findSignals({ fromTime: startedAt, toTime: completedAt }, 50),
		repo.findSnapshots({ fromTime: startedAt, toTime: completedAt }, 100),
	]);

	return {
		type: "prediction_markets" as const,
		signals: signals.map((s) => ({
			signalType: SIGNAL_TYPE_LABELS[s.signalType] ?? s.signalType,
			signalValue: s.signalValue,
			confidence: s.confidence,
			computedAt: s.computedAt,
		})),
		snapshotCount: snapshots.length,
		platforms: [...new Set(snapshots.map((s) => s.platform))],
	};
}

const runDetailsFetchers: Partial<Record<WorkerService, DetailsFetcher>> = {
	macro_watch: getMacroWatchDetails,
	newspaper: getNewspaperDetails,
	short_interest: getShortInterestDetails,
	sentiment: getSentimentDetails,
	corporate_actions: getCorporateActionsDetails,
	filings_sync: getFilingsDetails,
	prediction_markets: getPredictionMarketsDetails,
};
