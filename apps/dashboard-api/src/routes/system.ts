/**
 * System Control Routes
 *
 * Endpoints for system status, start/stop controls, and environment management.
 *
 * @see docs/plans/ui/05-api-endpoints.md
 */

import { tradingCycleWorkflow } from "@cream/api";
import type { CyclePhase, CycleProgressData, CycleResultData } from "@cream/domain/websocket";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getAlertsRepo, getOrdersRepo, getPositionsRepo, getRuntimeConfigService } from "../db.js";
import { broadcastCycleProgress, broadcastCycleResult } from "../websocket/handler.js";

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
  metadata: z.record(z.string(), z.unknown()),
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

// Trigger Cycle Schemas
const TriggerCycleRequestSchema = z.object({
  environment: EnvironmentSchema,
  useDraftConfig: z.boolean().default(false),
  symbols: z.array(z.string()).optional(),
  confirmLive: z.boolean().optional(),
});

const CycleStatusValue = z.enum(["queued", "running", "completed", "failed"]);

const TriggerCycleResponseSchema = z.object({
  cycleId: z.string(),
  status: CycleStatusValue,
  environment: z.string(),
  configVersion: z.string().nullable(),
  startedAt: z.string(),
});

const CycleStatusResponseSchema = z.object({
  cycleId: z.string(),
  status: CycleStatusValue,
  environment: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  error: z.string().nullable(),
});

// ============================================
// In-Memory System State
// ============================================

interface CycleState {
  cycleId: string;
  status: "queued" | "running" | "completed" | "failed";
  environment: "BACKTEST" | "PAPER" | "LIVE";
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

interface SystemState {
  status: "ACTIVE" | "PAUSED" | "STOPPED";
  environment: "BACKTEST" | "PAPER" | "LIVE";
  lastCycleId: string | null;
  lastCycleTime: string | null;
  startedAt: Date | null;
  /** Track running cycles per environment */
  runningCycles: Map<string, CycleState>;
  /** Rate limit: last trigger time per environment */
  lastTriggerTime: Map<string, number>;
}

const systemState: SystemState = {
  status: "STOPPED",
  environment: (process.env.CREAM_ENV as "BACKTEST" | "PAPER" | "LIVE") ?? "PAPER",
  lastCycleId: null,
  lastCycleTime: null,
  startedAt: null,
  runningCycles: new Map(),
  lastTriggerTime: new Map(),
};

/** Rate limit in milliseconds (5 minutes) */
const TRIGGER_RATE_LIMIT_MS = 5 * 60 * 1000;

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
    alertsRepo.findMany({ acknowledged: false }, { page: 1, pageSize: 10 }),
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
      metadata: a.metadata,
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

  // Return current status
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
  c.req.valid("json");

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
  });
});

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
  const { environment, useDraftConfig, symbols, confirmLive } = body;

  // Authorization: LIVE requires confirmLive
  if (environment === "LIVE" && !confirmLive) {
    return c.json({ error: "confirmLive required to trigger LIVE cycle" }, 400);
  }

  // Check if a cycle is already running for this environment
  const existingCycle = systemState.runningCycles.get(environment);
  if (existingCycle && (existingCycle.status === "queued" || existingCycle.status === "running")) {
    return c.json(
      { error: `Cycle already in progress for ${environment}`, cycleId: existingCycle.cycleId },
      409
    );
  }

  // Rate limiting
  const lastTrigger = systemState.lastTriggerTime.get(environment) ?? 0;
  const timeSinceLastTrigger = Date.now() - lastTrigger;
  if (timeSinceLastTrigger < TRIGGER_RATE_LIMIT_MS) {
    const retryAfterMs = TRIGGER_RATE_LIMIT_MS - timeSinceLastTrigger;
    return c.json(
      {
        error: `Rate limited. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`,
        retryAfterMs,
      },
      429
    );
  }

  // Generate cycle ID
  const cycleId = `cycle_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const startedAt = new Date().toISOString();

  // Get config version
  let configVersion: string | null = null;
  try {
    const configService = await getRuntimeConfigService();
    const config = useDraftConfig
      ? await configService.getDraft(environment)
      : await configService.getActiveConfig(environment);
    configVersion = config.trading.id;
  } catch {
    // Config not found is OK for BACKTEST
    if (environment !== "BACKTEST") {
      return c.json({ error: "No configuration found for environment. Run db:seed first." }, 400);
    }
  }

  // Track cycle state
  const cycleState: CycleState = {
    cycleId,
    status: "queued",
    environment,
    startedAt,
    completedAt: null,
    error: null,
  };
  systemState.runningCycles.set(environment, cycleState);
  systemState.lastTriggerTime.set(environment, Date.now());

  // Helper to emit progress via WebSocket
  const emitProgress = (phase: CyclePhase, progress: number, step: string, message: string) => {
    const progressData: CycleProgressData = {
      cycleId,
      phase,
      step,
      progress,
      message,
      timestamp: new Date().toISOString(),
    };
    broadcastCycleProgress({ type: "cycle_progress", data: progressData });
  };

  // Helper to emit final result via WebSocket
  const emitResult = (status: "completed" | "failed", durationMs: number, error?: string) => {
    const resultData: CycleResultData = {
      cycleId,
      environment,
      status,
      durationMs,
      configVersion: configVersion ?? undefined,
      error,
      // Result details would come from workflow output when available
      result:
        status === "completed"
          ? {
              approved: true,
              iterations: 1,
              decisions: [],
              orders: [],
            }
          : undefined,
      timestamp: new Date().toISOString(),
    };
    broadcastCycleResult({ type: "cycle_result", data: resultData });
  };

  // Trigger workflow asynchronously (non-blocking)
  const runCycle = async () => {
    const startTime = Date.now();
    cycleState.status = "running";

    // Emit initial progress
    emitProgress("observe", 0, "starting", "Starting trading cycle...");

    try {
      // Emit observe phase start
      emitProgress("observe", 10, "market_data", "Fetching market data...");

      await tradingCycleWorkflow.execute({
        triggerData: {
          cycleId,
          instruments: symbols,
          useDraftConfig,
        },
      });

      cycleState.status = "completed";
      cycleState.completedAt = new Date().toISOString();

      // Update system state
      systemState.lastCycleId = cycleId;
      systemState.lastCycleTime = cycleState.completedAt;

      // Emit completion
      emitProgress("complete", 100, "done", "Trading cycle completed successfully");
      emitResult("completed", Date.now() - startTime);
    } catch (error) {
      cycleState.status = "failed";
      cycleState.completedAt = new Date().toISOString();
      cycleState.error = error instanceof Error ? error.message : "Unknown error";

      // Emit failure
      emitProgress("error", 0, "failed", `Cycle failed: ${cycleState.error}`);
      emitResult("failed", Date.now() - startTime, cycleState.error);
    }
  };

  // Start without awaiting
  runCycle();

  return c.json({
    cycleId,
    status: "queued",
    environment,
    configVersion,
    startedAt,
  });
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

  // Search all environments for the cycle
  for (const cycleState of systemState.runningCycles.values()) {
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
    await alertsRepo.findMany({}, { page: 1, pageSize: 1 });
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
