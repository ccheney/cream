/**
 * Grounding Agent for web search context gathering.
 *
 * This agent uses ONLY google_search (native Gemini grounding) to perform
 * web searches and gather real-time context for trading analysis.
 *
 * Due to Gemini's limitation where native grounding tools cannot be combined
 * with custom function tools, this agent runs separately and early in the
 * OODA cycle. Its output is passed to downstream agents via their prompts.
 */

import { buildGenerateOptions, createAgent, getAgentRuntimeSettings } from "./factory.js";
import { buildDatetimeContext } from "./prompts.js";
import { type GroundingOutput, GroundingOutputSchema } from "./schemas.js";
import { createStreamChunkForwarder } from "./stream-forwarder.js";
import type { AgentContext, OnStreamChunk } from "./types.js";

// ============================================
// Agent Instance
// ============================================

/** Web Grounding Agent - Performs Google searches for real-time context */
export const groundingAgent = createAgent("grounding_agent");

// ============================================
// Prompt Building
// ============================================

/**
 * Build the grounding prompt for a set of symbols.
 * Instructs the agent on what to search for.
 */
export function buildGroundingPrompt(symbols: string[]): string {
	const symbolList = symbols.join(", ");
	const symbolQueries = symbols
		.map(
			(s) => `
For ${s}:
- Search for "${s} stock news today"
- Search for "${s} analyst rating outlook"
- Search for "${s} earnings expectations"
- Search for "${s} risks concerns"`
		)
		.join("\n");

	return `${buildDatetimeContext({ googleSearchVerification: true })}## Grounding Task

Gather real-time web context for these trading symbols: ${symbolList}

### Per-Symbol Searches
${symbolQueries}

### Global/Macro Searches
- Search for "stock market today sentiment"
- Search for "Fed interest rate policy outlook"
- Search for "economic data releases this week"

### Output Requirements

After performing searches, synthesize findings into the structured output format:
- perSymbol: Array of objects, one per symbol. Each object must include:
  - symbol: The ticker symbol (e.g., "AAPL")
  - news: Array of concise bullet points for headlines and developments
  - fundamentals: Array of valuation context and analyst views
  - bullCase: Array of bullish catalysts and opportunities
  - bearCase: Array of bearish risks and concerns
- global: Market-wide context for macro and events
- sources: List key sources with URLs, titles, and relevance

Focus on:
1. Information from the last 24-48 hours when available
2. Trading-relevant facts (not opinions or speculation)
3. Concrete catalysts and risks
4. Keep each bullet point to 1-2 sentences

If a search returns no relevant results for a category, use an empty array.`;
}

// ============================================
// Execution Functions
// ============================================

/**
 * Run Grounding Agent (non-streaming).
 */
export async function runGroundingAgent(context: AgentContext): Promise<GroundingOutput> {
	const prompt = buildGroundingPrompt(context.symbols);

	const settings = getAgentRuntimeSettings("grounding_agent", context.agentConfigs);
	const options = buildGenerateOptions(settings, { schema: GroundingOutputSchema });

	const response = await groundingAgent.generate([{ role: "user", content: prompt }], options);

	const result = response.object as GroundingOutput | undefined;
	return (
		result ?? {
			perSymbol: [],
			global: { macro: [], events: [] },
			sources: [],
		}
	);
}

/**
 * Run Grounding Agent with streaming.
 * Streams tool calls and results to the UI via onChunk callback.
 */
export async function runGroundingAgentStreaming(
	context: AgentContext,
	onChunk: OnStreamChunk
): Promise<GroundingOutput> {
	const prompt = buildGroundingPrompt(context.symbols);

	const settings = getAgentRuntimeSettings("grounding_agent", context.agentConfigs);
	const options = buildGenerateOptions(settings, { schema: GroundingOutputSchema });

	const stream = await groundingAgent.stream([{ role: "user", content: prompt }], options);
	const forwardChunk = createStreamChunkForwarder("grounding_agent", onChunk);

	for await (const chunk of stream.fullStream) {
		await forwardChunk(chunk as { type: string; payload?: Record<string, unknown> });
	}

	const result = (await stream.object) as GroundingOutput | undefined;
	return (
		result ?? {
			perSymbol: [],
			global: { macro: [], events: [] },
			sources: [],
		}
	);
}

// ============================================
// Empty/Stub Output
// ============================================

/**
 * Create an empty grounding output for STUB mode or when grounding is skipped.
 */
export function createEmptyGroundingOutput(): GroundingOutput {
	return {
		perSymbol: [],
		global: { macro: [], events: [] },
		sources: [],
	};
}
