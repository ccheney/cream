/**
 * System Control Routes
 *
 * Endpoints for starting, stopping, pausing, and changing environment.
 * System status is persisted to the database.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getAlertsRepo, getOrdersRepo, getPositionsRepo, getSystemStateRepo } from "../../db.js";
import { getRunningCycles, getSystemState, setSystemStatus } from "./state.js";
import {
	EnvironmentRequestSchema,
	StartRequestSchema,
	StopRequestSchema,
	SystemStatusSchema,
} from "./types.js";

const app = new OpenAPIHono();

// ============================================
// Helper Functions
// ============================================

type Environment = "BACKTEST" | "PAPER" | "LIVE";

async function getSystemStatusResponse(environmentOverride?: string) {
	const state = await getSystemState(environmentOverride);
	const environment = (environmentOverride ?? state.environment) as Environment;

	const [positionsRepo, ordersRepo, alertsRepo] = await Promise.all([
		getPositionsRepo(),
		getOrdersRepo(),
		getAlertsRepo(),
	]);

	const [positions, orders, alerts] = await Promise.all([
		positionsRepo.findMany({ environment, status: "open" }),
		ordersRepo.findMany({ environment, status: "pending" }),
		alertsRepo.findMany({ acknowledged: false }, { page: 1, pageSize: 10 }),
	]);

	const nextHour = new Date();
	nextHour.setMinutes(0, 0, 0);
	nextHour.setHours(nextHour.getHours() + 1);

	const runningCycles = getRunningCycles();
	const runningCycle = runningCycles.get(environment);
	const isRunning =
		runningCycle && (runningCycle.status === "queued" || runningCycle.status === "running");

	return {
		environment,
		status: state.status,
		lastCycleId: state.lastCycleId,
		lastCycleTime: state.lastCycleTime,
		nextCycleTime: state.status === "running" ? nextHour.toISOString() : null,
		positionCount: positions.total,
		openOrderCount: orders.total,
		alerts: alerts.data.map((a) => ({
			id: a.id,
			severity: a.severity,
			type: a.type,
			message: a.message,
			metadata: a.metadata,
			acknowledged: a.acknowledged,
			createdAt: a.createdAt,
		})),
		runningCycle: isRunning
			? {
					cycleId: runningCycle.cycleId,
					status: runningCycle.status,
					startedAt: runningCycle.startedAt,
					phase: runningCycle.phase,
				}
			: null,
	};
}

// ============================================
// Routes
// ============================================

// GET /api/system/status
const statusRoute = createRoute({
	method: "get",
	path: "/status",
	responses: {
		200: {
			content: { "application/json": { schema: SystemStatusSchema } },
			description: "System status",
		},
	},
	tags: ["System"],
});

app.openapi(statusRoute, async (c) => {
	return c.json(await getSystemStatusResponse());
});

// POST /api/system/start
const startRoute = createRoute({
	method: "post",
	path: "/start",
	request: {
		body: {
			content: { "application/json": { schema: StartRequestSchema } },
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: SystemStatusSchema } },
			description: "System started",
		},
		400: {
			content: {
				"application/json": {
					schema: z.object({ error: z.string() }),
				},
			},
			description: "Invalid request",
		},
	},
	tags: ["System"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(startRoute, async (c) => {
	const body = c.req.valid("json");

	const state = await getSystemState();
	let environment = state.environment;

	if (body.environment) {
		if (body.environment === "LIVE") {
			return c.json({ error: "Cannot start in LIVE mode without explicit confirmation" }, 400);
		}
		environment = body.environment;
	}

	// Persist status to database
	await setSystemStatus("running", environment);

	return c.json(await getSystemStatusResponse(environment));
});

// POST /api/system/stop
const stopRoute = createRoute({
	method: "post",
	path: "/stop",
	request: {
		body: {
			content: { "application/json": { schema: StopRequestSchema } },
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: SystemStatusSchema } },
			description: "System stopped",
		},
	},
	tags: ["System"],
});

app.openapi(stopRoute, async (c) => {
	const body = c.req.valid("json");

	const state = await getSystemState();

	// Persist status to database
	await setSystemStatus("stopped", state.environment);

	if (body.closeAllPositions) {
		try {
			const positionsRepo = await getPositionsRepo();
			const openPositions = await positionsRepo.findMany({
				environment: state.environment,
				status: "open",
			});

			if (openPositions.total > 0) {
				const alertsRepo = await getAlertsRepo();
				await alertsRepo.create({
					severity: "warning",
					type: "system",
					title: "Position Close Requested",
					message: `System stop requested with closeAllPositions=true. ${openPositions.total} open positions require attention.`,
					metadata: {
						positionCount: openPositions.total,
						symbols: openPositions.data.map((p) => p.symbol),
					},
					environment: state.environment,
				});
			}
		} catch {
			// Non-critical error, continue with stop
		}
	}

	return c.json(await getSystemStatusResponse());
});

// POST /api/system/pause
const pauseRoute = createRoute({
	method: "post",
	path: "/pause",
	responses: {
		200: {
			content: { "application/json": { schema: SystemStatusSchema } },
			description: "System paused",
		},
	},
	tags: ["System"],
});

app.openapi(pauseRoute, async (c) => {
	const state = await getSystemState();

	// Persist status to database
	await setSystemStatus("paused", state.environment);

	return c.json(await getSystemStatusResponse());
});

// POST /api/system/environment
const environmentRoute = createRoute({
	method: "post",
	path: "/environment",
	request: {
		body: {
			content: { "application/json": { schema: EnvironmentRequestSchema } },
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: SystemStatusSchema } },
			description: "Environment changed",
		},
		400: {
			content: {
				"application/json": {
					schema: z.object({ error: z.string() }),
				},
			},
			description: "Invalid request",
		},
	},
	tags: ["System"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(environmentRoute, async (c) => {
	const body = c.req.valid("json");

	if (body.environment === "LIVE" && !body.confirmLive) {
		return c.json({ error: "confirmLive required when switching to LIVE" }, 400);
	}

	const state = await getSystemState();

	if (state.status !== "stopped") {
		return c.json({ error: "System must be stopped to change environment" }, 400);
	}

	// Get or create state for the new environment (this ensures it exists in DB)
	const repo = await getSystemStateRepo();
	await repo.getOrCreate(body.environment);

	return c.json(await getSystemStatusResponse(body.environment));
});

export default app;
