/**
 * System Cycle Routes
 *
 * Endpoints for triggering and monitoring trading cycles.
 */

import { tradingCycleWorkflow } from "@cream/api";
import type { CyclePhase, CycleProgressData, CycleResultData } from "@cream/domain/websocket";
import { reconstructStreamingState } from "@cream/storage";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getCyclesRepo, getDecisionsRepo, getRuntimeConfigService } from "../../db.js";
import log from "../../logger.js";
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
import {
	getLastTriggerTime,
	getRunningCycles,
	setLastTriggerTime,
	setRunningCycle,
	updateCycleState,
} from "./state.js";
import {
	CycleListQuerySchema,
	CycleListResponseSchema,
	type CycleState,
	CycleStatusResponseSchema,
	FullCycleResponseSchema,
	TRIGGER_RATE_LIMIT_MS,
	TriggerCycleRequestSchema,
	TriggerCycleResponseSchema,
} from "./types.js";

const app = new OpenAPIHono();

// ============================================
// Internal Auth Helper
// ============================================

const INTERNAL_SECRET = Bun.env.WORKER_INTERNAL_SECRET ?? "dev-internal-secret";

/**
 * Check if request is using internal auth (from worker).
 * Internal requests skip rate limiting.
 */
function isInternalAuth(authHeader: string | undefined): boolean {
	if (!authHeader?.startsWith("Bearer ")) {
		return false;
	}
	return authHeader.slice(7) === INTERNAL_SECRET;
}

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

	// Skip rate limit for internal auth (scheduled worker calls)
	const isInternal = isInternalAuth(c.req.header("Authorization"));
	if (!isInternal) {
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
	}

	const startedAt = new Date().toISOString();

	let configVersion: string | null = null;
	try {
		const configService = await getRuntimeConfigService();
		const config = useDraftConfig
			? await configService.getDraft(environment)
			: await configService.getActiveConfig(environment);
		configVersion = config.trading.id;
	} catch {
		return c.json({ error: "No configuration found for environment. Run db:seed first." }, 400);
	}

	// Create cycle in database first - DB generates UUID via uuidv7()
	let cycleId: string;
	const cyclesRepo = getCyclesRepo();
	setCyclesRepository(cyclesRepo);
	try {
		const cycle = await cyclesRepo.start(
			environment,
			symbols?.length ?? 0,
			configVersion ?? undefined
		);
		cycleId = cycle.id;
	} catch (error) {
		return c.json(
			{
				error: `Failed to create cycle: ${error instanceof Error ? error.message : "Unknown error"}`,
			},
			500
		);
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
							orders: (workflowResult.orderSubmission?.orderIds ?? []).map((orderId) => ({
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

	const runCycle = async () => {
		const startTime = Date.now();
		cycleState.status = "running";

		emitProgress("observe", 0, "starting", "Starting trading cycle...");

		try {
			emitProgress("observe", 10, "market_data", "Fetching market data...");

			// Execute workflow with streaming - forward agent events to WebSocket
			const run = await tradingCycleWorkflow.createRun();
			const stream = await run.stream({
				inputData: {
					cycleId,
					instruments: symbols,
					useDraftConfig,
				},
			});

			// Map workflow agent types to WebSocket agent types
			const agentTypeMap: Record<
				string,
				"grounding" | "news" | "fundamentals" | "bullish" | "bearish" | "trader" | "risk" | "critic"
			> = {
				grounding_agent: "grounding",
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
				decisionPlan?: {
					cycleId: string;
					timestamp: string;
					decisions: Array<{
						decisionId: string;
						instrumentId: string;
						action: "BUY" | "SELL" | "HOLD" | "CLOSE";
						direction: "LONG" | "SHORT" | "FLAT";
						size: { value: number; unit: string };
						strategyFamily: string;
						timeHorizon: string;
						rationale: {
							summary: string;
							bullishFactors: string[];
							bearishFactors: string[];
							decisionLogic: string;
							memoryReferences: string[];
						};
						thesisState: string;
					}>;
					portfolioNotes: string;
				};
				mode: "STUB" | "LLM";
				configVersion: string | null;
			} | null = null;

			// Process stream events
			for await (const event of stream.fullStream) {
				// Cast to access properties - Mastra runtime emits more event types than TS types declare
				const evt = event as unknown as Record<string, unknown>;

				// Extract agent event from stream
				// With writer.write(), events come as workflow-step-output with data in payload.output
				let agentEvt: Record<string, unknown> | null = null;

				// Helper to check if an object is an agent event
				const isAgentEvent = (obj: unknown): obj is Record<string, unknown> => {
					if (!obj || typeof obj !== "object") {
						return false;
					}
					const o = obj as Record<string, unknown>;
					return (
						o.type === "agent-start" ||
						o.type === "agent-chunk" ||
						o.type === "agent-complete" ||
						o.type === "agent-error"
					);
				};

				// Primary path: workflow-step-output from writer.write()
				if (evt.type === "workflow-step-output" && evt.payload) {
					const payload = evt.payload as Record<string, unknown>;
					// writer.write() puts data in payload.output
					if (isAgentEvent(payload.output)) {
						agentEvt = payload.output as Record<string, unknown>;
					}
				}
				// Fallback: direct agent event (unlikely but supported)
				else if (isAgentEvent(evt)) {
					agentEvt = evt;
				}

				// Handle agent events
				if (agentEvt) {
					const agentEvent = agentEvt as {
						type: string;
						agent: string;
						cycleId?: string;
						data?: Record<string, unknown>;
						error?: string;
						timestamp?: string;
					};

					const agentType = agentTypeMap[agentEvent.agent ?? ""];
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
							queueAgentStart(cycleId, agentType);
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
								queueTextDelta(cycleId, agentType, textContent);
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
								queueReasoningDelta(cycleId, agentType, textContent);
							} else if (chunkType === "tool-result" || result !== undefined) {
								const resolvedToolCallId = toolCallId ?? `tc_${Date.now()}`;
								const resolvedToolName = String(toolName ?? "unknown");
								const resolvedSuccess = success ?? true;
								const resolvedResultSummary = JSON.stringify(result ?? {}).slice(0, 200);
								broadcastAgentToolResult({
									type: "agent_tool_result",
									data: {
										cycleId,
										agentType,
										toolName: resolvedToolName,
										toolCallId: resolvedToolCallId,
										resultSummary: resolvedResultSummary,
										success: resolvedSuccess,
										timestamp: ts,
									},
								});
								queueToolResult(cycleId, agentType, {
									toolCallId: resolvedToolCallId,
									toolName: resolvedToolName,
									success: resolvedSuccess,
									resultSummary: resolvedResultSummary,
								});
							} else if (
								chunkType === "tool-call" ||
								(toolName !== undefined && toolArgs !== undefined)
							) {
								const resolvedToolCallId = toolCallId ?? `tc_${Date.now()}`;
								const resolvedToolName = String(toolName ?? "unknown");
								const resolvedToolArgs = JSON.stringify(toolArgs ?? {});
								broadcastAgentToolCall({
									type: "agent_tool_call",
									data: {
										cycleId,
										agentType,
										toolName: resolvedToolName,
										toolArgs: resolvedToolArgs,
										toolCallId: resolvedToolCallId,
										timestamp: ts,
									},
								});
								queueToolCall(cycleId, agentType, {
									toolCallId: resolvedToolCallId,
									toolName: resolvedToolName,
									toolArgs: resolvedToolArgs,
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
							queueAgentComplete(cycleId, agentType, { output: agentEvent.data?.output });
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

				// Note: workflow-finish event contains usage stats, not the result
				// The actual workflow result must come from stream.result
			}

			// Check stream status for success
			if (stream.status !== "success") {
				throw new Error("Workflow execution failed");
			}

			// Always get the result from stream.result - this is the authoritative source
			// The workflow-finish event contains usage stats, not the workflow output
			if (stream.result) {
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

			// Flush remaining streaming events to database
			try {
				await flushSync(cycleId);
			} catch {
				// Non-critical
			}

			// Persist cycle completion to database
			await updateCycleState(environment, cycleId, "complete");

			// Persist decisions from workflow result to database
			if (workflowResult.decisionPlan?.decisions?.length) {
				log.info(
					{
						cycleId,
						decisionCount: workflowResult.decisionPlan.decisions.length,
						decisions: workflowResult.decisionPlan.decisions.map((d) => ({
							id: d.decisionId,
							symbol: d.instrumentId,
							action: d.action,
							size: d.size,
						})),
					},
					"Persisting decisions from workflow"
				);

				const decisionsRepo = await getDecisionsRepo();
				const status = workflowResult.approved ? "approved" : "rejected";

				const validSizeUnits = ["SHARES", "CONTRACTS", "DOLLARS", "PCT_EQUITY"] as const;
				type SizeUnit = (typeof validSizeUnits)[number];

				let persistedCount = 0;

				for (const decision of workflowResult.decisionPlan.decisions) {
					const sizeUnit: SizeUnit | undefined = validSizeUnits.includes(
						decision.size.unit as SizeUnit
					)
						? (decision.size.unit as SizeUnit)
						: undefined;

					try {
						await decisionsRepo.create({
							id: decision.decisionId,
							cycleId,
							symbol: decision.instrumentId,
							action: decision.action === "CLOSE" ? "SELL" : decision.action,
							direction: decision.direction,
							size: decision.size.value,
							sizeUnit,
							status,
							strategyFamily: decision.strategyFamily,
							timeHorizon: decision.timeHorizon,
							rationale: decision.rationale?.summary ?? null,
							bullishFactors: decision.rationale?.bullishFactors ?? [],
							bearishFactors: decision.rationale?.bearishFactors ?? [],
							environment,
						});
						persistedCount++;
					} catch (err) {
						log.error(
							{
								decisionId: decision.decisionId,
								symbol: decision.instrumentId,
								size: decision.size,
								error: err instanceof Error ? err.message : String(err),
							},
							"Failed to persist decision"
						);
					}
				}

				log.info(
					{ cycleId, persistedCount, total: workflowResult.decisionPlan.decisions.length },
					"Decision persistence complete"
				);
			} else {
				log.info({ cycleId }, "No decisions in workflow result to persist");
			}

			const durationMs = Date.now() - startTime;
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
					orders: (workflowResult.orderSubmission?.orderIds ?? []).map((orderId) => ({
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

			// Flush remaining streaming events to database
			try {
				await flushSync(cycleId);
			} catch {
				// Non-critical
			}

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

	// Reconstruct streaming state from events
	const events = await cyclesRepo.findStreamingEvents(id);
	const streamingState = reconstructStreamingState(events);

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
