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
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDbClient } from "../db.js";
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
]);

const RunStatusSchema = z.enum(["pending", "running", "completed", "failed"]);

const ServiceDisplayNames: Record<z.infer<typeof WorkerServiceSchema>, string> = {
	macro_watch: "Macro Watch",
	newspaper: "Morning Newspaper",
	filings_sync: "Filings Sync",
	short_interest: "Short Interest",
	sentiment: "Sentiment",
	corporate_actions: "Corporate Actions",
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
	};
	return mapping[runType] ?? null;
}

function formatResult(row: {
	symbols_processed?: number;
	symbols_failed?: number;
	error_message?: string | null;
}): string | null {
	if (row.error_message) {
		return row.error_message;
	}
	if (row.symbols_processed !== undefined && row.symbols_processed > 0) {
		const failed = row.symbols_failed ?? 0;
		if (failed > 0) {
			return `${row.symbols_processed} processed, ${failed} failed`;
		}
		return `${row.symbols_processed} processed`;
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
		const db = await getDbClient();

		const allServices: WorkerService[] = [
			"macro_watch",
			"newspaper",
			"filings_sync",
			"short_interest",
			"sentiment",
			"corporate_actions",
		];

		// Get running services
		const runningRows = await db.execute(
			`SELECT run_type FROM indicator_sync_runs WHERE status = 'running'`
		);
		const runningServices = new Set(
			runningRows.map((row) => mapRunTypeToService(row.run_type as string)).filter(Boolean)
		);

		// Get last completed/failed run for each service
		const lastRunRows = await db.execute(`
			SELECT run_type, started_at, completed_at, status, symbols_processed, symbols_failed, error_message
			FROM indicator_sync_runs
			WHERE status IN ('completed', 'failed')
			AND (run_type, started_at) IN (
				SELECT run_type, MAX(started_at)
				FROM indicator_sync_runs
				WHERE status IN ('completed', 'failed')
				GROUP BY run_type
			)
		`);

		const lastRunByService = new Map<
			WorkerService,
			{
				startedAt: string;
				completedAt: string | null;
				status: "completed" | "failed";
				result: string | null;
			}
		>();

		for (const row of lastRunRows) {
			const service = mapRunTypeToService(row.run_type as string);
			if (service) {
				lastRunByService.set(service, {
					startedAt: row.started_at as string,
					completedAt: row.completed_at as string | null,
					status: row.status as "completed" | "failed",
					result: formatResult({
						symbols_processed: row.symbols_processed as number | undefined,
						symbols_failed: row.symbols_failed as number | undefined,
						error_message: row.error_message as string | null,
					}),
				});
			}
		}

		const services = allServices.map((name) => ({
			name,
			displayName: ServiceDisplayNames[name],
			status: runningServices.has(name) ? ("running" as const) : ("idle" as const),
			lastRun: lastRunByService.get(name) ?? null,
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
		const db = await getDbClient();

		// Check if service is already running
		const runningRows = await db.execute(
			`SELECT id FROM indicator_sync_runs
			 WHERE run_type = ? AND status IN ('running', 'pending')
			 LIMIT 1`,
			[service]
		);

		if (runningRows.length > 0) {
			throw new HTTPException(409, {
				message: `${ServiceDisplayNames[service]} is already running`,
			});
		}

		// Create a new run record with 'running' status
		const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const now = new Date().toISOString();

		await db.run(
			`INSERT INTO indicator_sync_runs
			 (id, run_type, started_at, status, symbols_processed, symbols_failed, environment, error_message)
			 VALUES (?, ?, ?, 'running', 0, 0, ?, NULL)`,
			[runId, service, now, environment]
		);

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

				await db.run(
					`UPDATE indicator_sync_runs
					 SET status = ?, completed_at = ?, symbols_processed = ?, symbols_failed = ?, error_message = ?
					 WHERE id = ?`,
					[
						status,
						completedAt,
						result.processed ?? 0,
						result.failed ?? 0,
						result.error ?? result.message ?? null,
						runId,
					]
				);

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
				await db.run(
					`UPDATE indicator_sync_runs
					 SET status = 'failed', completed_at = ?, error_message = ?
					 WHERE id = ?`,
					[failedAt, errorMessage, runId]
				);

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
		const db = await getDbClient();

		// Build dynamic query
		const conditions: string[] = [];
		const args: (string | number)[] = [];

		if (service) {
			conditions.push("run_type = ?");
			args.push(service);
		}
		if (status) {
			conditions.push("status = ?");
			args.push(status);
		}

		const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

		// Get runs
		const runsQuery = `
			SELECT id, run_type, started_at, completed_at, status,
			       symbols_processed, symbols_failed, error_message
			FROM indicator_sync_runs
			${whereClause}
			ORDER BY started_at DESC
			LIMIT ?
		`;
		args.push(limit);

		const rows = await db.execute(runsQuery, args);

		const runs = rows
			.map((row) => {
				const serviceName = mapRunTypeToService(row.run_type as string);
				if (!serviceName) {
					return null;
				}

				return {
					id: row.id as string,
					service: serviceName,
					status: row.status as z.infer<typeof RunStatusSchema>,
					startedAt: row.started_at as string,
					completedAt: row.completed_at as string | null,
					duration: calculateDuration(row.started_at as string, row.completed_at as string | null),
					result: formatResult({
						symbols_processed: row.symbols_processed as number | undefined,
						symbols_failed: row.symbols_failed as number | undefined,
						error_message: row.error_message as string | null,
					}),
					error: row.error_message as string | null,
				};
			})
			.filter((run): run is NonNullable<typeof run> => run !== null);

		// Get total count
		const countQuery = `SELECT COUNT(*) as total FROM indicator_sync_runs ${whereClause}`;
		const countRows = await db.execute(countQuery, args.slice(0, -1));
		const total = (countRows[0]?.total as number) ?? 0;

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
		const db = await getDbClient();

		const rows = await db.execute(
			`SELECT id, run_type, started_at, completed_at, status,
			        symbols_processed, symbols_failed, error_message
			 FROM indicator_sync_runs
			 WHERE id = ?`,
			[id]
		);

		const row = rows[0];
		if (!row) {
			throw new HTTPException(404, { message: `Run ${id} not found` });
		}

		const serviceName = mapRunTypeToService(row.run_type as string);
		if (!serviceName) {
			throw new HTTPException(404, { message: `Run ${id} has unknown service type` });
		}

		const run = {
			id: row.id as string,
			service: serviceName,
			status: row.status as z.infer<typeof RunStatusSchema>,
			startedAt: row.started_at as string,
			completedAt: row.completed_at as string | null,
			duration: calculateDuration(row.started_at as string, row.completed_at as string | null),
			result: formatResult({
				symbols_processed: row.symbols_processed as number | undefined,
				symbols_failed: row.symbols_failed as number | undefined,
				error_message: row.error_message as string | null,
			}),
			error: row.error_message as string | null,
		};

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

export default app;
