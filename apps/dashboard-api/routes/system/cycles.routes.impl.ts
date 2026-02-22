/**
 * System Cycle Routes
 *
 * Endpoints for triggering and monitoring trading cycles.
 */

import { reconstructStreamingState } from "@cream/storage";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getCyclesRepo } from "../../src/db.js";
import { getRunningCycles } from "../../src/routes/system/state.js";
import {
	CycleListQuerySchema,
	CycleListResponseSchema,
	CycleStatusResponseSchema,
	FullCycleResponseSchema,
	TriggerCycleRequestSchema,
	TriggerCycleResponseSchema,
} from "../../src/routes/system/types.js";
import { handleTriggerCycle, isInternalAuth } from "./cycles.trigger-handler.js";

const app = new OpenAPIHono();

// ============================================
// Routes
// ============================================

// POST /api/system/trigger-cycle
const triggerCycleRoute = createRoute({
	method: "post",
	path: "/trigger-cycle",
	request: {
		body: {
			content: { "application/json": { schema: TriggerCycleRequestSchema } },
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: TriggerCycleResponseSchema } },
			description: "Cycle triggered successfully",
		},
		400: {
			content: {
				"application/json": {
					schema: z.object({ error: z.string() }),
				},
			},
			description: "Invalid request",
		},
		409: {
			content: {
				"application/json": {
					schema: z.object({ error: z.string(), cycleId: z.string().optional() }),
				},
			},
			description: "Cycle already in progress",
		},
		429: {
			content: {
				"application/json": {
					schema: z.object({ error: z.string(), retryAfterMs: z.number() }),
				},
			},
			description: "Rate limited",
		},
	},
	tags: ["System"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(triggerCycleRoute, async (c) => {
	const body = c.req.valid("json");
	const result = await handleTriggerCycle({
		environment: body.environment,
		useDraftConfig: body.useDraftConfig,
		symbols: body.symbols,
		confirmLive: body.confirmLive,
		isInternal: isInternalAuth(c.req.header("Authorization")),
	});
	switch (result.status) {
		case 200:
			return c.json(result.body, 200);
		case 400:
			return c.json(result.body, 400);
		case 409:
			return c.json(result.body, 409);
		case 429:
			return c.json(result.body, 429);
		default:
			return c.json(result.body, 400);
	}
});

// GET /api/system/cycle/:cycleId
const cycleStatusRoute = createRoute({
	method: "get",
	path: "/cycle/:cycleId",
	request: {
		params: z.object({
			cycleId: z.string(),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: CycleStatusResponseSchema } },
			description: "Cycle status",
		},
		404: {
			content: {
				"application/json": {
					schema: z.object({ error: z.string() }),
				},
			},
			description: "Cycle not found",
		},
	},
	tags: ["System"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(cycleStatusRoute, async (c) => {
	const { cycleId } = c.req.valid("param");

	const runningCycles = getRunningCycles();
	for (const cycleState of runningCycles.values()) {
		if (cycleState.cycleId === cycleId) {
			return c.json({
				cycleId: cycleState.cycleId,
				status: cycleState.status,
				environment: cycleState.environment,
				startedAt: cycleState.startedAt,
				completedAt: cycleState.completedAt,
				error: cycleState.error,
			});
		}
	}

	return c.json({ error: "Cycle not found" }, 404);
});

// ============================================
// Cycle History Routes
// ============================================

// GET /api/system/cycles
const cycleListRoute = createRoute({
	method: "get",
	path: "/cycles",
	request: {
		query: CycleListQuerySchema,
	},
	responses: {
		200: {
			content: { "application/json": { schema: CycleListResponseSchema } },
			description: "List of cycles",
		},
	},
	tags: ["System"],
});

app.openapi(cycleListRoute, async (c) => {
	const query = c.req.valid("query");
	const cyclesRepo = await getCyclesRepo();

	const result = await cyclesRepo.findMany({
		environment: query.environment,
		status: query.status,
		pagination: {
			page: query.page,
			pageSize: query.pageSize,
		},
	});

	return c.json({
		data: result.data.map((cycle) => ({
			id: cycle.id,
			environment: cycle.environment,
			status: cycle.status,
			startedAt: cycle.startedAt,
			completedAt: cycle.completedAt,
			durationMs: cycle.durationMs,
			decisionsCount: cycle.decisionsCount,
			approved: cycle.approved,
			configVersion: cycle.configVersion,
		})),
		total: result.total,
		page: result.page,
		pageSize: result.pageSize,
		totalPages: result.totalPages,
	});
});

// GET /api/system/cycles/:id/full
const cycleFullRoute = createRoute({
	method: "get",
	path: "/cycles/:id/full",
	request: {
		params: z.object({
			id: z.string(),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: FullCycleResponseSchema } },
			description: "Full cycle data with streaming state",
		},
		404: {
			content: {
				"application/json": {
					schema: z.object({ error: z.string() }),
				},
			},
			description: "Cycle not found",
		},
	},
	tags: ["System"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(cycleFullRoute, async (c) => {
	const { id } = c.req.valid("param");
	const cyclesRepo = await getCyclesRepo();

	const cycle = await cyclesRepo.findById(id);
	if (!cycle) {
		return c.json({ error: "Cycle not found" }, 404);
	}

	const events = await cyclesRepo.findStreamingEvents(id);
	const streamingState = reconstructStreamingState(events);

	if (cycle.status === "completed" || cycle.status === "failed") {
		for (const agent of Object.values(streamingState.agents)) {
			if (agent.status === "processing") {
				agent.status = "complete";
			}
		}
	}

	return c.json({
		cycle: {
			id: cycle.id,
			environment: cycle.environment,
			status: cycle.status,
			startedAt: cycle.startedAt,
			completedAt: cycle.completedAt,
			durationMs: cycle.durationMs,
			decisionsCount: cycle.decisionsCount,
			approved: cycle.approved,
			configVersion: cycle.configVersion,
			currentPhase: cycle.currentPhase,
			progressPct: cycle.progressPct,
			iterations: cycle.iterations,
			errorMessage: cycle.errorMessage,
		},
		streamingState: streamingState.agents,
	});
});

export default app;
