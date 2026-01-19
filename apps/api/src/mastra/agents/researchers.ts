/**
 * Research agents for constructing bullish and bearish cases.
 *
 * Contains Bullish and Bearish researcher agents for the debate phase.
 */

import { z } from "zod";

import type { AnalystOutputs } from "./analysts.js";
import { buildGenerateOptions, createAgent, getAgentRuntimeSettings } from "./factory.js";
import { buildDatetimeContext, buildGroundingContext, buildIndicatorSummary } from "./prompts.js";
import { BearishResearchSchema, BullishResearchSchema } from "./schemas.js";
import { createStreamChunkForwarder } from "./stream-forwarder.js";
import type {
	AgentContext,
	BearishResearchOutput,
	BullishResearchOutput,
	OnStreamChunk,
} from "./types.js";

// Re-export for convenience
export type { AnalystOutputs };

// ============================================
// Agent Instances
// ============================================

/** Bullish Researcher - Constructs the long case */
export const bullishResearcherAgent = createAgent("bullish_researcher");

/** Bearish Researcher - Constructs the short/avoid case */
export const bearishResearcherAgent = createAgent("bearish_researcher");

// ============================================
// Execution Functions
// ============================================

/**
 * Run Bullish Researcher agent.
 */
export async function runBullishResearcher(
	context: AgentContext,
	analystOutputs: AnalystOutputs
): Promise<BullishResearchOutput[]> {
	// Build compact indicator summary for momentum/trend signals
	const indicatorSummary = buildIndicatorSummary(context.indicators);

	// Build grounding context from web searches (focus on bullCase)
	const groundingContext = buildGroundingContext(context.groundingOutput);

	const prompt = `${buildDatetimeContext()}Construct the bullish case for the following instruments based on analyst outputs:
${groundingContext}
News & Sentiment Analysis:
${JSON.stringify(analystOutputs.news, null, 2)}

Fundamentals Analysis:
${JSON.stringify(analystOutputs.fundamentals, null, 2)}
${indicatorSummary ? `\nKey Technical Signals:\n${indicatorSummary}` : ""}
Memory context (similar historical cases):
${JSON.stringify(context.memory ?? {}, null, 2)}

Symbols: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}

IMPORTANT: Build the bullish thesis considering:
- RSI signals: OVERSOLD suggests potential reversal opportunity
- MACD: Bullish crossovers or strong positive momentum support the case
- Trend: UPTREND or STRONG UPTREND from moving averages
- P/C ratio: BULLISH SENTIMENT from low put/call ratios
- Quality factors: High gross profitability, strong cash flow quality

Weight technical factors alongside fundamental drivers.`;

	const settings = getAgentRuntimeSettings("bullish_researcher", context.agentConfigs);
	const options = buildGenerateOptions(settings, { schema: z.array(BullishResearchSchema) });

	const response = await bullishResearcherAgent.generate(
		[{ role: "user", content: prompt }],
		options
	);

	const result = response.object as BullishResearchOutput[] | undefined;
	return result ?? [];
}

/**
 * Run Bearish Researcher agent.
 */
export async function runBearishResearcher(
	context: AgentContext,
	analystOutputs: AnalystOutputs
): Promise<BearishResearchOutput[]> {
	// Build compact indicator summary for momentum/trend signals
	const indicatorSummary = buildIndicatorSummary(context.indicators);

	// Build grounding context from web searches (focus on bearCase)
	const groundingContext = buildGroundingContext(context.groundingOutput);

	const prompt = `${buildDatetimeContext()}Construct the bearish case for the following instruments based on analyst outputs:
${groundingContext}
News & Sentiment Analysis:
${JSON.stringify(analystOutputs.news, null, 2)}

Fundamentals Analysis:
${JSON.stringify(analystOutputs.fundamentals, null, 2)}
${indicatorSummary ? `\nKey Technical Signals:\n${indicatorSummary}` : ""}
Memory context (similar historical cases):
${JSON.stringify(context.memory ?? {}, null, 2)}

Symbols: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}

IMPORTANT: Build the bearish thesis considering:
- RSI signals: OVERBOUGHT suggests potential reversal risk
- MACD: Bearish crossovers or negative momentum support the case
- Trend: DOWNTREND or STRONG DOWNTREND from moving averages
- P/C ratio: BEARISH SENTIMENT from high put/call ratios
- Quality concerns: High accruals, Beneish M-Score > -2.22 (manipulation risk)
- Asset growth: High asset growth often predicts lower future returns

Weight technical factors alongside fundamental headwinds.`;

	const settings = getAgentRuntimeSettings("bearish_researcher", context.agentConfigs);
	const options = buildGenerateOptions(settings, { schema: z.array(BearishResearchSchema) });

	const response = await bearishResearcherAgent.generate(
		[{ role: "user", content: prompt }],
		options
	);

	const result = response.object as BearishResearchOutput[] | undefined;
	return result ?? [];
}

/**
 * Run both research agents in parallel (debate phase).
 */
export async function runDebateParallel(
	context: AgentContext,
	analystOutputs: AnalystOutputs
): Promise<{
	bullish: BullishResearchOutput[];
	bearish: BearishResearchOutput[];
}> {
	const [bullish, bearish] = await Promise.all([
		runBullishResearcher(context, analystOutputs),
		runBearishResearcher(context, analystOutputs),
	]);

	return { bullish, bearish };
}

// ============================================
// Streaming Functions
// ============================================

/**
 * Run Bullish Researcher agent with streaming.
 */
export async function runBullishResearcherStreaming(
	context: AgentContext,
	analystOutputs: AnalystOutputs,
	onChunk: OnStreamChunk
): Promise<BullishResearchOutput[]> {
	// Initialize toolResults accumulator if not present
	if (!context.toolResults) {
		context.toolResults = [];
	}

	// Build compact indicator summary for momentum/trend signals
	const indicatorSummary = buildIndicatorSummary(context.indicators);

	// Build grounding context from web searches (focus on bullCase)
	const groundingContext = buildGroundingContext(context.groundingOutput);

	const prompt = `${buildDatetimeContext()}Construct the bullish case for the following instruments based on analyst outputs:
${groundingContext}
News & Sentiment Analysis:
${JSON.stringify(analystOutputs.news, null, 2)}

Fundamentals Analysis:
${JSON.stringify(analystOutputs.fundamentals, null, 2)}
${indicatorSummary ? `\nKey Technical Signals:\n${indicatorSummary}` : ""}
Memory context (similar historical cases):
${JSON.stringify(context.memory ?? {}, null, 2)}

Symbols: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}

IMPORTANT: Build the bullish thesis considering:
- RSI signals: OVERSOLD suggests potential reversal opportunity
- MACD: Bullish crossovers or strong positive momentum support the case
- Trend: UPTREND or STRONG UPTREND from moving averages
- P/C ratio: BULLISH SENTIMENT from low put/call ratios
- Quality factors: High gross profitability, strong cash flow quality

Weight technical factors alongside fundamental drivers.`;

	const settings = getAgentRuntimeSettings("bullish_researcher", context.agentConfigs);
	const options = buildGenerateOptions(settings, { schema: z.array(BullishResearchSchema) });

	const stream = await bullishResearcherAgent.stream([{ role: "user", content: prompt }], options);
	const forwardChunk = createStreamChunkForwarder("bullish_researcher", onChunk, {
		toolResultsAccumulator: context.toolResults,
	});

	for await (const chunk of stream.fullStream) {
		await forwardChunk(chunk as { type: string; payload?: Record<string, unknown> });
	}

	const result = (await stream.object) as BullishResearchOutput[] | undefined;
	return result ?? [];
}

/**
 * Run Bearish Researcher agent with streaming.
 */
export async function runBearishResearcherStreaming(
	context: AgentContext,
	analystOutputs: AnalystOutputs,
	onChunk: OnStreamChunk
): Promise<BearishResearchOutput[]> {
	// Initialize toolResults accumulator if not present
	if (!context.toolResults) {
		context.toolResults = [];
	}

	// Build compact indicator summary for momentum/trend signals
	const indicatorSummary = buildIndicatorSummary(context.indicators);

	// Build grounding context from web searches (focus on bearCase)
	const groundingContext = buildGroundingContext(context.groundingOutput);

	const prompt = `${buildDatetimeContext()}Construct the bearish case for the following instruments based on analyst outputs:
${groundingContext}
News & Sentiment Analysis:
${JSON.stringify(analystOutputs.news, null, 2)}

Fundamentals Analysis:
${JSON.stringify(analystOutputs.fundamentals, null, 2)}
${indicatorSummary ? `\nKey Technical Signals:\n${indicatorSummary}` : ""}
Memory context (similar historical cases):
${JSON.stringify(context.memory ?? {}, null, 2)}

Symbols: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}

IMPORTANT: Build the bearish thesis considering:
- RSI signals: OVERBOUGHT suggests potential reversal risk
- MACD: Bearish crossovers or negative momentum support the case
- Trend: DOWNTREND or STRONG DOWNTREND from moving averages
- P/C ratio: BEARISH SENTIMENT from high put/call ratios
- Quality concerns: High accruals, Beneish M-Score > -2.22 (manipulation risk)
- Asset growth: High asset growth often predicts lower future returns

Weight technical factors alongside fundamental headwinds.`;

	const settings = getAgentRuntimeSettings("bearish_researcher", context.agentConfigs);
	const options = buildGenerateOptions(settings, { schema: z.array(BearishResearchSchema) });

	const stream = await bearishResearcherAgent.stream([{ role: "user", content: prompt }], options);
	const forwardChunk = createStreamChunkForwarder("bearish_researcher", onChunk, {
		toolResultsAccumulator: context.toolResults,
	});

	for await (const chunk of stream.fullStream) {
		await forwardChunk(chunk as { type: string; payload?: Record<string, unknown> });
	}

	const result = (await stream.object) as BearishResearchOutput[] | undefined;
	return result ?? [];
}

/**
 * Run both research agents in parallel with streaming (debate phase).
 */
export async function runDebateParallelStreaming(
	context: AgentContext,
	analystOutputs: AnalystOutputs,
	onChunk: OnStreamChunk
): Promise<{
	bullish: BullishResearchOutput[];
	bearish: BearishResearchOutput[];
}> {
	const [bullish, bearish] = await Promise.all([
		runBullishResearcherStreaming(context, analystOutputs, onChunk),
		runBearishResearcherStreaming(context, analystOutputs, onChunk),
	]);

	return { bullish, bearish };
}
