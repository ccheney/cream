/**
 * System Control Routes
 *
 * Endpoints for starting, stopping, pausing, and changing environment.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getAlertsRepo, getOrdersRepo, getPositionsRepo } from "../../db.js";
import { systemState } from "./state.js";
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

async function getSystemStatusResponse() {
  const [positionsRepo, ordersRepo, alertsRepo] = await Promise.all([
    getPositionsRepo(),
    getOrdersRepo(),
    getAlertsRepo(),
  ]);

  const [positions, orders, alerts] = await Promise.all([
    positionsRepo.findMany({ environment: systemState.environment, status: "open" }),
    ordersRepo.findMany({ environment: systemState.environment, status: "pending" }),
    alertsRepo.findMany({ acknowledged: false }, { page: 1, pageSize: 10 }),
  ]);

  const nextHour = new Date();
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);

  const runningCycle = systemState.runningCycles.get(systemState.environment);
  const isRunning =
    runningCycle && (runningCycle.status === "queued" || runningCycle.status === "running");

  return {
    environment: systemState.environment,
    status: systemState.status,
    lastCycleId: systemState.lastCycleId,
    lastCycleTime: systemState.lastCycleTime,
    nextCycleTime: systemState.status === "ACTIVE" ? nextHour.toISOString() : null,
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

  if (body.environment) {
    if (body.environment === "LIVE") {
      return c.json({ error: "Cannot start in LIVE mode without explicit confirmation" }, 400);
    }
    systemState.environment = body.environment;
  }

  systemState.status = "ACTIVE";
  systemState.startedAt = new Date();

  const [positionsRepo, ordersRepo, alertsRepo] = await Promise.all([
    getPositionsRepo(),
    getOrdersRepo(),
    getAlertsRepo(),
  ]);

  const [positions, orders, alerts] = await Promise.all([
    positionsRepo.findMany({ environment: systemState.environment, status: "open" }),
    ordersRepo.findMany({ environment: systemState.environment, status: "pending" }),
    alertsRepo.findMany({ acknowledged: false }, { page: 1, pageSize: 10 }),
  ]);

  const nextHour = new Date();
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);

  const runningCycle = systemState.runningCycles.get(systemState.environment);
  const isRunning =
    runningCycle && (runningCycle.status === "queued" || runningCycle.status === "running");

  return c.json({
    environment: systemState.environment,
    status: systemState.status,
    lastCycleId: systemState.lastCycleId,
    lastCycleTime: systemState.lastCycleTime,
    nextCycleTime: nextHour.toISOString(),
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
  });
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

  systemState.status = "STOPPED";

  if (body.closeAllPositions) {
    try {
      const positionsRepo = await getPositionsRepo();
      const openPositions = await positionsRepo.findMany({
        environment: systemState.environment,
        status: "open",
      });

      if (openPositions.total > 0) {
        const alertsRepo = await getAlertsRepo();
        await alertsRepo.create({
          id: crypto.randomUUID(),
          severity: "warning",
          type: "system",
          title: "Position Close Requested",
          message: `System stop requested with closeAllPositions=true. ${openPositions.total} open positions require attention.`,
          metadata: {
            positionCount: openPositions.total,
            symbols: openPositions.data.map((p) => p.symbol),
          },
          environment: systemState.environment,
        });
      }
    } catch {
      // Non-critical error, continue with stop
    }
  }

  const [positionsRepo, ordersRepo, alertsRepo] = await Promise.all([
    getPositionsRepo(),
    getOrdersRepo(),
    getAlertsRepo(),
  ]);

  const [positions, orders, alerts] = await Promise.all([
    positionsRepo.findMany({ environment: systemState.environment, status: "open" }),
    ordersRepo.findMany({ environment: systemState.environment, status: "pending" }),
    alertsRepo.findMany({ acknowledged: false }, { page: 1, pageSize: 10 }),
  ]);

  return c.json({
    environment: systemState.environment,
    status: systemState.status,
    lastCycleId: systemState.lastCycleId,
    lastCycleTime: systemState.lastCycleTime,
    nextCycleTime: null,
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
    runningCycle: null,
  });
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
  systemState.status = "PAUSED";

  const [positionsRepo, ordersRepo, alertsRepo] = await Promise.all([
    getPositionsRepo(),
    getOrdersRepo(),
    getAlertsRepo(),
  ]);

  const [positions, orders, alerts] = await Promise.all([
    positionsRepo.findMany({ environment: systemState.environment, status: "open" }),
    ordersRepo.findMany({ environment: systemState.environment, status: "pending" }),
    alertsRepo.findMany({ acknowledged: false }, { page: 1, pageSize: 10 }),
  ]);

  return c.json({
    environment: systemState.environment,
    status: systemState.status,
    lastCycleId: systemState.lastCycleId,
    lastCycleTime: systemState.lastCycleTime,
    nextCycleTime: null,
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
    runningCycle: null,
  });
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

  if (systemState.status !== "STOPPED") {
    return c.json({ error: "System must be stopped to change environment" }, 400);
  }

  systemState.environment = body.environment;

  const [positionsRepo, ordersRepo, alertsRepo] = await Promise.all([
    getPositionsRepo(),
    getOrdersRepo(),
    getAlertsRepo(),
  ]);

  const [positions, orders, alerts] = await Promise.all([
    positionsRepo.findMany({ environment: systemState.environment, status: "open" }),
    ordersRepo.findMany({ environment: systemState.environment, status: "pending" }),
    alertsRepo.findMany({ acknowledged: false }, { page: 1, pageSize: 10 }),
  ]);

  return c.json({
    environment: systemState.environment,
    status: systemState.status,
    lastCycleId: systemState.lastCycleId,
    lastCycleTime: systemState.lastCycleTime,
    nextCycleTime: null,
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
    runningCycle: null,
  });
});

export default app;
