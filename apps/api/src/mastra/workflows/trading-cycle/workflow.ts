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

import type { AgentStreamChunk } from "../../agents/types.js";
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
	description: "Load memory and compute regimes",
	inputSchema: AnyInputSchema,
	outputSchema: AnyOutputSchema,
	stateSchema: MinimalStateSchema,
	execute: async ({ inputData, state, setState }) => {
		// Determine execution mode based on environment
		// BACKTEST always uses STUB (no LLM calls for speed)
		// PAPER/LIVE use LLM (real agent reasoning)
		const env = process.env.CREAM_ENV ?? "BACKTEST";
		const forceStub = inputData.forceStub ?? false;
		const mode = env === "BACKTEST" || forceStub ? "STUB" : "LLM";
		await setState({ ...state, mode });
		return { ...inputData, mode };
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
			recentEvents: [],
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
		const context = {
			cycleId,
			symbols,
			snapshots: inputData.snapshot ?? {},
			indicators: inputData.snapshot?.indicators ?? {},
			externalContext: inputData.externalContext,
			recentEvents: [],
			groundingOutput: inputData.groundingOutput, // Pass grounding context
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

		return { ...inputData, newsAnalysis: news, fundamentalsAnalysis: fundamentals };
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
		const context = {
			cycleId,
			symbols,
			snapshots: inputData.snapshot ?? {},
			indicators: inputData.snapshot?.indicators ?? {},
			externalContext: inputData.externalContext,
			recentEvents: [],
			groundingOutput: inputData.groundingOutput, // Pass grounding context
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

		return { ...inputData, bullishResearch: bullish, bearishResearch: bearish };
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
		const context = {
			cycleId,
			symbols: inputData.instruments ?? [],
			snapshots: inputData.snapshot ?? {},
			indicators: inputData.snapshot?.indicators ?? {},
			externalContext: inputData.externalContext,
			recentEvents: [],
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

		const decisionPlan = await runTraderStreaming(context, debateOutputs, onChunk);

		// Emit complete event
		await emitAgentEvent(writer, {
			type: "agent-complete",
			agent: "trader",
			cycleId,
			data: { output: decisionPlan },
			timestamp: new Date().toISOString(),
		});

		await setState({ ...state, iterations: 0 });
		return { ...inputData, decisionPlan };
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
			onChunk
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
		const approved = riskVerdict === "APPROVE" && criticVerdict === "APPROVE";

		if (!riskManager || !critic) {
			log.warn(
				{ hasRiskManager: !!riskManager, hasCritic: !!critic },
				"[consensus] Agent returned undefined"
			);
		}

		await setState({ ...state, approved, iterations });
		return {
			...inputData,
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
	description: "Submit orders",
	inputSchema: AnyInputSchema,
	outputSchema: WorkflowResultSchema,
	stateSchema: MinimalStateSchema,
	execute: async ({ inputData, state }) => {
		const { checkConstraints, submitOrders } = await import("../steps/trading-cycle/act.js");
		const approved = inputData.approved ?? false;
		const decisionPlan = inputData.decisionPlan;

		let orderSubmission = { submitted: false, orderIds: [] as string[], errors: [] as string[] };

		if (approved && decisionPlan) {
			const constraintCheck = await checkConstraints(approved, decisionPlan);
			if (constraintCheck.passed) {
				orderSubmission = await submitOrders(true, decisionPlan, inputData.cycleId);
			} else {
				orderSubmission.errors = constraintCheck.violations;
			}
		}

		return {
			cycleId: inputData.cycleId,
			approved,
			iterations: state.iterations ?? 1,
			orderSubmission,
			decisionPlan,
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
