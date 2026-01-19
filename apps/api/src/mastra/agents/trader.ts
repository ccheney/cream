/**
 * Trader agent for synthesizing trading decisions.
 *
 * Synthesizes bullish and bearish research into concrete DecisionPlans.
 */

import type { AgentType } from "@cream/agents";
import { createNodeLogger } from "@cream/logger";

import { buildGenerateOptions, createAgent, getAgentRuntimeSettings } from "./factory.js";

const log = createNodeLogger({ service: "trader-agent", level: "info" });

import { buildDatetimeContext, buildIndicatorContext } from "./prompts.js";
import { DecisionPlanSchema } from "./schemas.js";
import { createStreamChunkForwarder } from "./stream-forwarder.js";
import type {
	AgentConfigEntry,
	AgentContext,
	BearishResearchOutput,
	BullishResearchOutput,
	DecisionPlan,
	FundamentalsAnalysisOutput,
	OnStreamChunk,
	SentimentAnalysisOutput,
} from "./types.js";

// ============================================
// Agent Instance
// ============================================

/** Trader - Synthesizes into DecisionPlan */
export const traderAgent = createAgent("trader");

// ============================================
// Types
// ============================================

export interface DebateOutputs {
	bullish: BullishResearchOutput[];
	bearish: BearishResearchOutput[];
}

// ============================================
// Execution Functions
// ============================================

/**
 * Run Trader agent to synthesize DecisionPlan.
 */
export async function runTrader(
	context: AgentContext,
	debateOutputs: DebateOutputs,
	portfolioState?: Record<string, unknown>
): Promise<DecisionPlan> {
	const indicatorContext = buildIndicatorContext(context.indicators);

	const portfolioStateProvided = Boolean(portfolioState && Object.keys(portfolioState).length > 0);

	const prompt = `${buildDatetimeContext()}Synthesize the debate into a concrete trading plan:

Bullish Research:
${JSON.stringify(debateOutputs.bullish, null, 2)}

Bearish Research:
${JSON.stringify(debateOutputs.bearish, null, 2)}
${indicatorContext}
Current Portfolio State:
${JSON.stringify(portfolioState ?? {}, null, 2)}

Cycle ID: ${context.cycleId}
Symbols: ${context.symbols.join(", ")}

TOOL USE (required):
- If Current Portfolio State is empty, call get_portfolio_state before producing the final plan.
- Call get_quotes with instruments=[Symbols] to confirm current prices/liquidity before sizing.
Portfolio state provided in prompt: ${portfolioStateProvided ? "yes" : "no"}

POSITION SIZING GUIDANCE from indicators:
- Use ATR for stop-loss distance calculations (ATR multiples)
- Consider volatility (realized_vol, ATM IV) for position sizing
- Liquidity metrics (bid_ask_spread, volume_ratio) inform execution
- Short interest > 20% signals potential squeeze risk`;

	const settings = getAgentRuntimeSettings("trader", context.agentConfigs);
	const options = buildGenerateOptions(settings, { schema: DecisionPlanSchema });

	const response = await traderAgent.generate([{ role: "user", content: prompt }], options);

	return response.object as DecisionPlan;
}

// ============================================
// Streaming Functions
// ============================================

/**
 * Run Trader agent with streaming.
 */
export async function runTraderStreaming(
	context: AgentContext,
	debateOutputs: DebateOutputs,
	onChunk: OnStreamChunk,
	portfolioState?: Record<string, unknown>
): Promise<DecisionPlan> {
	const indicatorContext = buildIndicatorContext(context.indicators);

	const portfolioStateProvided = Boolean(portfolioState && Object.keys(portfolioState).length > 0);

	const prompt = `${buildDatetimeContext()}Synthesize the debate into a concrete trading plan:

Bullish Research:
${JSON.stringify(debateOutputs.bullish, null, 2)}

Bearish Research:
${JSON.stringify(debateOutputs.bearish, null, 2)}
${indicatorContext}
Current Portfolio State:
${JSON.stringify(portfolioState ?? {}, null, 2)}

Cycle ID: ${context.cycleId}
Symbols: ${context.symbols.join(", ")}

TOOL USE (required):
- If Current Portfolio State is empty, call get_portfolio_state before producing the final plan.
- Call get_quotes with instruments=[Symbols] to confirm current prices/liquidity before sizing.
Portfolio state provided in prompt: ${portfolioStateProvided ? "yes" : "no"}

POSITION SIZING GUIDANCE from indicators:
- Use ATR for stop-loss distance calculations (ATR multiples)
- Consider volatility (realized_vol, ATM IV) for position sizing
- Liquidity metrics (bid_ask_spread, volume_ratio) inform execution
- Short interest > 20% signals potential squeeze risk`;

	const settings = getAgentRuntimeSettings("trader", context.agentConfigs);
	const options = buildGenerateOptions(
		settings,
		{ schema: DecisionPlanSchema },
		{ useTwoStepExtraction: true }
	);

	const stream = await traderAgent.stream([{ role: "user", content: prompt }], options);
	const forwardChunk = createStreamChunkForwarder("trader", onChunk);

	for await (const chunk of stream.fullStream) {
		await forwardChunk(chunk as { type: string; payload?: Record<string, unknown> });
	}

	let result: DecisionPlan | undefined;
	try {
		result = (await stream.object) as DecisionPlan | undefined;
	} catch (err) {
		log.error({ err }, "[trader] Error awaiting stream.object");
	}

	if (!result) {
		const streamText = await stream.text;
		const streamUsage = await stream.usage;
		const response = await stream.response;
		// AI SDK exposes reasoning via stream.reasoning for models with thinking mode
		// ReasoningChunk[] contains { type: "thinking", textDelta: string } entries
		const reasoningChunks =
			"reasoning" in stream
				? await (
						stream as unknown as { reasoning: Promise<Array<{ type: string; textDelta?: string }>> }
					).reasoning
				: undefined;
		const reasoningText = reasoningChunks
			?.filter((c) => c.textDelta)
			.map((c) => c.textDelta)
			.join("");
		log.error(
			{
				streamText: streamText || "(empty)",
				streamTextLength: streamText?.length ?? 0,
				reasoningText: reasoningText?.slice(0, 2000) || "(empty)",
				reasoningTextLength: reasoningText?.length ?? 0,
				streamUsage,
				responseStatus: response?.status,
			},
			"[trader] Structured output undefined after streaming"
		);
	}

	return result as DecisionPlan;
}

// ============================================
// Plan Revision
// ============================================

export interface AnalystOutputs {
	news: SentimentAnalysisOutput[];
	fundamentals: FundamentalsAnalysisOutput[];
}

/**
 * Revise a plan based on rejection feedback.
 */
export async function revisePlan(
	originalPlan: DecisionPlan,
	rejectionReasons: string[],
	_analystOutputs: AnalystOutputs,
	debateOutputs: DebateOutputs,
	agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>,
	abortSignal?: AbortSignal
): Promise<DecisionPlan> {
	const prompt = `${buildDatetimeContext()}Revise the following trading plan based on the rejection feedback:

Original Plan:
${JSON.stringify(originalPlan, null, 2)}

Rejection Reasons:
${rejectionReasons.map((r) => `- ${r}`).join("\n")}

Supporting Context (for reference):
Bullish Research: ${JSON.stringify(debateOutputs.bullish, null, 2)}
Bearish Research: ${JSON.stringify(debateOutputs.bearish, null, 2)}

Please address ALL rejection reasons and produce a revised plan that:
1. Fixes all constraint violations
2. Addresses all logical inconsistencies
3. Removes any unsupported claims
4. Maintains proper stop-loss and take-profit levels`;

	const settings = getAgentRuntimeSettings("trader", agentConfigs);
	const options = buildGenerateOptions(settings, { schema: DecisionPlanSchema });

	// Add abortSignal to options if provided
	if (abortSignal) {
		options.abortSignal = abortSignal;
	}

	const response = await traderAgent.generate([{ role: "user", content: prompt }], options);

	return response.object as DecisionPlan;
}
