/**
 * Internal Worker Events Route
 *
 * Accepts streaming events from the worker process and broadcasts
 * them to connected WebSocket clients. This enables real-time
 * agent activity visibility for scheduled trading cycles.
 *
 * Authentication: Uses internal secret (WORKER_INTERNAL_SECRET)
 * to prevent unauthorized access.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getCyclesRepo } from "../../db.js";
import {
	flushSync,
	queueAgentComplete,
	queueAgentStart,
	queueReasoningDelta,
	queueTextDelta,
	queueToolCall,
	queueToolResult,
	setCyclesRepository,
} from "../../services/cycle-event-persistence.js";
import {
	broadcastAgentOutput,
	broadcastAgentReasoning,
	broadcastAgentTextDelta,
	broadcastAgentToolCall,
	broadcastAgentToolResult,
	broadcastCycleProgress,
	broadcastCycleResult,
} from "../../websocket/handler.js";

const app = new OpenAPIHono();

// ============================================
// Authentication Middleware
// ============================================

const INTERNAL_SECRET = Bun.env.WORKER_INTERNAL_SECRET ?? "dev-internal-secret";

/**
 * Validate internal secret for worker-to-dashboard communication.
 */
function validateInternalAuth(authHeader: string | undefined): boolean {
	if (!authHeader) {
		return false;
	}
	const [scheme, token] = authHeader.split(" ");
	if (scheme !== "Bearer" || !token) {
		return false;
	}
	return token === INTERNAL_SECRET;
}

// ============================================
// Schemas
// ============================================

const AgentTypeSchema = z.enum([
	"grounding",
	"news",
	"fundamentals",
	"bullish",
	"bearish",
	"trader",
	"risk",
	"critic",
]);

const CyclePhaseSchema = z.enum(["observe", "orient", "decide", "act", "complete", "error"]);

const AgentEventSchema = z.object({
	type: z.enum(["agent-start", "agent-chunk", "agent-complete", "agent-error"]),
	agentType: AgentTypeSchema,
	cycleId: z.string(),
	timestamp: z.string(),
	// For agent-chunk: chunk data
	chunkType: z
		.enum(["text-delta", "reasoning-delta", "tool-call", "tool-result", "error"])
		.optional(),
	text: z.string().optional(),
	toolCallId: z.string().optional(),
	toolName: z.string().optional(),
	toolArgs: z.string().optional(),
	result: z.string().optional(),
	success: z.boolean().optional(),
	// For agent-complete/error
	output: z.string().optional(),
	error: z.string().optional(),
	durationMs: z.number().optional(),
});

const CycleProgressEventSchema = z.object({
	type: z.literal("cycle-progress"),
	cycleId: z.string(),
	phase: CyclePhaseSchema,
	step: z.string(),
	progress: z.number().min(0).max(100),
	message: z.string(),
	timestamp: z.string(),
});

const EnvironmentSchema = z.enum(["BACKTEST", "PAPER", "LIVE"]);

const CycleResultEventSchema = z.object({
	type: z.literal("cycle-result"),
	cycleId: z.string(),
	environment: EnvironmentSchema,
	status: z.enum(["completed", "failed"]),
	durationMs: z.number(),
	approved: z.boolean().optional(),
	iterations: z.number().optional(),
	error: z.string().optional(),
	timestamp: z.string(),
});

const CycleStartEventSchema = z.object({
	type: z.literal("cycle-start"),
	cycleId: z.string(),
	environment: EnvironmentSchema,
	instruments: z.array(z.string()),
	configVersion: z.string().optional(),
	timestamp: z.string(),
});

const WorkerEventSchema = z.discriminatedUnion("type", [
	AgentEventSchema,
	CycleProgressEventSchema,
	CycleResultEventSchema,
	CycleStartEventSchema,
]);

const BatchEventsRequestSchema = z.object({
	events: z.array(WorkerEventSchema),
});

// ============================================
// Routes
// ============================================

// POST /api/system/worker-events
const workerEventsRoute = createRoute({
	method: "post",
	path: "/",
	request: {
		body: {
			content: { "application/json": { schema: BatchEventsRequestSchema } },
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ processed: z.number() }),
				},
			},
			description: "Events processed successfully",
		},
		401: {
			content: {
				"application/json": {
					schema: z.object({ error: z.string() }),
				},
			},
			description: "Unauthorized",
		},
	},
	tags: ["Internal"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(workerEventsRoute, async (c) => {
	// Validate internal auth
	const authHeader = c.req.header("Authorization");
	if (!validateInternalAuth(authHeader)) {
		throw new HTTPException(401, { message: "Invalid internal authorization" });
	}

	const { events } = c.req.valid("json");
	let processed = 0;

	for (const event of events) {
		try {
			switch (event.type) {
				case "cycle-start": {
					// Initialize cycle in database
					try {
						const cyclesRepo = await getCyclesRepo();
						setCyclesRepository(cyclesRepo);
						await cyclesRepo.start(
							event.environment,
							event.instruments.length,
							event.configVersion,
							event.cycleId
						);
					} catch {
						// Non-critical - continue even if DB fails
					}

					// Broadcast progress
					broadcastCycleProgress({
						type: "cycle_progress",
						data: {
							cycleId: event.cycleId,
							phase: "observe",
							step: "starting",
							progress: 0,
							message: "Starting trading cycle...",
							timestamp: event.timestamp,
						},
					});
					break;
				}

				case "cycle-progress": {
					broadcastCycleProgress({
						type: "cycle_progress",
						data: {
							cycleId: event.cycleId,
							phase: event.phase,
							step: event.step,
							progress: event.progress,
							message: event.message,
							timestamp: event.timestamp,
						},
					});
					break;
				}

				case "cycle-result": {
					// Flush any pending streaming events
					try {
						await flushSync(event.cycleId);
					} catch {
						// Non-critical
					}

					broadcastCycleResult({
						type: "cycle_result",
						data: {
							cycleId: event.cycleId,
							environment: event.environment,
							status: event.status,
							durationMs: event.durationMs,
							error: event.error,
							result:
								event.status === "completed"
									? {
											approved: event.approved ?? false,
											iterations: event.iterations ?? 0,
											decisions: [],
											orders: [],
										}
									: undefined,
							timestamp: event.timestamp,
						},
					});
					break;
				}

				case "agent-start": {
					broadcastAgentOutput({
						type: "agent_output",
						data: {
							cycleId: event.cycleId,
							agentType: event.agentType,
							status: "running",
							output: `${event.agentType} agent started`,
							timestamp: event.timestamp,
						},
					});
					queueAgentStart(event.cycleId, event.agentType);
					break;
				}

				case "agent-chunk": {
					if (event.chunkType === "text-delta" && event.text) {
						broadcastAgentTextDelta({
							type: "agent_text_delta",
							data: {
								cycleId: event.cycleId,
								agentType: event.agentType,
								text: event.text,
								timestamp: event.timestamp,
							},
						});
						queueTextDelta(event.cycleId, event.agentType, event.text);
					} else if (event.chunkType === "reasoning-delta" && event.text) {
						broadcastAgentReasoning({
							type: "agent_reasoning",
							data: {
								cycleId: event.cycleId,
								agentType: event.agentType,
								text: event.text,
								timestamp: event.timestamp,
							},
						});
						queueReasoningDelta(event.cycleId, event.agentType, event.text);
					} else if (event.chunkType === "tool-call" && event.toolName) {
						broadcastAgentToolCall({
							type: "agent_tool_call",
							data: {
								cycleId: event.cycleId,
								agentType: event.agentType,
								toolName: event.toolName,
								toolArgs: event.toolArgs ?? "{}",
								toolCallId: event.toolCallId ?? `tc_${Date.now()}`,
								timestamp: event.timestamp,
							},
						});
						queueToolCall(event.cycleId, event.agentType, {
							toolCallId: event.toolCallId ?? `tc_${Date.now()}`,
							toolName: event.toolName,
							toolArgs: event.toolArgs ?? "{}",
						});
					} else if (event.chunkType === "tool-result") {
						broadcastAgentToolResult({
							type: "agent_tool_result",
							data: {
								cycleId: event.cycleId,
								agentType: event.agentType,
								toolName: event.toolName ?? "unknown",
								toolCallId: event.toolCallId ?? `tc_${Date.now()}`,
								resultSummary: event.result ?? "",
								success: event.success ?? true,
								timestamp: event.timestamp,
							},
						});
						queueToolResult(event.cycleId, event.agentType, {
							toolCallId: event.toolCallId ?? `tc_${Date.now()}`,
							toolName: event.toolName ?? "unknown",
							success: event.success ?? true,
							resultSummary: event.result ?? "",
						});
					} else if (event.chunkType === "error" && event.error) {
						broadcastAgentOutput({
							type: "agent_output",
							data: {
								cycleId: event.cycleId,
								agentType: event.agentType,
								status: "error",
								output: event.error,
								error: event.error,
								timestamp: event.timestamp,
							},
						});
					}
					break;
				}

				case "agent-complete": {
					broadcastAgentOutput({
						type: "agent_output",
						data: {
							cycleId: event.cycleId,
							agentType: event.agentType,
							status: "complete",
							output: event.output ?? "",
							durationMs: event.durationMs,
							timestamp: event.timestamp,
						},
					});
					queueAgentComplete(event.cycleId, event.agentType, { output: event.output });
					break;
				}

				case "agent-error": {
					broadcastAgentOutput({
						type: "agent_output",
						data: {
							cycleId: event.cycleId,
							agentType: event.agentType,
							status: "error",
							output: event.error ?? "Unknown error",
							error: event.error,
							timestamp: event.timestamp,
						},
					});
					break;
				}
			}
			processed++;
		} catch {
			// Log but continue processing other events
		}
	}

	return c.json({ processed });
});

export default app;
