/**
 * System Cycle Routes
 *
 * Endpoints for triggering and monitoring trading cycles.
 */

import { tradingCycleWorkflow } from "@cream/api";
import type { CyclePhase, CycleProgressData, CycleResultData } from "@cream/domain/websocket";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getCyclesRepo, getDecisionsRepo, getRuntimeConfigService } from "../../db.js";
import { broadcastCycleProgress, broadcastCycleResult } from "../../websocket/handler.js";
import {
  getLastTriggerTime,
  getRunningCycles,
  setLastTriggerTime,
  setRunningCycle,
  updateCycleState,
} from "./state.js";
import {
  type CycleState,
  CycleStatusResponseSchema,
  TRIGGER_RATE_LIMIT_MS,
  TriggerCycleRequestSchema,
  TriggerCycleResponseSchema,
} from "./types.js";

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
  const { environment, useDraftConfig, symbols, confirmLive } = body;

  if (environment === "LIVE" && !confirmLive) {
    return c.json({ error: "confirmLive required to trigger LIVE cycle" }, 400);
  }

  const runningCycles = getRunningCycles();
  const existingCycle = runningCycles.get(environment);
  if (existingCycle && (existingCycle.status === "queued" || existingCycle.status === "running")) {
    return c.json(
      { error: `Cycle already in progress for ${environment}`, cycleId: existingCycle.cycleId },
      409
    );
  }

  const lastTriggerTime = getLastTriggerTime();
  const lastTrigger = lastTriggerTime.get(environment) ?? 0;
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

  const cycleId = `cycle_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const startedAt = new Date().toISOString();

  let configVersion: string | null = null;
  try {
    const configService = await getRuntimeConfigService();
    const config = useDraftConfig
      ? await configService.getDraft(environment)
      : await configService.getActiveConfig(environment);
    configVersion = config.trading.id;
  } catch {
    if (environment !== "BACKTEST") {
      return c.json({ error: "No configuration found for environment. Run db:seed first." }, 400);
    }
  }

  const cycleState: CycleState = {
    cycleId,
    status: "queued",
    environment,
    startedAt,
    completedAt: null,
    error: null,
    phase: null,
  };
  setRunningCycle(environment, cycleState);
  setLastTriggerTime(environment, Date.now());

  const emitProgress = (phase: CyclePhase, progress: number, step: string, message: string) => {
    cycleState.phase = phase.toLowerCase() as CycleState["phase"];

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

  const emitResult = (
    status: "completed" | "failed",
    durationMs: number,
    workflowResult?: Awaited<ReturnType<typeof tradingCycleWorkflow.execute>>,
    error?: string
  ) => {
    const resultData: CycleResultData = {
      cycleId,
      environment,
      status,
      durationMs,
      configVersion: configVersion ?? undefined,
      error,
      result:
        status === "completed" && workflowResult
          ? {
              approved: workflowResult.approved,
              iterations: workflowResult.iterations,
              decisions: [],
              orders: workflowResult.orderSubmission.orderIds.map((orderId) => ({
                orderId,
                symbol: "unknown",
                side: "buy" as const,
                quantity: 0,
                status: "submitted" as const,
              })),
            }
          : undefined,
      timestamp: new Date().toISOString(),
    };
    broadcastCycleResult({ type: "cycle_result", data: resultData });
  };

  // TODO: Streaming callbacks not yet supported in v2 workflow
  // Will be added in future iteration with Mastra event bus pattern

  const runCycle = async () => {
    const startTime = Date.now();
    cycleState.status = "running";

    let cyclesRepo: Awaited<ReturnType<typeof getCyclesRepo>> | null = null;
    try {
      cyclesRepo = await getCyclesRepo();
      await cyclesRepo.start(
        cycleId,
        environment,
        symbols?.length ?? 0,
        configVersion ?? undefined
      );
    } catch {
      // Non-critical - continue cycle even if persistence fails
    }

    emitProgress("observe", 0, "starting", "Starting trading cycle...");

    try {
      emitProgress("observe", 10, "market_data", "Fetching market data...");

      // v2 workflow determines mode from CREAM_ENV
      // Streaming callbacks not yet supported in v2 - will be added in future iteration
      const run = await tradingCycleWorkflow.createRun();
      const runResult = await run.start({
        inputData: {
          cycleId,
          instruments: symbols,
          forceStub: useDraftConfig, // draft config testing uses stub mode
        },
      });

      if (runResult.status !== "success") {
        throw new Error("Workflow execution failed");
      }

      // Extract result from successful workflow
      const workflowResult = (
        runResult as {
          result?: {
            cycleId: string;
            approved: boolean;
            iterations: number;
            orderSubmission: { submitted: boolean; orderIds: string[]; errors: string[] };
            mode: "STUB" | "LLM";
            configVersion: string | null;
          };
        }
      ).result ?? {
        cycleId,
        approved: false,
        iterations: 0,
        orderSubmission: { submitted: false, orderIds: [], errors: ["No result returned"] },
        mode: "STUB" as const,
        configVersion: null,
      };

      cycleState.status = "completed";
      cycleState.completedAt = new Date().toISOString();

      // Persist cycle completion to database
      await updateCycleState(environment, cycleId, "complete");

      const durationMs = Date.now() - startTime;
      if (cyclesRepo) {
        try {
          const decisionsRepo = await getDecisionsRepo();
          const decisionsResult = await decisionsRepo.findMany({ cycleId, environment });
          const decisionSummaries = decisionsResult.data.map((d) => ({
            symbol: d.symbol,
            action: d.action as "BUY" | "SELL" | "HOLD",
            direction: d.direction as "LONG" | "SHORT" | "FLAT",
            confidence: d.confidenceScore ?? 0,
          }));

          await cyclesRepo.complete(cycleId, {
            approved: workflowResult.approved,
            iterations: workflowResult.iterations,
            decisions: decisionSummaries,
            orders: workflowResult.orderSubmission.orderIds.map((orderId) => ({
              orderId,
              symbol: "unknown",
              side: "buy" as const,
              quantity: 0,
              status: "submitted" as const,
            })),
            durationMs,
          });
        } catch {
          // Non-critical - log but don't fail
        }
      }

      const statusMessage = workflowResult.approved
        ? `Cycle completed: ${workflowResult.iterations} iteration(s), plan approved`
        : `Cycle completed: ${workflowResult.iterations} iteration(s), plan rejected`;
      emitProgress("complete", 100, "done", statusMessage);
      emitResult("completed", durationMs, workflowResult);

      try {
        const decisionsRepo = await getDecisionsRepo();
        const decisionsResult = await decisionsRepo.findMany({ cycleId, environment });
        if (decisionsResult.data.length > 0) {
          broadcastCycleProgress({
            type: "cycle_progress",
            data: {
              cycleId,
              phase: "complete" as const,
              step: "decisions_ready",
              progress: 100,
              message: `${decisionsResult.data.length} decision(s) ready`,
              timestamp: new Date().toISOString(),
            },
          });
        }
      } catch {
        // Decision broadcast is non-critical
      }
    } catch (error) {
      cycleState.status = "failed";
      cycleState.completedAt = new Date().toISOString();
      cycleState.error = error instanceof Error ? error.message : "Unknown error";
      const durationMs = Date.now() - startTime;

      if (cyclesRepo) {
        try {
          await cyclesRepo.fail(
            cycleId,
            cycleState.error,
            error instanceof Error ? error.stack : undefined,
            durationMs
          );
        } catch {
          // Non-critical
        }
      }

      emitProgress("error", 0, "failed", `Cycle failed: ${cycleState.error}`);
      emitResult("failed", durationMs, undefined, cycleState.error);
    }
  };

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

export default app;
