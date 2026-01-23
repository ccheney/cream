/**
 * Analysts Step
 *
 * Fourth step in the OODA trading cycle. Runs news analyst and fundamentals
 * analyst agents in parallel to gather analysis for each instrument.
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { fundamentalsAnalyst, newsAnalyst } from "../../../agents/index.js";
import {
	FundamentalsAnalysisSchema,
	RegimeDataSchema,
	SentimentAnalysisSchema,
} from "../schemas.js";

// ============================================
// Schemas
// ============================================

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

const AnalystsInputSchema = z.object({
	cycleId: z.string().describe("Unique identifier for this trading cycle"),
	instruments: z.array(z.string()).min(1).describe("Symbols to analyze"),
	regimeLabels: z.record(z.string(), RegimeDataSchema).describe("Regime labels for context"),
	groundingContext: z
		.object({
			perSymbol: z.array(SymbolContextSchema),
			global: GlobalContextSchema,
		})
		.optional()
		.describe("Grounding context from previous step"),
});

const AnalystsOutputSchema = z.object({
	cycleId: z.string(),
	newsAnalysis: z.array(SentimentAnalysisSchema),
	fundamentalsAnalysis: z.array(FundamentalsAnalysisSchema),
	errors: z.array(z.string()),
	warnings: z.array(z.string()),
	metrics: z.object({
		totalMs: z.number(),
		newsAnalystMs: z.number(),
		fundamentalsAnalystMs: z.number(),
	}),
});

// ============================================
// Step Definition
// ============================================

export const analystsStep = createStep({
	id: "analysts-parallel",
	description: "Run news and fundamentals analysts in parallel",
	inputSchema: AnalystsInputSchema,
	outputSchema: AnalystsOutputSchema,
	execute: async ({ inputData }) => {
		const startTime = performance.now();
		const { cycleId, instruments, regimeLabels, groundingContext } = inputData;
		const errors: string[] = [];
		const warnings: string[] = [];

		// Run analysts in parallel
		const newsStart = performance.now();
		const fundamentalsStart = performance.now();

		const [newsResults, fundamentalsResults] = await Promise.all([
			runNewsAnalyst(instruments, regimeLabels, groundingContext, errors, warnings),
			runFundamentalsAnalyst(instruments, regimeLabels, groundingContext, errors, warnings),
		]);

		const newsAnalystMs = performance.now() - newsStart;
		const fundamentalsAnalystMs = performance.now() - fundamentalsStart;

		return {
			cycleId,
			newsAnalysis: newsResults,
			fundamentalsAnalysis: fundamentalsResults,
			errors,
			warnings,
			metrics: {
				totalMs: performance.now() - startTime,
				newsAnalystMs,
				fundamentalsAnalystMs,
			},
		};
	},
});

// ============================================
// Helper Functions
// ============================================

async function runNewsAnalyst(
	instruments: string[],
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	groundingContext:
		| {
				perSymbol: z.infer<typeof SymbolContextSchema>[];
				global: z.infer<typeof GlobalContextSchema>;
		  }
		| undefined,
	errors: string[],
	warnings: string[],
): Promise<z.infer<typeof SentimentAnalysisSchema>[]> {
	const results: z.infer<typeof SentimentAnalysisSchema>[] = [];

	for (const symbol of instruments) {
		try {
			const symbolContext = groundingContext?.perSymbol.find((s) => s.symbol === symbol);
			const regime = regimeLabels[symbol];

			const prompt = buildNewsAnalystPrompt(
				symbol,
				regime,
				symbolContext,
				groundingContext?.global,
			);
			const response = await newsAnalyst.generate(prompt);

			const analysis = parseNewsAnalysis(symbol, response.text, warnings);
			if (analysis) {
				results.push(analysis);
			}
		} catch (err) {
			errors.push(`News analyst failed for ${symbol}: ${formatError(err)}`);
		}
	}

	return results;
}

async function runFundamentalsAnalyst(
	instruments: string[],
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	groundingContext:
		| {
				perSymbol: z.infer<typeof SymbolContextSchema>[];
				global: z.infer<typeof GlobalContextSchema>;
		  }
		| undefined,
	errors: string[],
	warnings: string[],
): Promise<z.infer<typeof FundamentalsAnalysisSchema>[]> {
	const results: z.infer<typeof FundamentalsAnalysisSchema>[] = [];

	for (const symbol of instruments) {
		try {
			const symbolContext = groundingContext?.perSymbol.find((s) => s.symbol === symbol);
			const regime = regimeLabels[symbol];

			const prompt = buildFundamentalsPrompt(
				symbol,
				regime,
				symbolContext,
				groundingContext?.global,
			);
			const response = await fundamentalsAnalyst.generate(prompt);

			const analysis = parseFundamentalsAnalysis(symbol, response.text, warnings);
			if (analysis) {
				results.push(analysis);
			}
		} catch (err) {
			errors.push(`Fundamentals analyst failed for ${symbol}: ${formatError(err)}`);
		}
	}

	return results;
}

function buildNewsAnalystPrompt(
	symbol: string,
	regime: z.infer<typeof RegimeDataSchema> | undefined,
	symbolContext:
		| {
				news: string[];
				bullCase: string[];
				bearCase: string[];
		  }
		| undefined,
	globalContext: z.infer<typeof GlobalContextSchema> | undefined,
): string {
	const parts = [
		`Analyze ${symbol} for news and sentiment impact.`,
		regime ? `Current regime: ${regime.regime} (confidence: ${regime.confidence})` : "",
	];

	if (symbolContext) {
		if (symbolContext.news.length > 0) {
			parts.push(`Recent news:\n- ${symbolContext.news.join("\n- ")}`);
		}
		if (symbolContext.bullCase.length > 0) {
			parts.push(`Bullish signals:\n- ${symbolContext.bullCase.join("\n- ")}`);
		}
		if (symbolContext.bearCase.length > 0) {
			parts.push(`Bearish signals:\n- ${symbolContext.bearCase.join("\n- ")}`);
		}
	}

	if (globalContext?.macro?.length) {
		parts.push(`Macro context:\n- ${globalContext.macro.join("\n- ")}`);
	}

	parts.push(
		"Return your analysis as JSON with event_impacts, overall_sentiment, sentiment_strength, and duration_expectation.",
	);

	return parts.filter(Boolean).join("\n\n");
}

function buildFundamentalsPrompt(
	symbol: string,
	regime: z.infer<typeof RegimeDataSchema> | undefined,
	symbolContext:
		| {
				fundamentals: string[];
				bullCase: string[];
				bearCase: string[];
		  }
		| undefined,
	globalContext: z.infer<typeof GlobalContextSchema> | undefined,
): string {
	const parts = [
		`Analyze ${symbol} for fundamental valuation and macro context.`,
		regime ? `Current regime: ${regime.regime} (confidence: ${regime.confidence})` : "",
	];

	if (symbolContext) {
		if (symbolContext.fundamentals.length > 0) {
			parts.push(`Fundamentals context:\n- ${symbolContext.fundamentals.join("\n- ")}`);
		}
		if (symbolContext.bullCase.length > 0) {
			parts.push(`Bullish factors:\n- ${symbolContext.bullCase.join("\n- ")}`);
		}
		if (symbolContext.bearCase.length > 0) {
			parts.push(`Bearish factors:\n- ${symbolContext.bearCase.join("\n- ")}`);
		}
	}

	if (globalContext) {
		if (globalContext.macro?.length) {
			parts.push(`Macro context:\n- ${globalContext.macro.join("\n- ")}`);
		}
		if (globalContext.events?.length) {
			parts.push(`Upcoming events:\n- ${globalContext.events.join("\n- ")}`);
		}
	}

	parts.push(
		"Return your analysis as JSON with fundamental_drivers, fundamental_headwinds, valuation_context, macro_context, event_risk, and fundamental_thesis.",
	);

	return parts.filter(Boolean).join("\n\n");
}

function parseNewsAnalysis(
	symbol: string,
	text: string,
	warnings: string[],
): z.infer<typeof SentimentAnalysisSchema> | null {
	const jsonMatch = text.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		warnings.push(`Could not extract JSON from news analysis for ${symbol}`);
		return null;
	}

	try {
		const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
		return {
			instrument_id: symbol,
			event_impacts: Array.isArray(parsed.event_impacts) ? parsed.event_impacts : [],
			overall_sentiment: String(parsed.overall_sentiment ?? "NEUTRAL"),
			sentiment_strength: Number(parsed.sentiment_strength ?? 0.5),
			duration_expectation: String(parsed.duration_expectation ?? "DAYS"),
			linked_event_ids: Array.isArray(parsed.linked_event_ids) ? parsed.linked_event_ids : [],
		};
	} catch {
		warnings.push(`Failed to parse news analysis JSON for ${symbol}`);
		return null;
	}
}

function parseFundamentalsAnalysis(
	symbol: string,
	text: string,
	warnings: string[],
): z.infer<typeof FundamentalsAnalysisSchema> | null {
	const jsonMatch = text.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		warnings.push(`Could not extract JSON from fundamentals analysis for ${symbol}`);
		return null;
	}

	try {
		const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
		return {
			instrument_id: symbol,
			fundamental_drivers: Array.isArray(parsed.fundamental_drivers)
				? parsed.fundamental_drivers
				: [],
			fundamental_headwinds: Array.isArray(parsed.fundamental_headwinds)
				? parsed.fundamental_headwinds
				: [],
			valuation_context: String(parsed.valuation_context ?? ""),
			macro_context: String(parsed.macro_context ?? ""),
			event_risk: Array.isArray(parsed.event_risk) ? parsed.event_risk : [],
			fundamental_thesis: String(parsed.fundamental_thesis ?? ""),
			linked_event_ids: Array.isArray(parsed.linked_event_ids) ? parsed.linked_event_ids : [],
		};
	} catch {
		warnings.push(`Failed to parse fundamentals analysis JSON for ${symbol}`);
		return null;
	}
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
