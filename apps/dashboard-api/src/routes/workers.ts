/**
 * Worker Services API Routes
 *
 * Endpoints for managing and triggering worker services:
 * - macro_watch: Overnight market scan
 * - newspaper: Morning newspaper compilation
 * - filings_sync: SEC EDGAR filing sync
 * - short_interest: FINRA short interest fetch
 * - sentiment: Sentiment data fetch
 * - corporate_actions: Corporate actions fetch
 *
 * @see docs/plans/ui/35-worker-services-page.md
 */

import { requireEnv } from "@cream/domain";
import type { IndicatorSyncRun, SyncRunStatus, SyncRunType } from "@cream/storage";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
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

const app = new OpenAPIHono();

// ============================================
// Worker Service URL
// ============================================

const WORKER_URL = Bun.env.WORKER_URL ?? "http://localhost:3002";

// ============================================
// Schema Definitions
// ============================================

const WorkerServiceSchema = z.enum([
	"macro_watch",
	"newspaper",
	"filings_sync",
	"short_interest",
	"sentiment",
	"corporate_actions",
	"prediction_markets",
]);

const RunStatusSchema = z.enum(["running", "completed", "failed"]);

const ServiceDisplayNames: Record<z.infer<typeof WorkerServiceSchema>, string> = {
	macro_watch: "Macro Watch",
	newspaper: "Morning Newspaper",
	filings_sync: "Filings Sync",
	short_interest: "Short Interest",
	sentiment: "Sentiment",
	corporate_actions: "Corporate Actions",
	prediction_markets: "Prediction Markets",
};

const LastRunSchema = z.object({
	startedAt: z.string(),
	completedAt: z.string().nullable(),
	status: z.enum(["completed", "failed"]),
	result: z.string().nullable(),
});

const ServiceStatusSchema = z.object({
	name: WorkerServiceSchema,
	displayName: z.string(),
	status: z.enum(["idle", "running"]),
	lastRun: LastRunSchema.nullable(),
	nextRun: z.string().nullable(),
});

const WorkerStatusResponseSchema = z.object({
	services: z.array(ServiceStatusSchema),
});

const TriggerRequestSchema = z.object({
	symbols: z.array(z.string()).min(1).max(500).optional(),
	priority: z.enum(["normal", "high"]).default("normal"),
});

const TriggerResponseSchema = z.object({
	runId: z.string(),
	status: z.enum(["started", "already_running"]),
	message: z.string(),
});

const WorkerRunSchema = z.object({
	id: z.string(),
	service: WorkerServiceSchema,
	status: RunStatusSchema,
	startedAt: z.string(),
	completedAt: z.string().nullable(),
	duration: z.number().nullable(),
	result: z.string().nullable(),
	error: z.string().nullable(),
});

const WorkerRunsResponseSchema = z.object({
	runs: z.array(WorkerRunSchema),
	total: z.number(),
});

const ErrorSchema = z.object({
	error: z.string(),
	message: z.string(),
});

type WorkerService = z.infer<typeof WorkerServiceSchema>;

// ============================================
// Helper Functions
// ============================================

function mapRunTypeToService(runType: string): WorkerService | null {
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

function formatResult(run: IndicatorSyncRun): string | null {
	if (run.errorMessage) {
		return run.errorMessage;
	}
	if (run.symbolsProcessed > 0) {
		if (run.symbolsFailed > 0) {
			return `${run.symbolsProcessed} processed, ${run.symbolsFailed} failed`;
		}
		return `${run.symbolsProcessed} processed`;
	}
	return null;
}

function calculateDuration(startedAt: string, completedAt: string | null): number | null {
	if (!completedAt) {
		return null;
	}
	const start = new Date(startedAt).getTime();
	const end = new Date(completedAt).getTime();
	return Math.round((end - start) / 1000);
}

function mapRunToSchema(run: IndicatorSyncRun) {
	const serviceName = mapRunTypeToService(run.runType);
	if (!serviceName) {
		return null;
	}

	return {
		id: run.id,
		service: serviceName,
		status: run.status as z.infer<typeof RunStatusSchema>,
		startedAt: run.startedAt,
		completedAt: run.completedAt,
		duration: calculateDuration(run.startedAt, run.completedAt),
		result: formatResult(run),
		error: run.errorMessage,
	};
}

// ============================================
// GET /status - Worker Services Status
// ============================================

const getWorkerStatusRoute = createRoute({
	method: "get",
	path: "/status",
	responses: {
		200: {
			content: { "application/json": { schema: WorkerStatusResponseSchema } },
			description: "Status of all worker services",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Database service unavailable",
		},
	},
	tags: ["Workers"],
});

app.openapi(getWorkerStatusRoute, async (c) => {
	try {
		const syncRunsRepo = getIndicatorSyncRunsRepo();

		const allServices: WorkerService[] = [
			"macro_watch",
			"newspaper",
			"filings_sync",
			"short_interest",
			"sentiment",
			"corporate_actions",
			"prediction_markets",
		];

		// Get running services
		const runningRuns = await syncRunsRepo.findAllRunning();
		const runningServices = new Set(
			runningRuns
				.map((run) => mapRunTypeToService(run.runType))
				.filter((s): s is WorkerService => s !== null)
		);

		// Get last completed/failed run for each service
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
			if (service) {
				lastRunByService.set(service, {
					startedAt: run.startedAt,
					completedAt: run.completedAt,
					status: run.status as "completed" | "failed",
					result: formatResult(run),
				});
			}
		}

		// Fetch next run times from worker health endpoint
		const nextRunByService = new Map<WorkerService, string | null>();
		try {
			const healthResponse = await fetch(`${WORKER_URL}/health`);
			if (healthResponse.ok) {
				const health = (await healthResponse.json()) as {
					next_run?: {
						trading_cycle: string | null;
						prediction_markets: string | null;
						filings_sync: string | null;
					};
					indicator_batch_jobs?: Record<
						string,
						{
							next_run: string | null;
						}
					>;
				};

				if (health.next_run) {
					// macro_watch and newspaper run on trading cycle schedule
					nextRunByService.set("macro_watch", health.next_run.trading_cycle);
					nextRunByService.set("newspaper", health.next_run.trading_cycle);
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
			}
		} catch {
			// Worker not available, continue without schedule info
			log.debug({}, "Worker health endpoint not available, schedule info unavailable");
		}

		const services = allServices.map((name) => ({
			name,
			displayName: ServiceDisplayNames[name],
			status: runningServices.has(name) ? ("running" as const) : ("idle" as const),
			lastRun: lastRunByService.get(name) ?? null,
			nextRun: nextRunByService.get(name) ?? null,
		}));

		return c.json({ services }, 200);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, {
			message: `Failed to fetch worker status: ${message}`,
		});
	}
});

// ============================================
// POST /:service/trigger - Trigger a Service
// ============================================

const triggerServiceRoute = createRoute({
	method: "post",
	path: "/:service/trigger",
	request: {
		params: z.object({
			service: WorkerServiceSchema,
		}),
		body: {
			content: {
				"application/json": {
					schema: TriggerRequestSchema,
				},
			},
			required: false,
		},
	},
	responses: {
		202: {
			content: { "application/json": { schema: TriggerResponseSchema } },
			description: "Service trigger request accepted",
		},
		409: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Service already running",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Database service unavailable",
		},
	},
	tags: ["Workers"],
});

app.openapi(triggerServiceRoute, async (c) => {
	const { service } = c.req.valid("param");
	const body = await c.req.json().catch(() => ({}));
	const { priority = "normal" } = TriggerRequestSchema.parse(body);
	const environment = requireEnv();

	try {
		const syncRunsRepo = getIndicatorSyncRunsRepo();

		// Check if service is already running
		const runningRun = await syncRunsRepo.findRunningByType(service as SyncRunType);

		if (runningRun) {
			throw new HTTPException(409, {
				message: `${ServiceDisplayNames[service]} is already running`,
			});
		}

		// Create a new run record with 'running' status (id auto-generated as uuidv7)
		const now = new Date().toISOString();

		const createdRun = await syncRunsRepo.create({
			runType: service as SyncRunType,
			environment,
		});
		const runId = createdRun.id;

		log.info({ runId, service, priority, environment }, "Worker service trigger starting");

		// Broadcast run started via websocket
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

		// Call the worker's trigger endpoint (fire and forget with background update)
		const workerUrl = `${WORKER_URL}/trigger/${service}`;

		// Execute async - don't wait for completion
		(async () => {
			try {
				const response = await fetch(workerUrl, {
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

				const completedAt = new Date().toISOString();
				const status = result.success ? "completed" : "failed";

				await syncRunsRepo.update(runId, {
					status: status as "completed" | "failed",
					symbolsProcessed: result.processed ?? 0,
					symbolsFailed: result.failed ?? 0,
					errorMessage: result.error ?? result.message ?? undefined,
				});

				log.info(
					{ runId, service, status, processed: result.processed, failed: result.failed },
					"Worker service trigger completed"
				);

				// Broadcast run completed via websocket
				const durationMs = result.durationMs ?? Date.now() - new Date(now).getTime();
				broadcastWorkerRunUpdate({
					type: "worker_run_update",
					data: {
						runId,
						service,
						status: status as "completed" | "failed",
						startedAt: now,
						completedAt,
						duration: Math.round(durationMs / 1000),
						result: result.message,
						error: result.error ?? null,
						timestamp: completedAt,
					},
				});
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "Unknown error";
				log.error({ runId, service, error: errorMessage }, "Worker service trigger failed");

				const failedAt = new Date().toISOString();
				await syncRunsRepo.update(runId, {
					status: "failed",
					errorMessage,
				});

				// Broadcast run failed via websocket
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
			}
		})();

		return c.json(
			{
				runId,
				status: "started" as const,
				message: `${ServiceDisplayNames[service]} triggered`,
			},
			202
		);
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		const message = error instanceof Error ? error.message : "Unknown error";
		log.error({ service, error: message }, "Failed to trigger worker service");
		throw new HTTPException(503, {
			message: `Failed to trigger service: ${message}`,
		});
	}
});

// ============================================
// GET /runs - Recent Worker Runs
// ============================================

const getWorkerRunsRoute = createRoute({
	method: "get",
	path: "/runs",
	request: {
		query: z.object({
			limit: z.coerce.number().min(1).max(100).default(20),
			service: WorkerServiceSchema.optional(),
			status: RunStatusSchema.optional(),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: WorkerRunsResponseSchema } },
			description: "Recent worker runs",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Database service unavailable",
		},
	},
	tags: ["Workers"],
});

app.openapi(getWorkerRunsRoute, async (c) => {
	const { limit, service, status } = c.req.valid("query");

	try {
		const syncRunsRepo = getIndicatorSyncRunsRepo();

		const filters = {
			runType: service as SyncRunType | undefined,
			status: status as SyncRunStatus | undefined,
		};

		const syncRuns = await syncRunsRepo.findMany(filters, limit);
		const total = await syncRunsRepo.countByFilters(filters);

		const runs = syncRuns
			.map(mapRunToSchema)
			.filter((run): run is NonNullable<typeof run> => run !== null);

		return c.json({ runs, total }, 200);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, {
			message: `Failed to fetch worker runs: ${message}`,
		});
	}
});

// ============================================
// GET /runs/:id - Single Run Detail
// ============================================

const getWorkerRunRoute = createRoute({
	method: "get",
	path: "/runs/:id",
	request: {
		params: z.object({
			id: z.string(),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: z.object({ run: WorkerRunSchema }) } },
			description: "Worker run details",
		},
		404: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Run not found",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Database service unavailable",
		},
	},
	tags: ["Workers"],
});

app.openapi(getWorkerRunRoute, async (c) => {
	const { id } = c.req.valid("param");

	try {
		const syncRunsRepo = getIndicatorSyncRunsRepo();

		const syncRun = await syncRunsRepo.findById(id);
		if (!syncRun) {
			throw new HTTPException(404, { message: `Run ${id} not found` });
		}

		const run = mapRunToSchema(syncRun);
		if (!run) {
			throw new HTTPException(404, { message: `Run ${id} has unknown service type` });
		}

		return c.json({ run }, 200);
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, {
			message: `Failed to fetch run: ${message}`,
		});
	}
});

// ============================================
// GET /runs/:id/details - Run Details with Data
// ============================================

const MacroWatchEntrySchema = z.object({
	id: z.string(),
	timestamp: z.string(),
	session: z.string(),
	category: z.string(),
	headline: z.string(),
	symbols: z.array(z.string()),
	source: z.string(),
});

const NewspaperSchema = z.object({
	id: z.string(),
	date: z.string(),
	compiledAt: z.string(),
	sections: z.record(z.string(), z.unknown()),
	entryCount: z.number(),
});

const IndicatorEntrySchema = z.object({
	symbol: z.string(),
	date: z.string(),
	values: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
});

const PredictionMarketSignalSchema = z.object({
	signalType: z.string(),
	signalValue: z.number(),
	confidence: z.number().nullable(),
	computedAt: z.string(),
});

const RunDetailsResponseSchema = z.object({
	run: WorkerRunSchema,
	data: z.union([
		z.object({ type: z.literal("macro_watch"), entries: z.array(MacroWatchEntrySchema) }),
		z.object({ type: z.literal("newspaper"), newspaper: NewspaperSchema.nullable() }),
		z.object({ type: z.literal("indicators"), entries: z.array(IndicatorEntrySchema) }),
		z.object({
			type: z.literal("prediction_markets"),
			signals: z.array(PredictionMarketSignalSchema),
			snapshotCount: z.number(),
			platforms: z.array(z.string()),
		}),
		z.object({ type: z.literal("empty"), message: z.string() }),
	]),
});

const getRunDetailsRoute = createRoute({
	method: "get",
	path: "/runs/:id/details",
	request: {
		params: z.object({
			id: z.string(),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: RunDetailsResponseSchema } },
			description: "Run details with associated data",
		},
		404: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Run not found",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Database service unavailable",
		},
	},
	tags: ["Workers"],
});

app.openapi(getRunDetailsRoute, async (c) => {
	const { id } = c.req.valid("param");

	try {
		const syncRunsRepo = getIndicatorSyncRunsRepo();

		// Fetch the run
		const syncRun = await syncRunsRepo.findById(id);
		if (!syncRun) {
			throw new HTTPException(404, { message: `Run ${id} not found` });
		}

		const run = mapRunToSchema(syncRun);
		if (!run) {
			throw new HTTPException(404, { message: `Run ${id} has unknown service type` });
		}

		const startedAt = syncRun.startedAt;
		const completedAt = syncRun.completedAt ?? new Date().toISOString();

		// Fetch associated data based on service type
		switch (run.service) {
			case "macro_watch": {
				const macroWatchRepo = getMacroWatchRepo();
				// Query entries created during this specific run's time window
				const entries = await macroWatchRepo.findByCreatedAtRange(startedAt, completedAt, 100);

				return c.json(
					{
						run,
						data: {
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
						},
					},
					200
				);
			}

			case "newspaper": {
				const macroWatchRepo = getMacroWatchRepo();
				const newspaper = await macroWatchRepo.getNewspaperByCompiledAtRange(
					startedAt,
					completedAt
				);

				if (!newspaper) {
					return c.json(
						{
							run,
							data: { type: "empty" as const, message: "No newspaper compiled in this run" },
						},
						200
					);
				}

				return c.json(
					{
						run,
						data: {
							type: "newspaper" as const,
							newspaper: {
								id: newspaper.id,
								date: newspaper.date,
								compiledAt: newspaper.compiledAt,
								sections: newspaper.sections,
								entryCount: newspaper.rawEntryIds.length,
							},
						},
					},
					200
				);
			}

			case "short_interest": {
				const shortInterestRepo = getShortInterestRepo();
				const entries = await shortInterestRepo.findByFetchedAtRange(startedAt, completedAt, 100);

				return c.json(
					{
						run,
						data: {
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
						},
					},
					200
				);
			}

			case "sentiment": {
				const sentimentRepo = getSentimentRepo();
				const entries = await sentimentRepo.findByComputedAtRange(startedAt, completedAt, 100);

				return c.json(
					{
						run,
						data: {
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
						},
					},
					200
				);
			}

			case "corporate_actions": {
				const corporateActionsRepo = getCorporateActionsRepo();
				const entries = await corporateActionsRepo.findByCreatedAtRange(
					startedAt,
					completedAt,
					100
				);

				return c.json(
					{
						run,
						data: {
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
						},
					},
					200
				);
			}

			case "filings_sync": {
				const filingsRepo = getFilingsRepo();
				const entries = await filingsRepo.findByCreatedAtRange(startedAt, completedAt, 100);

				return c.json(
					{
						run,
						data: {
							type: "indicators" as const,
							entries: entries.map((e) => ({
								symbol: e.symbol,
								date: e.filedDate,
								values: {
									formType: e.filingType,
									accessionNumber: e.accessionNumber,
								},
							})),
						},
					},
					200
				);
			}

			case "prediction_markets": {
				const predictionMarketsRepo = getPredictionMarketsRepo();
				const signals = await predictionMarketsRepo.findSignals(
					{ fromTime: startedAt, toTime: completedAt },
					50
				);
				const snapshots = await predictionMarketsRepo.findSnapshots(
					{ fromTime: startedAt, toTime: completedAt },
					100
				);

				// Get unique platforms from snapshots
				const platforms = [...new Set(snapshots.map((s) => s.platform))];

				// Format signal types for display
				const signalTypeLabels: Record<string, string> = {
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

				return c.json(
					{
						run,
						data: {
							type: "prediction_markets" as const,
							signals: signals.map((s) => ({
								signalType: signalTypeLabels[s.signalType] ?? s.signalType,
								signalValue: s.signalValue,
								confidence: s.confidence,
								computedAt: s.computedAt,
							})),
							snapshotCount: snapshots.length,
							platforms,
						},
					},
					200
				);
			}

			default:
				return c.json(
					{
						run,
						data: { type: "empty" as const, message: "No data available for this service type" },
					},
					200
				);
		}
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, {
			message: `Failed to fetch run details: ${message}`,
		});
	}
});

export default app;
