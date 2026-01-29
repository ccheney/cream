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

import { getModelId } from "@cream/domain";
import {
	xmlCandleSummary,
	xmlGlobalGrounding,
	xmlGroundingSources,
	xmlMemoryCases,
	xmlPredictionMarketSignals,
} from "../prompt-helpers.js";
import {
	CandleSummarySchema,
	FundamentalsAnalysisSchema,
	GroundingSourceSchema,
	MemoryCaseSchema,
	PredictionMarketSignalsSchema,
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
	globalGrounding: z
		.object({
			macro: z.array(z.string()),
			events: z.array(z.string()),
		})
		.optional()
		.describe("Global macro context from grounding step"),
	memoryCases: z
		.array(MemoryCaseSchema)
		.optional()
		.describe("Similar historical cases from memory"),
	candleSummaries: z
		.array(CandleSummarySchema)
		.optional()
		.describe("Price action summaries per symbol"),
	groundingSources: z
		.array(GroundingSourceSchema)
		.optional()
		.describe("Source citations from grounding step"),
	predictionMarketSignals: PredictionMarketSignalsSchema.optional().describe(
		"Prediction market signals from orient step",
	),
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
		const {
			cycleId,
			instruments,
			regimeLabels,
			newsAnalysis,
			fundamentalsAnalysis,
			globalGrounding,
			memoryCases,
			candleSummaries,
			groundingSources,
			predictionMarketSignals,
		} = inputData;
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
				globalGrounding,
				memoryCases ?? [],
				candleSummaries ?? [],
				groundingSources ?? [],
				predictionMarketSignals,
				errors,
			),
			runBearishResearcher(
				cycleId,
				instruments,
				regimeLabels,
				newsAnalysis,
				fundamentalsAnalysis,
				globalGrounding,
				memoryCases ?? [],
				candleSummaries ?? [],
				groundingSources ?? [],
				predictionMarketSignals,
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

type GlobalGrounding = { macro: string[]; events: string[] };

async function runBullishResearcher(
	cycleId: string,
	instruments: string[],
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	newsAnalysis: z.infer<typeof SentimentAnalysisSchema>[] | undefined,
	fundamentalsAnalysis: z.infer<typeof FundamentalsAnalysisSchema>[] | undefined,
	globalGrounding: GlobalGrounding | undefined,
	memoryCases: z.infer<typeof MemoryCaseSchema>[],
	candleSummaries: z.infer<typeof CandleSummarySchema>[],
	groundingSources: z.infer<typeof GroundingSourceSchema>[],
	predictionMarketSignals: z.infer<typeof PredictionMarketSignalsSchema> | undefined,
	errors: string[],
): Promise<z.infer<typeof ResearchSchema>[]> {
	try {
		const prompt = buildBullishPrompt(
			instruments,
			regimeLabels,
			newsAnalysis,
			fundamentalsAnalysis,
			globalGrounding,
			memoryCases,
			candleSummaries,
			groundingSources,
			predictionMarketSignals,
		);
		log.debug({ cycleId, symbolCount: instruments.length }, "Calling bullish researcher");

		const response = await bullishResearcher.generate(prompt, {
			structuredOutput: {
				schema: z.array(ResearchSchema),
				model: getModelId(),
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
	globalGrounding: GlobalGrounding | undefined,
	memoryCases: z.infer<typeof MemoryCaseSchema>[],
	candleSummaries: z.infer<typeof CandleSummarySchema>[],
	groundingSources: z.infer<typeof GroundingSourceSchema>[],
	predictionMarketSignals: z.infer<typeof PredictionMarketSignalsSchema> | undefined,
	errors: string[],
): Promise<z.infer<typeof ResearchSchema>[]> {
	try {
		const prompt = buildBearishPrompt(
			instruments,
			regimeLabels,
			newsAnalysis,
			fundamentalsAnalysis,
			globalGrounding,
			memoryCases,
			candleSummaries,
			groundingSources,
			predictionMarketSignals,
		);
		log.debug({ cycleId, symbolCount: instruments.length }, "Calling bearish researcher");

		const response = await bearishResearcher.generate(prompt, {
			structuredOutput: {
				schema: z.array(ResearchSchema),
				model: getModelId(),
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
	globalGrounding: GlobalGrounding | undefined,
	memoryCases: z.infer<typeof MemoryCaseSchema>[],
	candleSummaries: z.infer<typeof CandleSummarySchema>[],
	groundingSources: z.infer<typeof GroundingSourceSchema>[],
	predictionMarketSignals: z.infer<typeof PredictionMarketSignalsSchema> | undefined,
): string {
	const symbolSections = instruments.map((symbol) => {
		const regime = regimeLabels[symbol];
		const news = newsAnalysis?.find((n) => n.instrument_id === symbol);
		const fundamentals = fundamentalsAnalysis?.find((f) => f.instrument_id === symbol);
		const candle = candleSummaries.find((c) => c.symbol === symbol);
		const symbolMemory = memoryCases.filter((c) => c.symbol === symbol);

		const parts: string[] = [];
		if (regime)
			parts.push(
				`  <regime classification="${regime.regime}" confidence="${regime.confidence}" />`,
			);
		if (candle) parts.push(`  ${xmlCandleSummary(candle)}`);
		if (news)
			parts.push(
				`  <sentiment overall="${news.overall_sentiment}" strength="${news.sentiment_strength}" />`,
			);
		if (fundamentals) {
			if (fundamentals.fundamental_drivers.length > 0)
				parts.push(`  <drivers>${fundamentals.fundamental_drivers.join(", ")}</drivers>`);
			parts.push(`  <valuation>${fundamentals.valuation_context}</valuation>`);
		}
		if (symbolMemory.length > 0) parts.push(`  ${xmlMemoryCases(symbolMemory, symbol)}`);
		return `<instrument symbol="${symbol}">\n${parts.join("\n")}\n</instrument>`;
	});

	const sections = [
		`<instruments>\n${symbolSections.join("\n")}\n</instruments>`,
		xmlGlobalGrounding(globalGrounding),
		xmlGroundingSources(groundingSources),
		xmlPredictionMarketSignals(predictionMarketSignals),
	].filter(Boolean);

	return `Create BULLISH theses for all symbols. Consider cross-correlations, sector themes, and relative opportunities.

${sections.join("\n\n")}

Return a thesis for each symbol with conviction level and strongest counterargument.`;
}

function buildBearishPrompt(
	instruments: string[],
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	newsAnalysis: z.infer<typeof SentimentAnalysisSchema>[] | undefined,
	fundamentalsAnalysis: z.infer<typeof FundamentalsAnalysisSchema>[] | undefined,
	globalGrounding: GlobalGrounding | undefined,
	memoryCases: z.infer<typeof MemoryCaseSchema>[],
	candleSummaries: z.infer<typeof CandleSummarySchema>[],
	groundingSources: z.infer<typeof GroundingSourceSchema>[],
	predictionMarketSignals: z.infer<typeof PredictionMarketSignalsSchema> | undefined,
): string {
	const symbolSections = instruments.map((symbol) => {
		const regime = regimeLabels[symbol];
		const news = newsAnalysis?.find((n) => n.instrument_id === symbol);
		const fundamentals = fundamentalsAnalysis?.find((f) => f.instrument_id === symbol);
		const candle = candleSummaries.find((c) => c.symbol === symbol);
		const symbolMemory = memoryCases.filter((c) => c.symbol === symbol);

		const parts: string[] = [];
		if (regime)
			parts.push(
				`  <regime classification="${regime.regime}" confidence="${regime.confidence}" />`,
			);
		if (candle) parts.push(`  ${xmlCandleSummary(candle)}`);
		if (news)
			parts.push(
				`  <sentiment overall="${news.overall_sentiment}" strength="${news.sentiment_strength}" />`,
			);
		if (fundamentals) {
			if (fundamentals.fundamental_headwinds.length > 0)
				parts.push(`  <headwinds>${fundamentals.fundamental_headwinds.join(", ")}</headwinds>`);
			if (fundamentals.event_risk.length > 0)
				parts.push(
					`  <event_risks>${fundamentals.event_risk.map((e) => `${e.event} (${e.date})`).join(", ")}</event_risks>`,
				);
		}
		if (symbolMemory.length > 0) parts.push(`  ${xmlMemoryCases(symbolMemory, symbol)}`);
		return `<instrument symbol="${symbol}">\n${parts.join("\n")}\n</instrument>`;
	});

	const sections = [
		`<instruments>\n${symbolSections.join("\n")}\n</instruments>`,
		xmlGlobalGrounding(globalGrounding),
		xmlGroundingSources(groundingSources),
		xmlPredictionMarketSignals(predictionMarketSignals),
	].filter(Boolean);

	return `Create BEARISH theses for all symbols. Consider systemic risks, correlation risks, and sector vulnerabilities.

${sections.join("\n\n")}

Return a thesis for each symbol with conviction level and strongest counterargument.`;
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
