/**
 * Batch Status API Routes
 *
 * Endpoint for retrieving indicator batch job status from the
 * indicator_sync_runs table.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getIndicatorSyncRunsRepo } from "../db.js";

const app = new OpenAPIHono();

// ============================================
// Schema Definitions
// ============================================

const SyncRunTypeSchema = z.enum([
	"fundamentals",
	"short_interest",
	"sentiment",
	"corporate_actions",
]);

const SyncRunStatusSchema = z.enum(["running", "completed", "failed"]);

const SyncRunSchema = z.object({
	id: z.string(),
	run_type: SyncRunTypeSchema,
	started_at: z.string(),
	completed_at: z.string().nullable(),
	symbols_processed: z.number(),
	symbols_failed: z.number(),
	status: SyncRunStatusSchema,
	error_message: z.string().nullable(),
	environment: z.string(),
});

const BatchStatusResponseSchema = z.object({
	runs: z.array(SyncRunSchema),
	summary: z.object({
		total_runs: z.number(),
		running: z.number(),
		completed: z.number(),
		failed: z.number(),
		last_completed: z.record(SyncRunTypeSchema, z.string().nullable()),
	}),
});

const ErrorSchema = z.object({
	error: z.string(),
	message: z.string(),
});

// ============================================
// Route Definition
// ============================================

const getBatchStatusRoute = createRoute({
	method: "get",
	path: "/batch/status",
	request: {
		query: z.object({
			limit: z.coerce.number().min(1).max(100).default(20),
			type: SyncRunTypeSchema.optional(),
			status: SyncRunStatusSchema.optional(),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: BatchStatusResponseSchema } },
			description: "Recent batch job runs with summary",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Database service unavailable",
		},
	},
	tags: ["Indicators"],
});

app.openapi(getBatchStatusRoute, async (c) => {
	const { limit, type, status } = c.req.valid("query");

	try {
		const repo = getIndicatorSyncRunsRepo();

		const runs = await repo.findMany(
			{
				runType: type,
				status: status,
			},
			limit
		);

		const summary = await repo.getSummary();

		return c.json(
			{
				runs: runs.map((run) => ({
					id: run.id,
					run_type: run.runType as z.infer<typeof SyncRunTypeSchema>,
					started_at: run.startedAt,
					completed_at: run.completedAt,
					symbols_processed: run.symbolsProcessed,
					symbols_failed: run.symbolsFailed,
					status: run.status as z.infer<typeof SyncRunStatusSchema>,
					error_message: run.errorMessage,
					environment: run.environment,
				})),
				summary: {
					total_runs: summary.totalRuns,
					running: summary.running,
					completed: summary.completed,
					failed: summary.failed,
					last_completed: summary.lastCompleted as Record<
						z.infer<typeof SyncRunTypeSchema>,
						string | null
					>,
				},
			},
			200
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, {
			message: `Failed to fetch batch status: ${message}`,
		});
	}
});

// ============================================
// Get Single Run Details
// ============================================

const getSyncRunRoute = createRoute({
	method: "get",
	path: "/batch/status/:id",
	request: {
		params: z.object({
			id: z.string(),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: z.object({ run: SyncRunSchema }) } },
			description: "Single sync run details",
		},
		404: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Sync run not found",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Database service unavailable",
		},
	},
	tags: ["Indicators"],
});

app.openapi(getSyncRunRoute, async (c) => {
	const { id } = c.req.valid("param");

	try {
		const repo = getIndicatorSyncRunsRepo();
		const run = await repo.findById(id);

		if (!run) {
			throw new HTTPException(404, { message: `Sync run ${id} not found` });
		}

		return c.json(
			{
				run: {
					id: run.id,
					run_type: run.runType as z.infer<typeof SyncRunTypeSchema>,
					started_at: run.startedAt,
					completed_at: run.completedAt,
					symbols_processed: run.symbolsProcessed,
					symbols_failed: run.symbolsFailed,
					status: run.status as z.infer<typeof SyncRunStatusSchema>,
					error_message: run.errorMessage,
					environment: run.environment,
				},
			},
			200
		);
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, {
			message: `Failed to fetch sync run: ${message}`,
		});
	}
});

export default app;
