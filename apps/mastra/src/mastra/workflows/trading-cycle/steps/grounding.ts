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
	const emptyResult = createEmptyGroundingResult(instruments);

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

/**
 * Format date in NY timezone as YYYY-MM-DD.
 * Uses NY timezone since that's where US markets operate.
 */
function formatDateNY(date: Date): string {
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/New_York",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});

	const parts = formatter.formatToParts(date);
	const year = parts.find((p) => p.type === "year")?.value ?? "";
	const month = parts.find((p) => p.type === "month")?.value ?? "";
	const day = parts.find((p) => p.type === "day")?.value ?? "";

	return `${year}-${month}-${day}`;
}

function buildGroundingPrompt(instruments: string[]): string {
	const symbolList = instruments.join(", ");
	const today = formatDateNY(new Date());

	return `TODAY'S DATE: ${today}

Search for real-time trading context for these symbols: ${symbolList}

CRITICAL: Only include information from the LAST 24 HOURS (since ${today}). Reject any news, analysis, or social posts dated before yesterday. If you cannot find recent information for a symbol, note that explicitly rather than using stale data.

Include:
1. Recent news and developments for each symbol (last 24 hours only)
2. Fundamentals context (current valuation, upcoming earnings expectations)
3. Bullish catalysts and opportunities (recent developments)
4. Bearish risks and concerns (current/emerging risks)
5. Global macro context affecting these symbols today

For each item, include the date when the information was published or posted.

Return your findings as a JSON object.`;
}

/**
 * Convert array items to strings.
 * If item is already a string, return it.
 * If item is an object, stringify it or extract relevant text.
 */
function toStringArray(items: unknown): string[] {
	if (!Array.isArray(items)) return [];
	return items.map(toGroundingText).filter((text) => text.length > 0);
}

function parseGroundingResponse(
	text: string,
	instruments: string[],
	warnings: string[],
): GroundingResult {
	const emptyResult = createEmptyGroundingResult(instruments);
	const parsed = extractGroundingJson(text);
	if (!parsed) {
		warnings.push("Could not extract JSON from grounding response");
		return emptyResult;
	}

	try {
		const perSymbol = parsePerSymbolContext(parsed.perSymbol);
		const global = parseGlobalContext(parsed.global);
		const sources = parseSources(parsed.sources);
		ensureAllInstrumentsPresent(perSymbol, instruments);
		return { perSymbol, global, sources };
	} catch {
		warnings.push("Failed to parse grounding response JSON");
		return emptyResult;
	}
}

function createEmptyGroundingResult(instruments: string[]): GroundingResult {
	return {
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
}

function toGroundingText(item: unknown): string {
	if (typeof item === "string") return item;
	if (item === null || item === undefined) return "";
	if (typeof item === "object") return toGroundingTextFromObject(item as Record<string, unknown>);
	return String(item);
}

function toGroundingTextFromObject(obj: Record<string, unknown>): string {
	if (typeof obj.headline === "string") {
		const parts = [obj.headline];
		if (typeof obj.source === "string") parts.push(`(${obj.source})`);
		if (typeof obj.date === "string") parts.push(`[${obj.date}]`);
		return parts.join(" ");
	}
	const textField = [obj.text, obj.content, obj.summary, obj.description].find(
		(value) => typeof value === "string",
	);
	return typeof textField === "string" ? textField : JSON.stringify(obj);
}

function extractGroundingJson(text: string): Record<string, unknown> | undefined {
	const jsonMatch = text.match(/\{[\s\S]*\}/);
	if (!jsonMatch) return undefined;
	return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
}

function parsePerSymbolContext(parsedPerSymbol: unknown): GroundingResult["perSymbol"] {
	if (!Array.isArray(parsedPerSymbol)) return [];
	return parsedPerSymbol
		.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
		.map((item) => ({
			symbol: typeof item.symbol === "string" ? item.symbol : "",
			news: toStringArray(item.news),
			fundamentals: toStringArray(item.fundamentals),
			bullCase: toStringArray(item.bullCase),
			bearCase: toStringArray(item.bearCase),
		}));
}

function parseGlobalContext(parsedGlobal: unknown): GroundingResult["global"] {
	if (!parsedGlobal || typeof parsedGlobal !== "object") {
		return { macro: [], events: [] };
	}
	const global = parsedGlobal as Record<string, unknown>;
	return {
		macro: toStringArray(global.macro),
		events: toStringArray(global.events),
	};
}

function parseSources(parsedSources: unknown): GroundingResult["sources"] {
	if (!Array.isArray(parsedSources)) return [];
	const sources: GroundingResult["sources"] = [];
	for (const source of parsedSources) {
		if (!source || typeof source !== "object") continue;
		const item = source as Record<string, unknown>;
		if (typeof item.url !== "string" || typeof item.title !== "string") continue;
		sources.push({
			url: item.url,
			title: item.title,
			relevance: typeof item.relevance === "string" ? item.relevance : "",
			sourceType: item.sourceType === "x" ? "x" : item.sourceType === "news" ? "news" : "url",
		});
	}
	return sources;
}

function ensureAllInstrumentsPresent(
	perSymbol: GroundingResult["perSymbol"],
	instruments: string[],
): void {
	const symbolsWithData = new Set(perSymbol.map((item) => item.symbol));
	for (const symbol of instruments) {
		if (symbolsWithData.has(symbol)) continue;
		perSymbol.push({
			symbol,
			news: [],
			fundamentals: [],
			bullCase: [],
			bearCase: [],
		});
	}
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
