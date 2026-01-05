/**
 * System Control Routes
 *
 * Endpoints for system status, start/stop controls, and environment management.
 *
 * @see docs/plans/ui/05-api-endpoints.md
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getAlertsRepo, getPositionsRepo, getOrdersRepo } from "../db.js";

// ============================================
// Schemas
// ============================================

const EnvironmentSchema = z.enum(["BACKTEST", "PAPER", "LIVE"]);
const SystemStatusValue = z.enum(["ACTIVE", "PAUSED", "STOPPED"]);

const AlertSchema = z.object({
  id: z.string(),
  severity: z.enum(["critical", "warning", "info"]),
  type: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).nullable(),
  acknowledged: z.boolean(),
  createdAt: z.string(),
});

const SystemStatusSchema = z.object({
  environment: EnvironmentSchema,
  status: SystemStatusValue,
  lastCycleId: z.string().nullable(),
  lastCycleTime: z.string().nullable(),
  nextCycleTime: z.string().nullable(),
  positionCount: z.number(),
  openOrderCount: z.number(),
  alerts: z.array(AlertSchema),
});

const HealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded", "down"]),
  timestamp: z.string(),
  version: z.string(),
  services: z.object({
    database: z.enum(["ok", "error"]),
    redis: z.enum(["ok", "error"]),
    websocket: z.object({
      connections: z.number(),
    }),
  }),
});

const StartRequestSchema = z.object({
  environment: EnvironmentSchema.optional(),
});

const StopRequestSchema = z.object({
  closeAllPositions: z.boolean().optional().default(false),
});

const EnvironmentRequestSchema = z.object({
  environment: EnvironmentSchema,
  confirmLive: z.boolean().optional(),
});

// ============================================
// In-Memory System State
// ============================================

interface SystemState {
  status: "ACTIVE" | "PAUSED" | "STOPPED";
  environment: "BACKTEST" | "PAPER" | "LIVE";
  lastCycleId: string | null;
  lastCycleTime: string | null;
  startedAt: Date | null;
}

const systemState: SystemState = {
  status: "STOPPED",
  environment: (process.env.CREAM_ENV as "BACKTEST" | "PAPER" | "LIVE") ?? "PAPER",
  lastCycleId: null,
  lastCycleTime: null,
  startedAt: null,
};

// ============================================
// Routes
// ============================================

const app = new OpenAPIHono();

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
  const [positionsRepo, ordersRepo, alertsRepo] = await Promise.all([
    getPositionsRepo(),
    getOrdersRepo(),
    getAlertsRepo(),
  ]);

  const [positions, orders, alerts] = await Promise.all([
    positionsRepo.findMany({ environment: systemState.environment, status: "open" }),
    ordersRepo.findMany({ environment: systemState.environment, status: "pending" }),
    alertsRepo.findMany({ acknowledged: false }, { limit: 10 }),
  ]);

  // Calculate next cycle time (next hour boundary)
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);

  return c.json({
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
      details: a.details,
      acknowledged: a.acknowledged,
      createdAt: a.createdAt,
    })),
  });
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

  // Return current status
  const [positionsRepo, ordersRepo, alertsRepo] = await Promise.all([
    getPositionsRepo(),
    getOrdersRepo(),
    getAlertsRepo(),
  ]);

  const [positions, orders, alerts] = await Promise.all([
    positionsRepo.findMany({ environment: systemState.environment, status: "open" }),
    ordersRepo.findMany({ environment: systemState.environment, status: "pending" }),
    alertsRepo.findMany({ acknowledged: false }, { limit: 10 }),
  ]);

  const nextHour = new Date();
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);

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
      details: a.details,
      acknowledged: a.acknowledged,
      createdAt: a.createdAt,
    })),
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

  // TODO: If closeAllPositions is true, queue position closing orders

  const [positionsRepo, ordersRepo, alertsRepo] = await Promise.all([
    getPositionsRepo(),
    getOrdersRepo(),
    getAlertsRepo(),
  ]);

  const [positions, orders, alerts] = await Promise.all([
    positionsRepo.findMany({ environment: systemState.environment, status: "open" }),
    ordersRepo.findMany({ environment: systemState.environment, status: "pending" }),
    alertsRepo.findMany({ acknowledged: false }, { limit: 10 }),
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
      details: a.details,
      acknowledged: a.acknowledged,
      createdAt: a.createdAt,
    })),
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
    alertsRepo.findMany({ acknowledged: false }, { limit: 10 }),
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
      details: a.details,
      acknowledged: a.acknowledged,
      createdAt: a.createdAt,
    })),
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

app.openapi(environmentRoute, async (c) => {
  const body = c.req.valid("json");

  // Require confirmation for LIVE mode
  if (body.environment === "LIVE" && !body.confirmLive) {
    return c.json({ error: "confirmLive required when switching to LIVE" }, 400);
  }

  // Must be stopped to change environment
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
    alertsRepo.findMany({ acknowledged: false }, { limit: 10 }),
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
      details: a.details,
      acknowledged: a.acknowledged,
      createdAt: a.createdAt,
    })),
  });
});

// GET /api/system/health
const healthRoute = createRoute({
  method: "get",
  path: "/health",
  responses: {
    200: {
      content: { "application/json": { schema: HealthResponseSchema } },
      description: "Health check",
    },
  },
  tags: ["System"],
});

app.openapi(healthRoute, async (c) => {
  let dbStatus: "ok" | "error" = "ok";

  try {
    const alertsRepo = await getAlertsRepo();
    await alertsRepo.findMany({}, { limit: 1 });
  } catch {
    dbStatus = "error";
  }

  // TODO: Check Redis connection
  const redisStatus: "ok" | "error" = "ok";

  return c.json({
    status: dbStatus === "ok" && redisStatus === "ok" ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
    services: {
      database: dbStatus,
      redis: redisStatus,
      websocket: {
        connections: 0, // Will be populated from WebSocket handler
      },
    },
  });
});

export default app;
export { systemState };
