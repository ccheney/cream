/**
 * Debate Step
 *
 * Fifth step in the OODA trading cycle. Runs bullish and bearish
 * researchers in parallel to create opposing thesis arguments for all instruments.
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { createNodeLogger } from "@cream/logger";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { bearishResearcher, bullishResearcher } from "../../../agents/index.js";

const log = createNodeLogger({ service: "trading-cycle:debate" });

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

		log.info(
			{
				cycleId,
				symbolCount: instruments.length,
				hasNewsAnalysis: (newsAnalysis?.length ?? 0) > 0,
				hasFundamentalsAnalysis: (fundamentalsAnalysis?.length ?? 0) > 0,
			},
			"Starting debate step",
		);

		const bullishStart = performance.now();
		const bearishStart = performance.now();

		const [bullishResearch, bearishResearch] = await Promise.all([
			runBullishResearcher(
				cycleId,
				instruments,
				regimeLabels,
				newsAnalysis,
				fundamentalsAnalysis,
				errors,
			),
			runBearishResearcher(
				cycleId,
				instruments,
				regimeLabels,
				newsAnalysis,
				fundamentalsAnalysis,
				errors,
			),
		]);

		const bullishMs = performance.now() - bullishStart;
		const bearishMs = performance.now() - bearishStart;

		log.info(
			{
				cycleId,
				bullishResultCount: bullishResearch.length,
				bearishResultCount: bearishResearch.length,
				errorCount: errors.length,
			},
			"Completed debate step",
		);

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
	cycleId: string,
	instruments: string[],
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	newsAnalysis: z.infer<typeof SentimentAnalysisSchema>[] | undefined,
	fundamentalsAnalysis: z.infer<typeof FundamentalsAnalysisSchema>[] | undefined,
	errors: string[],
): Promise<z.infer<typeof ResearchSchema>[]> {
	try {
		const prompt = buildBullishPrompt(
			instruments,
			regimeLabels,
			newsAnalysis,
			fundamentalsAnalysis,
		);
		log.debug({ cycleId, symbolCount: instruments.length }, "Calling bullish researcher");

		const response = await bullishResearcher.generate(prompt, {
			structuredOutput: {
				schema: z.array(ResearchSchema),
			},
		});

		log.debug({ cycleId, resultCount: response.object?.length ?? 0 }, "Bullish research complete");
		return response.object ?? [];
	} catch (err) {
		errors.push(`Bullish researcher failed: ${formatError(err)}`);
		log.error({ cycleId, error: formatError(err) }, "Bullish researcher failed");
		return [];
	}
}

async function runBearishResearcher(
	cycleId: string,
	instruments: string[],
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	newsAnalysis: z.infer<typeof SentimentAnalysisSchema>[] | undefined,
	fundamentalsAnalysis: z.infer<typeof FundamentalsAnalysisSchema>[] | undefined,
	errors: string[],
): Promise<z.infer<typeof ResearchSchema>[]> {
	try {
		const prompt = buildBearishPrompt(
			instruments,
			regimeLabels,
			newsAnalysis,
			fundamentalsAnalysis,
		);
		log.debug({ cycleId, symbolCount: instruments.length }, "Calling bearish researcher");

		const response = await bearishResearcher.generate(prompt, {
			structuredOutput: {
				schema: z.array(ResearchSchema),
			},
		});

		log.debug({ cycleId, resultCount: response.object?.length ?? 0 }, "Bearish research complete");
		return response.object ?? [];
	} catch (err) {
		errors.push(`Bearish researcher failed: ${formatError(err)}`);
		log.error({ cycleId, error: formatError(err) }, "Bearish researcher failed");
		return [];
	}
}

function buildBullishPrompt(
	instruments: string[],
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	newsAnalysis: z.infer<typeof SentimentAnalysisSchema>[] | undefined,
	fundamentalsAnalysis: z.infer<typeof FundamentalsAnalysisSchema>[] | undefined,
): string {
	const symbolContexts = instruments.map((symbol) => {
		const regime = regimeLabels[symbol];
		const news = newsAnalysis?.find((n) => n.instrument_id === symbol);
		const fundamentals = fundamentalsAnalysis?.find((f) => f.instrument_id === symbol);

		const lines = [`## ${symbol}`];
		if (regime) lines.push(`Regime: ${regime.regime} (confidence: ${regime.confidence})`);
		if (news)
			lines.push(`Sentiment: ${news.overall_sentiment} (strength: ${news.sentiment_strength})`);
		if (fundamentals) {
			if (fundamentals.fundamental_drivers.length > 0) {
				lines.push(`Drivers: ${fundamentals.fundamental_drivers.join(", ")}`);
			}
			lines.push(`Valuation: ${fundamentals.valuation_context}`);
		}
		return lines.join("\n");
	});

	return `Create BULLISH theses for all symbols. Consider cross-correlations, sector themes, and relative opportunities.

${symbolContexts.join("\n\n")}

Return a thesis for each symbol with conviction level and strongest counterargument.`;
}

function buildBearishPrompt(
	instruments: string[],
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	newsAnalysis: z.infer<typeof SentimentAnalysisSchema>[] | undefined,
	fundamentalsAnalysis: z.infer<typeof FundamentalsAnalysisSchema>[] | undefined,
): string {
	const symbolContexts = instruments.map((symbol) => {
		const regime = regimeLabels[symbol];
		const news = newsAnalysis?.find((n) => n.instrument_id === symbol);
		const fundamentals = fundamentalsAnalysis?.find((f) => f.instrument_id === symbol);

		const lines = [`## ${symbol}`];
		if (regime) lines.push(`Regime: ${regime.regime} (confidence: ${regime.confidence})`);
		if (news)
			lines.push(`Sentiment: ${news.overall_sentiment} (strength: ${news.sentiment_strength})`);
		if (fundamentals) {
			if (fundamentals.fundamental_headwinds.length > 0) {
				lines.push(`Headwinds: ${fundamentals.fundamental_headwinds.join(", ")}`);
			}
			if (fundamentals.event_risk.length > 0) {
				lines.push(
					`Risks: ${fundamentals.event_risk.map((e) => `${e.event} (${e.date})`).join(", ")}`,
				);
			}
		}
		return lines.join("\n");
	});

	return `Create BEARISH theses for all symbols. Consider systemic risks, correlation risks, and sector vulnerabilities.

${symbolContexts.join("\n\n")}

Return a thesis for each symbol with conviction level and strongest counterargument.`;
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
