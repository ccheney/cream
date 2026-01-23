/**
 * Debate Step
 *
 * Fifth step in the OODA trading cycle. Runs bullish and bearish
 * researchers in parallel to create opposing thesis arguments.
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { bearishResearcher, bullishResearcher } from "../../../agents/index.js";
import {
	FundamentalsAnalysisSchema,
	RegimeDataSchema,
	ResearchSchema,
	SentimentAnalysisSchema,
} from "../schemas.js";

// ============================================
// Schemas
// ============================================

const DebateInputSchema = z.object({
	cycleId: z.string().describe("Unique identifier for this trading cycle"),
	instruments: z.array(z.string()).min(1).describe("Symbols to debate"),
	regimeLabels: z.record(z.string(), RegimeDataSchema).describe("Regime labels for context"),
	newsAnalysis: z
		.array(SentimentAnalysisSchema)
		.optional()
		.describe("News analysis from analysts step"),
	fundamentalsAnalysis: z
		.array(FundamentalsAnalysisSchema)
		.optional()
		.describe("Fundamentals analysis from analysts step"),
});

const DebateOutputSchema = z.object({
	cycleId: z.string(),
	bullishResearch: z.array(ResearchSchema),
	bearishResearch: z.array(ResearchSchema),
	errors: z.array(z.string()),
	warnings: z.array(z.string()),
	metrics: z.object({
		totalMs: z.number(),
		bullishMs: z.number(),
		bearishMs: z.number(),
	}),
});

// ============================================
// Step Definition
// ============================================

export const debateStep = createStep({
	id: "debate-researchers",
	description: "Run bullish and bearish researchers in parallel",
	inputSchema: DebateInputSchema,
	outputSchema: DebateOutputSchema,
	execute: async ({ inputData }) => {
		const startTime = performance.now();
		const { cycleId, instruments, regimeLabels, newsAnalysis, fundamentalsAnalysis } = inputData;
		const errors: string[] = [];
		const warnings: string[] = [];

		const bullishStart = performance.now();
		const bearishStart = performance.now();

		const [bullishResearch, bearishResearch] = await Promise.all([
			runBullishResearcher(
				instruments,
				regimeLabels,
				newsAnalysis,
				fundamentalsAnalysis,
				errors,
				warnings,
			),
			runBearishResearcher(
				instruments,
				regimeLabels,
				newsAnalysis,
				fundamentalsAnalysis,
				errors,
				warnings,
			),
		]);

		const bullishMs = performance.now() - bullishStart;
		const bearishMs = performance.now() - bearishStart;

		return {
			cycleId,
			bullishResearch,
			bearishResearch,
			errors,
			warnings,
			metrics: {
				totalMs: performance.now() - startTime,
				bullishMs,
				bearishMs,
			},
		};
	},
});

// ============================================
// Helper Functions
// ============================================

async function runBullishResearcher(
	instruments: string[],
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	newsAnalysis: z.infer<typeof SentimentAnalysisSchema>[] | undefined,
	fundamentalsAnalysis: z.infer<typeof FundamentalsAnalysisSchema>[] | undefined,
	errors: string[],
	warnings: string[],
): Promise<z.infer<typeof ResearchSchema>[]> {
	const results: z.infer<typeof ResearchSchema>[] = [];

	for (const symbol of instruments) {
		try {
			const regime = regimeLabels[symbol];
			const news = newsAnalysis?.find((n) => n.instrument_id === symbol);
			const fundamentals = fundamentalsAnalysis?.find((f) => f.instrument_id === symbol);

			const prompt = buildBullishPrompt(symbol, regime, news, fundamentals);
			const response = await bullishResearcher.generate(prompt);

			const research = parseResearch(symbol, response.text, "bullish", warnings);
			if (research) {
				results.push(research);
			}
		} catch (err) {
			errors.push(`Bullish researcher failed for ${symbol}: ${formatError(err)}`);
		}
	}

	return results;
}

async function runBearishResearcher(
	instruments: string[],
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	newsAnalysis: z.infer<typeof SentimentAnalysisSchema>[] | undefined,
	fundamentalsAnalysis: z.infer<typeof FundamentalsAnalysisSchema>[] | undefined,
	errors: string[],
	warnings: string[],
): Promise<z.infer<typeof ResearchSchema>[]> {
	const results: z.infer<typeof ResearchSchema>[] = [];

	for (const symbol of instruments) {
		try {
			const regime = regimeLabels[symbol];
			const news = newsAnalysis?.find((n) => n.instrument_id === symbol);
			const fundamentals = fundamentalsAnalysis?.find((f) => f.instrument_id === symbol);

			const prompt = buildBearishPrompt(symbol, regime, news, fundamentals);
			const response = await bearishResearcher.generate(prompt);

			const research = parseResearch(symbol, response.text, "bearish", warnings);
			if (research) {
				results.push(research);
			}
		} catch (err) {
			errors.push(`Bearish researcher failed for ${symbol}: ${formatError(err)}`);
		}
	}

	return results;
}

function buildBullishPrompt(
	symbol: string,
	regime: z.infer<typeof RegimeDataSchema> | undefined,
	news: z.infer<typeof SentimentAnalysisSchema> | undefined,
	fundamentals: z.infer<typeof FundamentalsAnalysisSchema> | undefined,
): string {
	const parts = [
		`Create a BULLISH thesis for ${symbol}.`,
		regime ? `Current regime: ${regime.regime} (confidence: ${regime.confidence})` : "",
	];

	if (news) {
		parts.push(`News sentiment: ${news.overall_sentiment} (strength: ${news.sentiment_strength})`);
	}

	if (fundamentals) {
		if (fundamentals.fundamental_drivers.length > 0) {
			parts.push(`Fundamental drivers:\n- ${fundamentals.fundamental_drivers.join("\n- ")}`);
		}
		parts.push(`Valuation: ${fundamentals.valuation_context}`);
	}

	parts.push(
		`Return JSON with: thesis, supporting_factors (array of {factor, source, strength}), conviction_level (0-1), memory_case_ids, strongest_counterargument.`,
	);

	return parts.filter(Boolean).join("\n\n");
}

function buildBearishPrompt(
	symbol: string,
	regime: z.infer<typeof RegimeDataSchema> | undefined,
	news: z.infer<typeof SentimentAnalysisSchema> | undefined,
	fundamentals: z.infer<typeof FundamentalsAnalysisSchema> | undefined,
): string {
	const parts = [
		`Create a BEARISH thesis for ${symbol}.`,
		regime ? `Current regime: ${regime.regime} (confidence: ${regime.confidence})` : "",
	];

	if (news) {
		parts.push(`News sentiment: ${news.overall_sentiment} (strength: ${news.sentiment_strength})`);
	}

	if (fundamentals) {
		if (fundamentals.fundamental_headwinds.length > 0) {
			parts.push(`Fundamental headwinds:\n- ${fundamentals.fundamental_headwinds.join("\n- ")}`);
		}
		if (fundamentals.event_risk.length > 0) {
			parts.push(
				`Event risks:\n- ${fundamentals.event_risk.map((e) => `${e.event} (${e.date}): ${e.potential_impact}`).join("\n- ")}`,
			);
		}
	}

	parts.push(
		`Return JSON with: thesis, supporting_factors (array of {factor, source, strength}), conviction_level (0-1), memory_case_ids, strongest_counterargument.`,
	);

	return parts.filter(Boolean).join("\n\n");
}

function parseResearch(
	symbol: string,
	text: string,
	type: "bullish" | "bearish",
	warnings: string[],
): z.infer<typeof ResearchSchema> | null {
	const jsonMatch = text.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		warnings.push(`Could not extract JSON from ${type} research for ${symbol}`);
		return null;
	}

	try {
		const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
		return {
			instrument_id: symbol,
			thesis: String(parsed.thesis ?? parsed.bullish_thesis ?? parsed.bearish_thesis ?? ""),
			supporting_factors: Array.isArray(parsed.supporting_factors)
				? parsed.supporting_factors.map((f: Record<string, unknown>) => ({
						factor: String(f.factor ?? ""),
						source: String(f.source ?? "FUNDAMENTAL"),
						strength: String(f.strength ?? "MODERATE"),
					}))
				: [],
			conviction_level: Number(parsed.conviction_level ?? 0.5),
			memory_case_ids: Array.isArray(parsed.memory_case_ids) ? parsed.memory_case_ids : [],
			strongest_counterargument: String(parsed.strongest_counterargument ?? ""),
		};
	} catch {
		warnings.push(`Failed to parse ${type} research JSON for ${symbol}`);
		return null;
	}
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
