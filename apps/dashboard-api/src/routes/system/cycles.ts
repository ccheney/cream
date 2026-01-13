/**
 * System Cycle Routes
 *
 * Endpoints for triggering and monitoring trading cycles.
 */

import { tradingCycleWorkflow } from "@cream/api";
import type { CyclePhase, CycleProgressData, CycleResultData } from "@cream/domain/websocket";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getCyclesRepo, getDecisionsRepo, getRuntimeConfigService } from "../../db.js";
import {
  broadcastAgentOutput,
  broadcastAgentReasoning,
  broadcastAgentTextDelta,
  broadcastAgentToolCall,
  broadcastAgentToolResult,
  broadcastCycleProgress,
  broadcastCycleResult,
} from "../../websocket/handler.js";
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

      // Execute workflow with streaming - forward agent events to WebSocket
      const run = await tradingCycleWorkflow.createRun();
      const stream = await run.stream({
        inputData: {
          cycleId,
          instruments: symbols,
          forceStub: useDraftConfig, // draft config testing uses stub mode
        },
      });

      // Map workflow agent types to WebSocket agent types
      const agentTypeMap: Record<
        string,
        "news" | "fundamentals" | "bullish" | "bearish" | "trader" | "risk" | "critic"
      > = {
        news_analyst: "news",
        fundamentals_analyst: "fundamentals",
        bullish_researcher: "bullish",
        bearish_researcher: "bearish",
        trader: "trader",
        risk_manager: "risk",
        critic: "critic",
      };

      // Track workflow result
      let workflowResult: {
        cycleId: string;
        approved: boolean;
        iterations: number;
        orderSubmission: { submitted: boolean; orderIds: string[]; errors: string[] };
        mode: "STUB" | "LLM";
        configVersion: string | null;
      } | null = null;

      // Process stream events
      for await (const event of stream.fullStream) {
        // Cast to access properties - Mastra runtime emits more event types than TS types declare
        const evt = event as unknown as Record<string, unknown>;

        // Extract the actual event - check for wrapped events (Mastra may wrap in workflow-step-output)
        let agentEvt: Record<string, unknown> | null = null;

        // Check if this is a direct agent event
        if (
          evt.type === "agent-start" ||
          evt.type === "agent-chunk" ||
          evt.type === "agent-complete" ||
          evt.type === "agent-error"
        ) {
          agentEvt = evt;
        }
        // Check for wrapped events in payload (Mastra 1.0 may wrap custom events)
        else if (evt.type === "workflow-step-output" && evt.payload) {
          const payload = evt.payload as Record<string, unknown>;
          // First check if type is directly on payload
          if (
            payload.type === "agent-start" ||
            payload.type === "agent-chunk" ||
            payload.type === "agent-complete" ||
            payload.type === "agent-error"
          ) {
            agentEvt = payload;
          }
          // Then check inside payload.output (where writer.write() data goes)
          else if (payload.output) {
            const output = payload.output as Record<string, unknown>;
            if (
              output.type === "agent-start" ||
              output.type === "agent-chunk" ||
              output.type === "agent-complete" ||
              output.type === "agent-error"
            ) {
              agentEvt = output;
            }
          }
        }
        // Check for custom events (writer.custom() emits with different structure)
        else if (evt.type === "step-output" && evt.output) {
          const output = evt.output as Record<string, unknown>;
          if (
            output.type === "agent-start" ||
            output.type === "agent-chunk" ||
            output.type === "agent-complete" ||
            output.type === "agent-error"
          ) {
            agentEvt = output;
          }
        }
        // Check for workflow-custom event type (from writer.custom())
        else if (evt.type === "workflow-custom" && evt.payload) {
          const payload = evt.payload as Record<string, unknown>;
          if (
            payload.type === "agent-start" ||
            payload.type === "agent-chunk" ||
            payload.type === "agent-complete" ||
            payload.type === "agent-error"
          ) {
            agentEvt = payload;
          }
          // Also check inside data field
          else if (payload.data) {
            const data = payload.data as Record<string, unknown>;
            if (
              data.type === "agent-start" ||
              data.type === "agent-chunk" ||
              data.type === "agent-complete" ||
              data.type === "agent-error"
            ) {
              agentEvt = data;
            }
          }
        }
        // Fallback: check if evt itself contains agent fields directly (for unknown wrappers)
        else if (evt.agent && typeof evt.agent === "string") {
          const evtType = evt.type as string;
          if (
            evtType?.startsWith("agent-") ||
            evtType === "agent-start" ||
            evtType === "agent-chunk" ||
            evtType === "agent-complete" ||
            evtType === "agent-error"
          ) {
            agentEvt = evt;
          }
        }

        // Handle agent events (direct or unwrapped)
        if (agentEvt) {
          const agentEvent = agentEvt as {
            type: string;
            agent?: string;
            cycleId?: string;
            data?: Record<string, unknown>;
            payload?: Record<string, unknown>;
            error?: string;
            timestamp?: string;
          };

          // Extract agent from different locations depending on event structure
          const agentName =
            agentEvent.agent ??
            (agentEvent.payload?.agent as string | undefined) ??
            (agentEvent.data?.agent as string | undefined);

          const agentType = agentTypeMap[agentName ?? ""];
          if (!agentType) {
            continue;
          }

          const ts = agentEvent.timestamp ?? new Date().toISOString();

          switch (agentEvent.type) {
            case "agent-start":
              broadcastAgentOutput({
                type: "agent_output",
                data: {
                  cycleId,
                  agentType,
                  status: "running",
                  output: `${agentType} agent started`,
                  timestamp: ts,
                },
              });
              break;

            case "agent-chunk": {
              // AgentStreamChunk structure: data.type + data.payload
              const outerData = agentEvent.data as Record<string, unknown> | undefined;
              const innerPayload = outerData?.payload as Record<string, unknown> | undefined;

              const chunkType = outerData?.type as string | undefined;
              const textContent = innerPayload?.text as string | undefined;
              const toolCallId = innerPayload?.toolCallId as string | undefined;
              const toolName = innerPayload?.toolName as string | undefined;
              const toolArgs = innerPayload?.toolArgs as Record<string, unknown> | undefined;
              const result = innerPayload?.result;
              const success = innerPayload?.success as boolean | undefined;
              const errorText = innerPayload?.error as string | undefined;

              if (chunkType === "text-delta" && textContent) {
                broadcastAgentTextDelta({
                  type: "agent_text_delta",
                  data: {
                    cycleId,
                    agentType,
                    text: textContent,
                    timestamp: ts,
                  },
                });
              } else if (chunkType === "reasoning-delta" && textContent) {
                // reasoning-delta is the AgentStreamChunk type for reasoning output
                broadcastAgentReasoning({
                  type: "agent_reasoning",
                  data: {
                    cycleId,
                    agentType,
                    text: textContent,
                    timestamp: ts,
                  },
                });
              } else if (chunkType === "tool-call" || toolName) {
                broadcastAgentToolCall({
                  type: "agent_tool_call",
                  data: {
                    cycleId,
                    agentType,
                    toolName: String(toolName ?? "unknown"),
                    toolArgs: JSON.stringify(toolArgs ?? {}),
                    toolCallId: toolCallId ?? `tc_${Date.now()}`,
                    timestamp: ts,
                  },
                });
              } else if (chunkType === "tool-result" || result) {
                broadcastAgentToolResult({
                  type: "agent_tool_result",
                  data: {
                    cycleId,
                    agentType,
                    toolName: String(toolName ?? "unknown"),
                    toolCallId: toolCallId ?? `tc_${Date.now()}`,
                    resultSummary: JSON.stringify(result ?? {}).slice(0, 200),
                    success: success ?? true,
                    timestamp: ts,
                  },
                });
              } else if (chunkType === "error" && errorText) {
                broadcastAgentOutput({
                  type: "agent_output",
                  data: {
                    cycleId,
                    agentType,
                    status: "error",
                    output: errorText,
                    error: errorText,
                    timestamp: ts,
                  },
                });
              }
              break;
            }

            case "agent-complete":
              broadcastAgentOutput({
                type: "agent_output",
                data: {
                  cycleId,
                  agentType,
                  status: "complete",
                  output: JSON.stringify(agentEvent.data?.output ?? {}).slice(0, 500),
                  timestamp: ts,
                },
              });
              break;

            case "agent-error":
              broadcastAgentOutput({
                type: "agent_output",
                data: {
                  cycleId,
                  agentType,
                  status: "error",
                  output: agentEvent.error ?? "Unknown error",
                  error: agentEvent.error,
                  timestamp: ts,
                },
              });
              break;
          }
        }

        // Handle step completion events for progress updates
        if (evt.type === "workflow-step-finish") {
          const stepId = String((evt.payload as Record<string, unknown>)?.stepName ?? "");
          const stepProgress: Record<string, { phase: CyclePhase; progress: number }> = {
            observe: { phase: "observe", progress: 20 },
            orient: { phase: "orient", progress: 30 },
            analysts: { phase: "decide", progress: 45 },
            debate: { phase: "decide", progress: 60 },
            trader: { phase: "decide", progress: 75 },
            consensus: { phase: "decide", progress: 90 },
            act: { phase: "act", progress: 100 },
          };
          const stepInfo = stepProgress[stepId];
          if (stepInfo) {
            emitProgress(stepInfo.phase, stepInfo.progress, stepId, `Completed ${stepId} step`);
          }
        }

        // Capture final result
        if (evt.type === "workflow-finish") {
          const payload = evt.payload as Record<string, unknown> | undefined;
          if (payload?.result) {
            workflowResult = payload.result as unknown as NonNullable<typeof workflowResult>;
          }
        }
      }

      // Check stream status for success
      if (stream.status !== "success") {
        throw new Error("Workflow execution failed");
      }

      // Use stream.result if we didn't capture from events
      if (!workflowResult && stream.result) {
        workflowResult = (await stream.result) as unknown as NonNullable<typeof workflowResult>;
      }

      // Fallback if no result
      if (!workflowResult) {
        workflowResult = {
          cycleId,
          approved: false,
          iterations: 0,
          orderSubmission: { submitted: false, orderIds: [], errors: ["No result returned"] },
          mode: "STUB" as const,
          configVersion: null,
        };
      }

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
