/**
 * Grounding Step
 *
 * Third step in the OODA trading cycle. Calls the grounding agent to fetch
 * real-time web and social context for all instruments.
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { groundingAgent } from "../../../agents/index.js";

// ============================================
// Schemas
// ============================================

const GroundingInputSchema = z.object({
	cycleId: z.string().describe("Unique identifier for this trading cycle"),
	instruments: z.array(z.string()).min(1).describe("Symbols to ground"),
});

const SymbolContextSchema = z.object({
	symbol: z.string(),
	news: z.array(z.string()),
	fundamentals: z.array(z.string()),
	bullCase: z.array(z.string()),
	bearCase: z.array(z.string()),
});

const GlobalContextSchema = z.object({
	macro: z.array(z.string()),
	events: z.array(z.string()),
});

const SourceCitationSchema = z.object({
	url: z.string(),
	title: z.string(),
	relevance: z.string(),
	sourceType: z.enum(["url", "x", "news"]),
});

const GroundingOutputSchema = z.object({
	cycleId: z.string(),
	perSymbol: z.array(SymbolContextSchema),
	global: GlobalContextSchema,
	sources: z.array(SourceCitationSchema),
	errors: z.array(z.string()),
	warnings: z.array(z.string()),
	metrics: z.object({
		totalMs: z.number(),
		agentCallMs: z.number(),
	}),
});

// ============================================
// Step Definition
// ============================================

export const groundingStep = createStep({
	id: "grounding-context",
	description: "Fetch real-time web and social context for trading analysis",
	inputSchema: GroundingInputSchema,
	outputSchema: GroundingOutputSchema,
	execute: async ({ inputData }) => {
		const startTime = performance.now();
		const { cycleId, instruments } = inputData;
		const errors: string[] = [];
		const warnings: string[] = [];

		// Call grounding agent
		const agentStart = performance.now();
		const { perSymbol, global, sources } = await callGroundingAgent(instruments, errors, warnings);
		const agentCallMs = performance.now() - agentStart;

		return {
			cycleId,
			perSymbol,
			global,
			sources,
			errors,
			warnings,
			metrics: {
				totalMs: performance.now() - startTime,
				agentCallMs,
			},
		};
	},
});

// ============================================
// Helper Functions
// ============================================

interface GroundingResult {
	perSymbol: z.infer<typeof SymbolContextSchema>[];
	global: z.infer<typeof GlobalContextSchema>;
	sources: z.infer<typeof SourceCitationSchema>[];
}

async function callGroundingAgent(
	instruments: string[],
	errors: string[],
	warnings: string[],
): Promise<GroundingResult> {
	const emptyResult: GroundingResult = {
		perSymbol: instruments.map((symbol) => ({
			symbol,
			news: [],
			fundamentals: [],
			bullCase: [],
			bearCase: [],
		})),
		global: { macro: [], events: [] },
		sources: [],
	};

	// Check if xAI API is configured
	if (!Bun.env.XAI_API_KEY) {
		warnings.push("xAI API not configured - skipping grounding");
		return emptyResult;
	}

	try {
		const prompt = buildGroundingPrompt(instruments);
		const response = await groundingAgent.generate(prompt);

		// Parse the agent's response
		const text = response.text;
		return parseGroundingResponse(text, instruments, warnings);
	} catch (err) {
		errors.push(`Grounding agent call failed: ${formatError(err)}`);
		return emptyResult;
	}
}

function buildGroundingPrompt(instruments: string[]): string {
	const symbolList = instruments.join(", ");
	return `Search for real-time trading context for these symbols: ${symbolList}

Include:
1. Recent news and developments for each symbol
2. Fundamentals context (valuation, earnings expectations)
3. Bullish catalysts and opportunities
4. Bearish risks and concerns
5. Global macro context affecting these symbols

Return your findings as a JSON object.`;
}

function parseGroundingResponse(
	text: string,
	instruments: string[],
	warnings: string[],
): GroundingResult {
	const emptyResult: GroundingResult = {
		perSymbol: instruments.map((symbol) => ({
			symbol,
			news: [],
			fundamentals: [],
			bullCase: [],
			bearCase: [],
		})),
		global: { macro: [], events: [] },
		sources: [],
	};

	// Try to extract JSON from the response
	const jsonMatch = text.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		warnings.push("Could not extract JSON from grounding response");
		return emptyResult;
	}

	try {
		const parsed = JSON.parse(jsonMatch[0]) as Partial<GroundingResult>;

		return {
			perSymbol: parsed.perSymbol ?? emptyResult.perSymbol,
			global: parsed.global ?? emptyResult.global,
			sources: parsed.sources ?? emptyResult.sources,
		};
	} catch {
		warnings.push("Failed to parse grounding response JSON");
		return emptyResult;
	}
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
