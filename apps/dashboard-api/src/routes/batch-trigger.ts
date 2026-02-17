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
import { getIndicatorSyncRunsRepo } from "../db.js";
import log from "../logger.js";

const app = new OpenAPIHono();

function buildTriggerMetadata(symbols: string[] | undefined, priority: "normal" | "high") {
	const symbolsCount = symbols?.length ?? -1;
	const errorMessage = symbols
		? JSON.stringify({ symbols, priority })
		: JSON.stringify({ priority });
	return { symbolsCount, errorMessage };
}

function buildTriggerResponse(
	run: { id: string; startedAt: string },
	jobType: z.infer<typeof JobTypeSchema>,
	symbolsCount: number,
) {
	const isAllSymbols = symbolsCount === -1;
	return {
		run_id: run.id,
		job_type: jobType,
		status: "pending" as const,
		symbols_count: isAllSymbols ? 0 : symbolsCount,
		created_at: run.startedAt,
		message: isAllSymbols
			? `Triggered ${jobType} batch job for all symbols`
			: `Triggered ${jobType} batch job for ${symbolsCount} symbols`,
	};
}

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
	const repo = getIndicatorSyncRunsRepo();

	try {
		const runningJob = await repo.findRunningByType(job_type);
		if (runningJob) {
			throw new HTTPException(409, {
				message: `A ${job_type} batch job is already running`,
			});
		}

		const { symbolsCount, errorMessage } = buildTriggerMetadata(symbols, priority);

		const run = await repo.create({
			runType: job_type,
			environment,
			errorMessage,
		});

		log.info(
			{
				runId: run.id,
				jobType: job_type,
				symbolsCount: symbolsCount === -1 ? "all" : symbolsCount,
				priority,
				environment,
			},
			"Batch job trigger request created",
		);

		return c.json(buildTriggerResponse(run, job_type, symbolsCount), 202);
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
		const repo = getIndicatorSyncRunsRepo();

		// Check current status
		const run = await repo.findById(id);

		if (!run) {
			throw new HTTPException(404, { message: `Job ${id} not found` });
		}

		if (run.status === "completed" || run.status === "failed") {
			throw new HTTPException(409, {
				message: `Cannot cancel job ${id} - already ${run.status}`,
			});
		}

		// Update status to cancelled
		await repo.cancel(id);

		log.info({ runId: id }, "Batch job cancelled by user");

		return c.json(
			{
				success: true,
				message: `Job ${id} cancellation requested`,
			},
			200,
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
