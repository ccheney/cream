/**
 * Batch Trigger API Routes
 *
 * Admin-only endpoint for manually triggering indicator batch jobs.
 * Creates a trigger request that the worker will pick up and execute.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import { requireEnv } from "@cream/domain";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDbClient } from "../db.js";
import log from "../logger.js";

const app = new OpenAPIHono();

// ============================================
// Schema Definitions
// ============================================

const JobTypeSchema = z.enum(["fundamentals", "short_interest", "sentiment", "corporate_actions"]);

const TriggerRequestSchema = z.object({
	job_type: JobTypeSchema,
	symbols: z.array(z.string()).min(1).max(500).optional(),
	priority: z.enum(["normal", "high"]).default("normal"),
});

const TriggerResponseSchema = z.object({
	run_id: z.string(),
	job_type: JobTypeSchema,
	status: z.literal("pending"),
	symbols_count: z.number(),
	created_at: z.string(),
	message: z.string(),
});

const ErrorSchema = z.object({
	error: z.string(),
	message: z.string(),
});

// ============================================
// Route Definition
// ============================================

const triggerBatchJobRoute = createRoute({
	method: "post",
	path: "/batch/trigger",
	request: {
		body: {
			content: {
				"application/json": {
					schema: TriggerRequestSchema,
				},
			},
		},
	},
	responses: {
		202: {
			content: { "application/json": { schema: TriggerResponseSchema } },
			description: "Batch job trigger request accepted",
		},
		400: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Invalid request parameters",
		},
		409: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Job already running",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Database service unavailable",
		},
	},
	tags: ["Indicators"],
});

app.openapi(triggerBatchJobRoute, async (c) => {
	const { job_type, symbols, priority } = c.req.valid("json");
	const environment = requireEnv();

	try {
		const db = await getDbClient();

		// Check if a job of this type is already running
		const runningJobs = await db.execute(
			`SELECT id FROM indicator_sync_runs
       WHERE run_type = ? AND status = 'running'
       LIMIT 1`,
			[job_type]
		);

		if (runningJobs.length > 0) {
			throw new HTTPException(409, {
				message: `A ${job_type} batch job is already running`,
			});
		}

		// Generate a unique run ID
		const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const now = new Date().toISOString();

		// Get symbol count - if symbols provided, use those, otherwise indicate "all"
		const symbolsCount = symbols?.length ?? -1; // -1 means "all symbols"

		// Insert the trigger request as a pending sync run
		// The worker will pick this up and execute it
		await db.run(
			`INSERT INTO indicator_sync_runs
       (id, run_type, started_at, status, symbols_processed, symbols_failed, environment, error_message)
       VALUES (?, ?, ?, 'pending', 0, 0, ?, ?)`,
			[
				runId,
				job_type,
				now,
				environment,
				symbols ? JSON.stringify({ symbols, priority }) : JSON.stringify({ priority }),
			]
		);

		log.info(
			{
				runId,
				jobType: job_type,
				symbolsCount: symbolsCount === -1 ? "all" : symbolsCount,
				priority,
				environment,
			},
			"Batch job trigger request created"
		);

		return c.json(
			{
				run_id: runId,
				job_type,
				status: "pending" as const,
				symbols_count: symbolsCount === -1 ? 0 : symbolsCount,
				created_at: now,
				message:
					symbolsCount === -1
						? `Triggered ${job_type} batch job for all symbols`
						: `Triggered ${job_type} batch job for ${symbolsCount} symbols`,
			},
			202
		);
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		const message = error instanceof Error ? error.message : "Unknown error";
		log.error({ jobType: job_type, error: message }, "Failed to create batch job trigger");
		throw new HTTPException(503, {
			message: `Failed to trigger batch job: ${message}`,
		});
	}
});

// ============================================
// Cancel Running Job
// ============================================

const cancelBatchJobRoute = createRoute({
	method: "post",
	path: "/batch/cancel/:id",
	request: {
		params: z.object({
			id: z.string(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						success: z.boolean(),
						message: z.string(),
					}),
				},
			},
			description: "Job cancellation requested",
		},
		404: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Job not found",
		},
		409: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Job cannot be cancelled (already completed/failed)",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Database service unavailable",
		},
	},
	tags: ["Indicators"],
});

app.openapi(cancelBatchJobRoute, async (c) => {
	const { id } = c.req.valid("param");

	try {
		const db = await getDbClient();

		// Check current status
		const rows = await db.execute(`SELECT status FROM indicator_sync_runs WHERE id = ?`, [id]);

		if (rows.length === 0) {
			throw new HTTPException(404, { message: `Job ${id} not found` });
		}

		const status = rows[0]?.status as string;

		if (status === "completed" || status === "failed") {
			throw new HTTPException(409, {
				message: `Cannot cancel job ${id} - already ${status}`,
			});
		}

		// Update status to cancelled
		await db.run(
			`UPDATE indicator_sync_runs
       SET status = 'failed',
           completed_at = datetime('now'),
           error_message = 'Cancelled by user'
       WHERE id = ?`,
			[id]
		);

		log.info({ runId: id }, "Batch job cancelled by user");

		return c.json(
			{
				success: true,
				message: `Job ${id} cancellation requested`,
			},
			200
		);
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, {
			message: `Failed to cancel job: ${message}`,
		});
	}
});

export default app;
