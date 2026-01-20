/**
 * Trading Cycle Workflow
 *
 * Implements the hourly OODA loop using native Mastra workflow patterns:
 * - OBSERVE: Fetch market snapshot
 * - ORIENT: Load memory context, compute regimes
 * - DECIDE: Run agents (analysts → debate → trader → consensus)
 * - ACT: Submit orders via Rust execution engine
 *
 * Streaming: Each step emits agent events via the writer parameter.
 * Use run.stream() to receive real-time updates.
 *
 * @see docs/plans/21-mastra-workflow-refactor.md
 */

import { createNodeLogger } from "@cream/logger";
import type { ToolStream } from "@mastra/core/tools";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import type { AgentStreamChunk, ToolResultEntry } from "../../agents/types.js";
import type { Decision, ThesisUpdate } from "../steps/trading-cycle/types.js";
import { WorkflowResultSchema } from "./schemas.js";

const log = createNodeLogger({ service: "trading-cycle", level: "info" });

// ============================================
// Stream Event Types
// ============================================

type AgentType =
	| "grounding_agent"
	| "news_analyst"
	| "fundamentals_analyst"
	| "bullish_researcher"
	| "bearish_researcher"
	| "trader"
	| "risk_manager"
	| "critic";

interface AgentEvent {
	type: "agent-start" | "agent-chunk" | "agent-complete" | "agent-error";
	agent: AgentType;
	cycleId: string;
	data?: AgentStreamChunk | Record<string, unknown>;
	error?: string;
	timestamp: string;
}

/**
 * Emit an agent event via the workflow writer.
 * Uses writer.write() for step output - produces consistent workflow-step-output events.
 */
async function emitAgentEvent(writer: ToolStream | undefined, event: AgentEvent): Promise<void> {
	if (writer) {
		// Use write() for step output - easier to unwrap downstream
		await writer.write(event);
	}
}

// ============================================
// Simplified Step Schemas
// ============================================

const AnyInputSchema = z.any();
const AnyOutputSchema = z.any();
const MinimalStateSchema = z.object({
	cycleId: z.string().optional(),
	mode: z.enum(["STUB", "LLM"]).optional(),
	approved: z.boolean().optional(),
	iterations: z.number().optional(),
});

// ============================================
// Step Definitions (Inline for simplicity)
// ============================================

const observeStep = createStep({
	id: "observe",
	description: "Fetch market snapshot",
	inputSchema: z.object({
		cycleId: z.string(),
		instruments: z.array(z.string()),
	}),
	outputSchema: AnyOutputSchema,
	stateSchema: MinimalStateSchema,
	execute: async ({ inputData, setState }) => {
		// Import dynamically to avoid circular deps
		const { fetchMarketSnapshot } = await import("../steps/trading-cycle/observe.js");
		const snapshot = await fetchMarketSnapshot(inputData.instruments);
		await setState({ cycleId: inputData.cycleId });
		return { snapshot, cycleId: inputData.cycleId, instruments: inputData.instruments };
	},
});

const orientStep = createStep({
	id: "orient",
	description: "Load memory, compute regimes, fetch prediction signals, and overnight brief",
	inputSchema: AnyInputSchema,
	outputSchema: AnyOutputSchema,
	stateSchema: MinimalStateSchema,
	execute: async ({ inputData, state, setState }) => {
		// Determine execution mode: STUB for testing (NODE_ENV=test), LLM for real agent reasoning
		const isTest = process.env.NODE_ENV === "test";
		const mode = isTest ? "STUB" : "LLM";
		await setState({ ...state, mode });

		// Default empty context for STUB mode
		let overnightBrief: string | null = null;
		let regimeLabels: Record<string, { regime: string; confidence: number; reasoning?: string }> =
			{};
		let memory: Record<string, unknown> = {};
		let predictionMarketSignals: Record<string, unknown> | undefined;
		let agentConfigs:
			| Record<string, { enabled: boolean; systemPromptOverride?: string | null }>
			| undefined;
		let constraints:
			| {
					perInstrument: {
						maxShares: number;
						maxContracts: number;
						maxNotional: number;
						maxPctEquity: number;
					};
					portfolio: {
						maxGrossExposure: number;
						maxNetExposure: number;
						maxConcentration: number;
						maxCorrelation: number;
						maxDrawdown: number;
						maxRiskPerTrade: number;
						maxSectorExposure: number;
						maxPositions: number;
					};
					options: {
						maxDelta: number;
						maxGamma: number;
						maxVega: number;
						maxTheta: number;
					};
			  }
			| undefined;
		let recentEvents: Array<{
			id: string;
			sourceType: string;
			eventType: string;
			eventTime: string;
			sentiment: string;
			summary: string;
			importanceScore: number;
			relatedInstruments: string[];
		}> = [];

		if (mode === "LLM") {
			// Load all context data in parallel for efficiency
			const [
				newspaperResult,
				regimesResult,
				predictionResult,
				configResult,
				eventsResult,
				memoryResult,
			] = await Promise.allSettled([
				// 1. Morning newspaper
				(async () => {
					const { getMacroWatchRepo } = await import("../../../db.js");
					const { formatNewspaperForLLM } = await import("../macro-watch/newspaper.js");
					const repo = await getMacroWatchRepo();
					const today = new Date().toISOString().slice(0, 10);
					const newspaper = await repo.getNewspaperByDate(today);
					if (newspaper) {
						log.info({ date: today }, "Morning newspaper injected into Orient phase");
						return formatNewspaperForLLM(newspaper.sections);
					}
					return null;
				})(),

				// 2. Regime classifications
				(async () => {
					const { computeAndStoreRegimes } = await import("../steps/trading-cycle/orient.js");
					return computeAndStoreRegimes(inputData.snapshot);
				})(),

				// 3. Prediction market signals
				(async () => {
					const { getLatestPredictionMarketSignals } = await import(
						"../../steps/fetchPredictionMarkets.js"
					);
					const pmContext = await getLatestPredictionMarketSignals();
					if (pmContext) {
						return {
							fedCutProbability: pmContext.signals.fedCutProbability,
							fedHikeProbability: pmContext.signals.fedHikeProbability,
							recessionProbability12m: pmContext.signals.recessionProbability12m,
							macroUncertaintyIndex: pmContext.signals.macroUncertaintyIndex,
							policyEventRisk: pmContext.signals.policyEventRisk,
							marketConfidence: pmContext.signals.marketConfidence,
							cpiSurpriseDirection: pmContext.scores.cpiSurpriseDirection,
							gdpSurpriseDirection: pmContext.scores.gdpSurpriseDirection,
							timestamp: pmContext.signals.timestamp,
							platforms: pmContext.signals.platforms,
						};
					}
					return undefined;
				})(),

				// 4. Runtime config and agent configs
				(async () => {
					const { loadRuntimeConfig, buildAgentConfigs } = await import(
						"../steps/trading-cycle/config.js"
					);
					const { createContext, requireEnv } = await import("@cream/domain");
					const ctx = createContext(requireEnv(), "scheduled");
					const runtimeConfig = await loadRuntimeConfig(ctx, inputData.useDraftConfig ?? false);
					return {
						agentConfigs: buildAgentConfigs(runtimeConfig),
						constraints: runtimeConfig?.constraints,
					};
				})(),

				// 5. Recent external events from database
				(async () => {
					const { getExternalEventsRepo } = await import("../../../db.js");
					const repo = getExternalEventsRepo();
					const events = await repo.findRecent(24, 50); // Last 24 hours, max 50 events
					return events.map((e) => ({
						id: e.id,
						sourceType: e.sourceType,
						eventType: e.eventType,
						eventTime: e.eventTime, // Already a string from the repository
						sentiment: e.sentiment ?? "NEUTRAL",
						summary: e.summary ?? "",
						importanceScore: e.importanceScore ?? 0.5,
						relatedInstruments: e.relatedInstruments ?? [],
					}));
				})(),

				// 6. Memory context (HelixDB retrieval)
				(async () => {
					const { loadMemoryContext } = await import("../steps/trading-cycle/orient.js");
					const { createContext, requireEnv } = await import("@cream/domain");
					const ctx = createContext(requireEnv(), "scheduled");
					const memoryCtx = await loadMemoryContext(inputData.snapshot, ctx);
					return { relevantCases: memoryCtx.relevantCases };
				})(),
			]);

			// Extract results, using defaults on failure
			if (newspaperResult.status === "fulfilled" && newspaperResult.value) {
				overnightBrief = newspaperResult.value;
			} else if (newspaperResult.status === "rejected") {
				log.warn({ error: String(newspaperResult.reason) }, "Failed to fetch morning newspaper");
			}

			if (regimesResult.status === "fulfilled") {
				regimeLabels = regimesResult.value;
				log.debug({ count: Object.keys(regimeLabels).length }, "Computed regime classifications");
			} else {
				log.warn({ error: String(regimesResult.reason) }, "Failed to compute regimes");
			}

			if (predictionResult.status === "fulfilled" && predictionResult.value) {
				predictionMarketSignals = predictionResult.value;
				log.debug(
					{ platforms: predictionMarketSignals.platforms },
					"Loaded prediction market signals"
				);
			} else if (predictionResult.status === "rejected") {
				log.warn(
					{ error: String(predictionResult.reason) },
					"Failed to load prediction market signals"
				);
			}

			if (configResult.status === "fulfilled" && configResult.value) {
				agentConfigs = configResult.value.agentConfigs;
				constraints = configResult.value.constraints;
				log.debug(
					{ agentCount: agentConfigs ? Object.keys(agentConfigs).length : 0 },
					"Loaded agent configs"
				);
				log.debug({ hasConstraints: !!constraints }, "Loaded runtime constraints");
			} else if (configResult.status === "rejected") {
				log.warn({ error: String(configResult.reason) }, "Failed to load agent configs");
			}

			if (eventsResult.status === "fulfilled") {
				recentEvents = eventsResult.value;
				log.debug({ count: recentEvents.length }, "Loaded recent external events");
			} else {
				log.warn({ error: String(eventsResult.reason) }, "Failed to load recent events");
			}

			if (memoryResult.status === "fulfilled") {
				memory = memoryResult.value;
				log.debug(
					{
						caseCount:
							(memoryResult.value as { relevantCases: unknown[] }).relevantCases?.length ?? 0,
					},
					"Loaded memory context"
				);
			} else {
				log.warn({ error: String(memoryResult.reason) }, "Failed to load memory context");
			}
		}

		return {
			...inputData,
			mode,
			overnightBrief,
			regimeLabels,
			memory,
			predictionMarketSignals,
			agentConfigs,
			constraints,
			recentEvents,
		};
	},
});

const groundingStep = createStep({
	id: "grounding",
	description: "Run web grounding agent for real-time context",
	inputSchema: AnyInputSchema,
	outputSchema: AnyOutputSchema,
	stateSchema: MinimalStateSchema,
	execute: async ({ inputData, state, writer }) => {
		const mode = state.mode ?? "STUB";
		const symbols = inputData.instruments ?? [];
		const cycleId = inputData.cycleId;

		if (mode === "STUB") {
			// Skip grounding in STUB mode - return empty grounding output
			const { createEmptyGroundingOutput } = await import("../../agents/grounding.js");
			return { ...inputData, groundingOutput: createEmptyGroundingOutput() };
		}

		// LLM mode - run grounding agent with streaming
		const { runGroundingAgentStreaming } = await import("../../agents/grounding.js");
		const context = {
			cycleId,
			symbols,
			snapshots: inputData.snapshot ?? {},
			indicators: inputData.snapshot?.indicators ?? {},
			externalContext: inputData.externalContext,
			overnightBrief: inputData.overnightBrief,
			recentEvents: inputData.recentEvents ?? [],
			regimeLabels: inputData.regimeLabels,
			predictionMarketSignals: inputData.predictionMarketSignals,
			agentConfigs: inputData.agentConfigs,
			memory: inputData.memory,
		};

		// Emit start event
		await emitAgentEvent(writer, {
			type: "agent-start",
			agent: "grounding_agent",
			cycleId,
			timestamp: new Date().toISOString(),
		});

		// Run with streaming - forward chunks to writer
		const onChunk = async (chunk: AgentStreamChunk) => {
			await emitAgentEvent(writer, {
				type: "agent-chunk",
				agent: chunk.agentType as AgentType,
				cycleId,
				data: chunk,
				timestamp: new Date().toISOString(),
			});
		};

		const groundingOutput = await runGroundingAgentStreaming(context, onChunk);

		// Emit complete event
		await emitAgentEvent(writer, {
			type: "agent-complete",
			agent: "grounding_agent",
			cycleId,
			data: { output: groundingOutput },
			timestamp: new Date().toISOString(),
		});

		return { ...inputData, groundingOutput };
	},
});

const analystsStep = createStep({
	id: "analysts",
	description: "Run news and fundamentals analysts",
	inputSchema: AnyInputSchema,
	outputSchema: AnyOutputSchema,
	stateSchema: MinimalStateSchema,
	execute: async ({ inputData, state, writer }) => {
		const mode = state.mode ?? "STUB";
		const symbols = inputData.instruments ?? [];
		const cycleId = inputData.cycleId;

		if (mode === "STUB") {
			const { runNewsAnalystStub, runFundamentalsAnalystStub } = await import(
				"../steps/trading-cycle/decide.js"
			);
			const [newsAnalysis, fundamentalsAnalysis] = await Promise.all([
				runNewsAnalystStub(symbols),
				runFundamentalsAnalystStub(symbols),
			]);
			return { ...inputData, newsAnalysis, fundamentalsAnalysis };
		}

		// LLM mode - use streaming agents
		const { runAnalystsParallelStreaming } = await import("../../agents/analysts.js");
		// Initialize toolResults accumulator for audit trail
		const toolResults: ToolResultEntry[] = [];
		const context = {
			cycleId,
			symbols,
			snapshots: inputData.snapshot ?? {},
			indicators: inputData.snapshot?.indicators ?? {},
			externalContext: inputData.externalContext,
			overnightBrief: inputData.overnightBrief,
			recentEvents: inputData.recentEvents ?? [],
			regimeLabels: inputData.regimeLabels,
			predictionMarketSignals: inputData.predictionMarketSignals,
			agentConfigs: inputData.agentConfigs,
			memory: inputData.memory,
			groundingOutput: inputData.groundingOutput,
			toolResults,
		};

		// Emit start events
		await emitAgentEvent(writer, {
			type: "agent-start",
			agent: "news_analyst",
			cycleId,
			timestamp: new Date().toISOString(),
		});
		await emitAgentEvent(writer, {
			type: "agent-start",
			agent: "fundamentals_analyst",
			cycleId,
			timestamp: new Date().toISOString(),
		});

		// Run with streaming - forward chunks to writer
		const onChunk = async (chunk: AgentStreamChunk) => {
			await emitAgentEvent(writer, {
				type: "agent-chunk",
				agent: chunk.agentType as AgentType,
				cycleId,
				data: chunk,
				timestamp: new Date().toISOString(),
			});
		};

		const { news, fundamentals } = await runAnalystsParallelStreaming(context, onChunk);

		// Emit complete events
		await emitAgentEvent(writer, {
			type: "agent-complete",
			agent: "news_analyst",
			cycleId,
			data: { output: news },
			timestamp: new Date().toISOString(),
		});
		await emitAgentEvent(writer, {
			type: "agent-complete",
			agent: "fundamentals_analyst",
			cycleId,
			data: { output: fundamentals },
			timestamp: new Date().toISOString(),
		});

		return { ...inputData, newsAnalysis: news, fundamentalsAnalysis: fundamentals, toolResults };
	},
});

const debateStep = createStep({
	id: "debate",
	description: "Run bullish and bearish researchers",
	inputSchema: AnyInputSchema,
	outputSchema: AnyOutputSchema,
	stateSchema: MinimalStateSchema,
	execute: async ({ inputData, state, writer }) => {
		const mode = state.mode ?? "STUB";
		const symbols = inputData.instruments ?? [];
		const cycleId = inputData.cycleId;

		if (mode === "STUB") {
			const { runBullishResearcherStub, runBearishResearcherStub } = await import(
				"../steps/trading-cycle/decide.js"
			);
			const [bullishResearch, bearishResearch] = await Promise.all([
				runBullishResearcherStub(symbols),
				runBearishResearcherStub(symbols),
			]);
			return { ...inputData, bullishResearch, bearishResearch };
		}

		// LLM mode - use streaming agents
		const { runDebateParallelStreaming } = await import("../../agents/researchers.js");
		// Continue accumulating toolResults from previous steps
		const toolResults: ToolResultEntry[] = inputData.toolResults ?? [];
		const context = {
			cycleId,
			symbols,
			snapshots: inputData.snapshot ?? {},
			indicators: inputData.snapshot?.indicators ?? {},
			externalContext: inputData.externalContext,
			overnightBrief: inputData.overnightBrief,
			recentEvents: inputData.recentEvents ?? [],
			regimeLabels: inputData.regimeLabels,
			predictionMarketSignals: inputData.predictionMarketSignals,
			agentConfigs: inputData.agentConfigs,
			memory: inputData.memory,
			groundingOutput: inputData.groundingOutput,
			toolResults,
		};
		const analystOutputs = {
			news: inputData.newsAnalysis ?? [],
			fundamentals: inputData.fundamentalsAnalysis ?? [],
		};

		// Emit start events
		await emitAgentEvent(writer, {
			type: "agent-start",
			agent: "bullish_researcher",
			cycleId,
			timestamp: new Date().toISOString(),
		});
		await emitAgentEvent(writer, {
			type: "agent-start",
			agent: "bearish_researcher",
			cycleId,
			timestamp: new Date().toISOString(),
		});

		// Run with streaming
		const onChunk = async (chunk: AgentStreamChunk) => {
			await emitAgentEvent(writer, {
				type: "agent-chunk",
				agent: chunk.agentType as AgentType,
				cycleId,
				data: chunk,
				timestamp: new Date().toISOString(),
			});
		};

		const { bullish, bearish } = await runDebateParallelStreaming(context, analystOutputs, onChunk);

		// Emit complete events
		await emitAgentEvent(writer, {
			type: "agent-complete",
			agent: "bullish_researcher",
			cycleId,
			data: { output: bullish },
			timestamp: new Date().toISOString(),
		});
		await emitAgentEvent(writer, {
			type: "agent-complete",
			agent: "bearish_researcher",
			cycleId,
			data: { output: bearish },
			timestamp: new Date().toISOString(),
		});

		return { ...inputData, bullishResearch: bullish, bearishResearch: bearish, toolResults };
	},
});

const traderStep = createStep({
	id: "trader",
	description: "Generate decision plan",
	inputSchema: AnyInputSchema,
	outputSchema: AnyOutputSchema,
	stateSchema: MinimalStateSchema,
	execute: async ({ inputData, state, setState, writer }) => {
		const mode = state.mode ?? "STUB";
		const bullishResearch = inputData.bullishResearch ?? [];
		const bearishResearch = inputData.bearishResearch ?? [];
		const cycleId = inputData.cycleId;

		if (mode === "STUB") {
			const { runTraderAgentStub } = await import("../steps/trading-cycle/decide.js");
			const decisionPlan = await runTraderAgentStub(cycleId, bullishResearch, bearishResearch);
			await setState({ ...state, iterations: 0 });
			return { ...inputData, decisionPlan };
		}

		// LLM mode - use streaming trader agent
		const { runTraderStreaming } = await import("../../agents/trader.js");
		// Continue accumulating toolResults from previous steps
		const toolResults: ToolResultEntry[] = inputData.toolResults ?? [];
		const context = {
			cycleId,
			symbols: inputData.instruments ?? [],
			snapshots: inputData.snapshot ?? {},
			indicators: inputData.snapshot?.indicators ?? {},
			externalContext: inputData.externalContext,
			overnightBrief: inputData.overnightBrief,
			recentEvents: inputData.recentEvents ?? [],
			regimeLabels: inputData.regimeLabels,
			predictionMarketSignals: inputData.predictionMarketSignals,
			agentConfigs: inputData.agentConfigs,
			memory: inputData.memory,
			groundingOutput: inputData.groundingOutput,
			toolResults,
		};
		const debateOutputs = {
			bullish: bullishResearch,
			bearish: bearishResearch,
		};

		// Emit start event
		await emitAgentEvent(writer, {
			type: "agent-start",
			agent: "trader",
			cycleId,
			timestamp: new Date().toISOString(),
		});

		// Run with streaming
		const onChunk = async (chunk: AgentStreamChunk) => {
			await emitAgentEvent(writer, {
				type: "agent-chunk",
				agent: "trader",
				cycleId,
				data: chunk,
				timestamp: new Date().toISOString(),
			});
		};

		const decisionPlan = await runTraderStreaming(
			context,
			debateOutputs,
			onChunk,
			undefined, // portfolioState
			inputData.constraints
		);

		// Emit complete event
		await emitAgentEvent(writer, {
			type: "agent-complete",
			agent: "trader",
			cycleId,
			data: { output: decisionPlan },
			timestamp: new Date().toISOString(),
		});

		await setState({ ...state, iterations: 0 });
		return { ...inputData, decisionPlan, toolResults };
	},
});

const consensusStep = createStep({
	id: "consensus",
	description: "Run approval agents",
	inputSchema: AnyInputSchema,
	outputSchema: z
		.object({
			approved: z.boolean(),
			iterations: z.number(),
		})
		.passthrough(),
	stateSchema: MinimalStateSchema,
	execute: async ({ inputData, state, setState, writer }) => {
		const mode = state.mode ?? "STUB";
		const decisions = inputData.decisionPlan?.decisions ?? [];
		const iterations = (state.iterations ?? 0) + 1;
		const cycleId = inputData.cycleId;

		if (mode === "STUB") {
			const { runRiskManagerStub, runCriticStub } = await import(
				"../steps/trading-cycle/decide.js"
			);
			const [riskApproval, criticApproval] = await Promise.all([
				runRiskManagerStub(decisions),
				runCriticStub(decisions),
			]);
			const approved = riskApproval.verdict === "APPROVE" && criticApproval.verdict === "APPROVE";
			await setState({ ...state, approved, iterations });
			return { ...inputData, approved, iterations, riskApproval, criticApproval };
		}

		// LLM mode - use streaming approval agents
		const { runApprovalParallelStreaming } = await import("../../agents/approvers.js");
		const analystOutputs = {
			news: inputData.newsAnalysis ?? [],
			fundamentals: inputData.fundamentalsAnalysis ?? [],
		};
		const debateOutputs = {
			bullish: inputData.bullishResearch ?? [],
			bearish: inputData.bearishResearch ?? [],
		};

		// Emit start events
		await emitAgentEvent(writer, {
			type: "agent-start",
			agent: "risk_manager",
			cycleId,
			timestamp: new Date().toISOString(),
		});
		await emitAgentEvent(writer, {
			type: "agent-start",
			agent: "critic",
			cycleId,
			timestamp: new Date().toISOString(),
		});

		// Run with streaming
		const onChunk = async (chunk: AgentStreamChunk) => {
			await emitAgentEvent(writer, {
				type: "agent-chunk",
				agent: chunk.agentType as AgentType,
				cycleId,
				data: chunk,
				timestamp: new Date().toISOString(),
			});
		};

		const { riskManager, critic } = await runApprovalParallelStreaming(
			inputData.decisionPlan,
			analystOutputs,
			debateOutputs,
			onChunk,
			undefined, // portfolioState
			inputData.constraints,
			inputData.agentConfigs,
			inputData.snapshot?.indicators,
			undefined, // abortSignal
			inputData.toolResults // tool results from previous steps for audit validation
		);

		// Emit complete events
		await emitAgentEvent(writer, {
			type: "agent-complete",
			agent: "risk_manager",
			cycleId,
			data: { output: riskManager },
			timestamp: new Date().toISOString(),
		});
		await emitAgentEvent(writer, {
			type: "agent-complete",
			agent: "critic",
			cycleId,
			data: { output: critic },
			timestamp: new Date().toISOString(),
		});

		// Handle case where agents may return undefined (LLM structured output failure)
		const riskVerdict = riskManager?.verdict ?? "REJECT";
		const criticVerdict = critic?.verdict ?? "REJECT";

		if (!riskManager || !critic) {
			log.warn(
				{ hasRiskManager: !!riskManager, hasCritic: !!critic },
				"[consensus] Agent returned undefined"
			);
		}

		// Handle partial approvals - filter decisions to only approved ones
		let filteredDecisionPlan = inputData.decisionPlan;
		let approved = false;

		if (riskVerdict === "APPROVE" && criticVerdict === "APPROVE") {
			approved = true;
		} else if (riskVerdict === "PARTIAL_APPROVE" || criticVerdict === "PARTIAL_APPROVE") {
			// Get intersection of approved decisions from both agents
			const riskApproved = new Set(riskManager?.approvedDecisionIds ?? []);
			const criticApproved = new Set(critic?.approvedDecisionIds ?? []);

			// If one agent fully approved, use the other's partial list
			// Otherwise, take intersection of both partial approvals
			let finalApprovedIds: Set<string>;
			if (riskVerdict === "APPROVE") {
				finalApprovedIds = criticApproved;
			} else if (criticVerdict === "APPROVE") {
				finalApprovedIds = riskApproved;
			} else {
				// Both partial - take intersection
				finalApprovedIds = new Set([...riskApproved].filter((id) => criticApproved.has(id)));
			}

			if (finalApprovedIds.size > 0 && filteredDecisionPlan) {
				const filteredDecisions = filteredDecisionPlan.decisions.filter((d: Decision) =>
					finalApprovedIds.has(d.decisionId)
				);
				if (filteredDecisions.length > 0) {
					filteredDecisionPlan = {
						...filteredDecisionPlan,
						decisions: filteredDecisions,
						portfolioNotes: `${filteredDecisionPlan.portfolioNotes} [Partial approval: ${filteredDecisions.length}/${inputData.decisionPlan?.decisions.length} trades approved]`,
					};
					approved = true;
					log.info(
						{
							approved: filteredDecisions.length,
							rejected: (inputData.decisionPlan?.decisions.length ?? 0) - filteredDecisions.length,
						},
						"Partial approval - filtered decision plan"
					);
				}
			}
		}

		await setState({ ...state, approved, iterations });
		return {
			...inputData,
			decisionPlan: filteredDecisionPlan,
			approved,
			iterations,
			riskApproval: riskManager ?? {
				verdict: "REJECT",
				reasoning: "Agent failed to return output",
			},
			criticApproval: critic ?? { verdict: "REJECT", reasoning: "Agent failed to return output" },
		};
	},
});

const actStep = createStep({
	id: "act",
	description: "Submit orders and process thesis state",
	inputSchema: AnyInputSchema,
	outputSchema: WorkflowResultSchema,
	stateSchema: MinimalStateSchema,
	execute: async ({ inputData, state }) => {
		const { checkConstraints, submitOrders } = await import("../steps/trading-cycle/act.js");
		const approved = inputData.approved ?? false;
		const decisionPlan = inputData.decisionPlan;

		let orderSubmission = { submitted: false, orderIds: [] as string[], errors: [] as string[] };

		if (approved && decisionPlan) {
			const constraintCheck = await checkConstraints(
				approved,
				decisionPlan,
				undefined, // ctx
				inputData.constraints
			);
			if (constraintCheck.passed) {
				orderSubmission = await submitOrders(true, decisionPlan, inputData.cycleId);
			} else {
				orderSubmission.errors = constraintCheck.violations;
			}
		}

		// Process thesis state transitions and ingest closed theses to HelixDB
		// This runs even if orders weren't submitted to capture HOLD → EXITING etc.
		if (decisionPlan && state.mode === "LLM") {
			try {
				const { processThesisForDecision, ingestClosedThesesForCycle } = await import(
					"../steps/trading-cycle/thesis.js"
				);
				const { getThesisStateRepo } = await import("../../../db.js");
				const { requireEnv } = await import("@cream/domain");
				const environment = requireEnv();
				const repo = await getThesisStateRepo();

				// Process each decision's thesis state
				const thesisUpdates: ThesisUpdate[] = [];

				for (const decision of decisionPlan.decisions) {
					const latestQuote = inputData.snapshot?.quotes?.[decision.instrumentId];
					const currentPrice = latestQuote?.price;

					const update = await processThesisForDecision(
						repo,
						decision,
						environment,
						inputData.cycleId,
						currentPrice
					);

					if (update) {
						thesisUpdates.push(update);
						log.debug(
							{ thesisId: update.thesisId, from: update.fromState, to: update.toState },
							"Thesis state updated"
						);
					}
				}

				// Ingest closed theses to HelixDB for memory retrieval
				if (thesisUpdates.some((u) => u.toState === "CLOSED")) {
					const ingestionResult = await ingestClosedThesesForCycle(
						inputData.cycleId,
						environment,
						thesisUpdates
					);

					if (ingestionResult.ingested > 0) {
						log.info(
							{ cycleId: inputData.cycleId, ingested: ingestionResult.ingested },
							"Closed theses ingested to HelixDB"
						);
					}
				}
			} catch (error) {
				log.error(
					{ error: error instanceof Error ? error.message : String(error) },
					"Thesis processing failed"
				);
			}
		}

		return {
			cycleId: inputData.cycleId,
			approved,
			iterations: state.iterations ?? 1,
			orderSubmission,
			decisionPlan,
			riskApproval: inputData.riskApproval,
			criticApproval: inputData.criticApproval,
			mode: state.mode ?? "STUB",
			configVersion: null,
		};
	},
});

// ============================================
// Workflow Definition
// ============================================

export const tradingCycleWorkflow = createWorkflow({
	id: "trading-cycle",
	description: "Hourly OODA trading cycle with 8-agent consensus",
	inputSchema: z.object({
		cycleId: z.string(),
		instruments: z.array(z.string()).default(["AAPL", "MSFT", "GOOGL"]),
		forceStub: z.boolean().optional(),
		useDraftConfig: z.boolean().optional(),
	}),
	outputSchema: WorkflowResultSchema,
	stateSchema: MinimalStateSchema,
});

// Wire steps sequentially (simplified from original plan)
// observe → orient → grounding → analysts → debate → trader → consensus → act
tradingCycleWorkflow
	.then(observeStep)
	.then(orientStep)
	.then(groundingStep)
	.then(analystsStep)
	.then(debateStep)
	.then(traderStep)
	.then(consensusStep)
	.then(actStep)
	.commit();

// ============================================
// Exports
// ============================================

export type { WorkflowInput, WorkflowResult } from "./schemas.js";
