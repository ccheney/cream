/**
 * Grounding Agent for web search context gathering.
 *
 * Uses xAI Grok's live search to perform web, news, and X.com searches
 * for real-time trading context. Bypasses Mastra's agent framework for
 * direct AI SDK calls since Grok's search is via providerOptions, not tools.
 */

import { xai } from "@ai-sdk/xai";
import { generateText, streamText } from "ai";
import { createGrokSearchConfig, DEFAULT_TRADING_SOURCES, getGrokModelId } from "./grok-config.js";
import { buildDatetimeContext } from "./prompts.js";
import { type GroundingOutput, GroundingOutputSchema } from "./schemas.js";
import type { AgentContext, AgentStreamChunk, OnStreamChunk } from "./types.js";

/**
 * Get provider options for Grok search.
 * The xAI provider accepts searchParameters but TypeScript's strict JSON
 * types in SharedV3ProviderOptions don't allow our typed config structure.
 */
// biome-ignore lint/suspicious/noExplicitAny: xAI provider options aren't fully typed in AI SDK
function getGrokProviderOptions(): any {
	return {
		xai: createGrokSearchConfig({
			sources: DEFAULT_TRADING_SOURCES,
			maxSearchResults: 20,
		}),
	};
}

/**
 * Build the grounding prompt for a set of symbols.
 * Includes X.com cashtag search guidance.
 */
export function buildGroundingPrompt(symbols: string[]): string {
	const symbolList = symbols.join(", ");
	const cashtags = symbols.map((s) => `$${s}`).join(" ");

	const symbolQueries = symbols
		.map(
			(s) => `
For ${s}:
- Web: "${s} stock news today"
- Web: "${s} analyst rating outlook"
- Web: "${s} earnings expectations"
- X cashtag: "$${s}" (primary - trader sentiment, breaking news)
- X text: "${s} stock" (broader discussion)`
		)
		.join("\n");

	return `${buildDatetimeContext()}## Grounding Task

Gather real-time web, news, and X.com context for: ${symbolList}

### Cashtag Reference
Search these cashtags on X: ${cashtags}

### Per-Symbol Searches
${symbolQueries}

### Global/Macro Searches
- Web: "stock market today sentiment", "Fed interest rate policy"
- News: Financial news for market context
- X cashtags: "$SPY $QQQ" (index sentiment)
- X text: "Fed FOMC market" (policy reactions)

### X.com Search Priority

1. **Cashtags first** ($TSLA, $AAPL) - these are how traders tag stock discussion
2. High-engagement posts (many reposts/likes) often signal breaking news
3. Note sentiment divergence between X and traditional news sources

### Output Requirements

Synthesize into structured JSON:
- perSymbol: Array with symbol, news[], fundamentals[], bullCase[], bearCase[]
- global: { macro: [], events: [] }
- sources: Array with url, title, relevance, sourceType (url/x/news)

For X.com sources, include the post URL and note if it was a cashtag result.`;
}

/**
 * Parse and validate the grounding output from the model response.
 */
function parseGroundingOutput(text: string): GroundingOutput {
	const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
	const jsonText = jsonMatch?.[1] ?? text;

	const cleanedText = jsonText.trim();

	const parsed = JSON.parse(cleanedText) as unknown;
	return GroundingOutputSchema.parse(parsed);
}

/**
 * Append Grok citations to the sources array.
 */
function appendCitations(
	output: GroundingOutput,
	sources: Array<{ sourceType?: string; url?: string; title?: string } | string> | undefined
): GroundingOutput {
	if (!sources?.length) {
		return output;
	}

	for (const source of sources) {
		if (typeof source === "string") {
			output.sources.push({
				url: source,
				title: "Grok citation",
				relevance: "Auto-cited by search",
			});
		} else if (source.url) {
			output.sources.push({
				url: source.url,
				title: source.title ?? "Grok citation",
				relevance: "Auto-cited by search",
				sourceType: source.sourceType as "url" | "x" | "news" | undefined,
			});
		}
	}

	return output;
}

/**
 * Create an empty grounding output for STUB mode or when grounding fails.
 */
export function createEmptyGroundingOutput(): GroundingOutput {
	return {
		perSymbol: [],
		global: { macro: [], events: [] },
		sources: [],
	};
}

/**
 * Run Grounding Agent (non-streaming).
 */
export async function runGroundingAgent(context: AgentContext): Promise<GroundingOutput> {
	const prompt = buildGroundingPrompt(context.symbols);

	const response = await generateText({
		model: xai(getGrokModelId()),
		prompt,
		providerOptions: getGrokProviderOptions(),
	});

	try {
		const parsed = parseGroundingOutput(response.text);
		return appendCitations(parsed, response.sources);
	} catch {
		return createEmptyGroundingOutput();
	}
}

/**
 * Run Grounding Agent with streaming.
 * Streams text deltas to the UI via onChunk callback.
 */
export async function runGroundingAgentStreaming(
	context: AgentContext,
	onChunk: OnStreamChunk
): Promise<GroundingOutput> {
	const prompt = buildGroundingPrompt(context.symbols);
	const agentType = "grounding_agent";

	const emitChunk = (chunk: Omit<AgentStreamChunk, "timestamp">) => {
		return onChunk({
			...chunk,
			timestamp: new Date().toISOString(),
		} as AgentStreamChunk);
	};

	await emitChunk({
		type: "start",
		agentType,
		payload: {},
	});

	const response = streamText({
		model: xai(getGrokModelId()),
		prompt,
		providerOptions: getGrokProviderOptions(),
	});

	let fullText = "";

	for await (const chunk of response.fullStream) {
		if (chunk.type === "text-delta") {
			const textChunk = chunk as { type: "text-delta"; text: string };
			fullText += textChunk.text;
			await emitChunk({
				type: "text-delta",
				agentType,
				payload: { text: textChunk.text },
			});
		} else if (chunk.type === "source") {
			const source = chunk as { type: "source"; sourceType?: string; url?: string; title?: string };
			await emitChunk({
				type: "source",
				agentType,
				payload: {
					sourceType: source.sourceType,
					url: source.url,
					title: source.title,
				},
			});
		}
	}

	await emitChunk({
		type: "finish",
		agentType,
		payload: {},
	});

	try {
		const parsed = parseGroundingOutput(fullText);
		const finalResponse = await response;
		const sources = await finalResponse.sources;
		return appendCitations(parsed, sources);
	} catch {
		return createEmptyGroundingOutput();
	}
}
