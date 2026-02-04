/**
 * Debate Step
 *
 * Fifth step in the OODA trading cycle. Runs bullish and bearish
 * researchers in parallel for each batch of symbols to create
 * opposing thesis arguments.
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
// Constants
// ============================================

const BATCH_SIZE = 5;

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
		batchCount: z.number(),
	}),
});

// ============================================
// Step Definition
// ============================================

export const debateStep = createStep({
	id: "debate-researchers",
	description: "Run bullish and bearish researchers in parallel with batched symbols",
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

		const batches = chunk(instruments, BATCH_SIZE);
		log.info(
			{
				cycleId,
				symbolCount: instruments.length,
				batchCount: batches.length,
				batchSize: BATCH_SIZE,
				hasNewsAnalysis: (newsAnalysis?.length ?? 0) > 0,
				hasFundamentalsAnalysis: (fundamentalsAnalysis?.length ?? 0) > 0,
			},
			"Starting debate step with batching",
		);

		const bullishStart = performance.now();
		const bearishStart = performance.now();

		const allBullishResearch: z.infer<typeof ResearchSchema>[] = [];
		const allBearishResearch: z.infer<typeof ResearchSchema>[] = [];

		// Process batches sequentially, but run bullish/bearish in parallel for each batch
		for (let i = 0; i < batches.length; i++) {
			const batch = batches[i];
			if (!batch) continue;

			log.debug(
				{ cycleId, batchIndex: i + 1, batchCount: batches.length, symbols: batch },
				"Processing debate batch",
			);

			const [bullishResults, bearishResults] = await Promise.all([
				runBullishResearcherBatch(
					cycleId,
					i + 1,
					batch,
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
				runBearishResearcherBatch(
					cycleId,
					i + 1,
					batch,
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

			allBullishResearch.push(...bullishResults);
			allBearishResearch.push(...bearishResults);

			log.debug(
				{
					cycleId,
					batchIndex: i + 1,
					bullishCount: bullishResults.length,
					bearishCount: bearishResults.length,
				},
				"Debate batch complete",
			);
		}

		const bullishMs = performance.now() - bullishStart;
		const bearishMs = performance.now() - bearishStart;

		log.info(
			{
				cycleId,
				bullishResultCount: allBullishResearch.length,
				bearishResultCount: allBearishResearch.length,
				errorCount: errors.length,
			},
			"Completed debate step",
		);

		return {
			cycleId,
			bullishResearch: allBullishResearch,
			bearishResearch: allBearishResearch,
			errors,
			warnings,
			metrics: {
				totalMs: performance.now() - startTime,
				bullishMs,
				bearishMs,
				batchCount: batches.length,
			},
		};
	},
});

// ============================================
// Helper Functions
// ============================================

function chunk<T>(array: T[], size: number): T[][] {
	const result: T[][] = [];
	for (let i = 0; i < array.length; i += size) {
		result.push(array.slice(i, i + size));
	}
	return result;
}

type GlobalGrounding = { macro: string[]; events: string[] };

async function runBullishResearcherBatch(
	cycleId: string,
	batchIndex: number,
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
		log.info(
			{
				cycleId,
				batchIndex,
				symbolCount: instruments.length,
				promptLength: prompt.length,
				promptPreview: prompt.slice(0, 500),
			},
			"Bullish researcher batch prompt built",
		);
		log.debug({ cycleId, batchIndex, fullPrompt: prompt }, "Full bullish batch prompt");

		const response = await bullishResearcher.generate(prompt, {
			structuredOutput: {
				schema: z.array(ResearchSchema),
				model: getModelId(),
			},
			abortSignal: AbortSignal.timeout(600_000), // 10 min per batch
		});

		log.debug(
			{ cycleId, batchIndex, resultCount: response.object?.length ?? 0 },
			"Bullish batch research complete",
		);
		return response.object ?? [];
	} catch (err) {
		const errorMsg = `Bullish researcher batch ${batchIndex} failed: ${formatError(err)}`;
		errors.push(errorMsg);
		log.error({ cycleId, batchIndex, error: formatError(err) }, "Bullish researcher batch failed");
		return [];
	}
}

async function runBearishResearcherBatch(
	cycleId: string,
	batchIndex: number,
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
		log.info(
			{
				cycleId,
				batchIndex,
				symbolCount: instruments.length,
				promptLength: prompt.length,
				promptPreview: prompt.slice(0, 500),
			},
			"Bearish researcher batch prompt built",
		);
		log.debug({ cycleId, batchIndex, fullPrompt: prompt }, "Full bearish batch prompt");

		const response = await bearishResearcher.generate(prompt, {
			structuredOutput: {
				schema: z.array(ResearchSchema),
				model: getModelId(),
			},
			abortSignal: AbortSignal.timeout(600_000), // 10 min per batch
		});

		log.debug(
			{ cycleId, batchIndex, resultCount: response.object?.length ?? 0 },
			"Bearish batch research complete",
		);
		return response.object ?? [];
	} catch (err) {
		const errorMsg = `Bearish researcher batch ${batchIndex} failed: ${formatError(err)}`;
		errors.push(errorMsg);
		log.error({ cycleId, batchIndex, error: formatError(err) }, "Bearish researcher batch failed");
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

	return `Create BULLISH theses for these symbols: ${instruments.join(", ")}. Consider cross-correlations, sector themes, and relative opportunities.

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

	return `Create BEARISH theses for these symbols: ${instruments.join(", ")}. Consider systemic risks, correlation risks, and sector vulnerabilities.

${sections.join("\n\n")}

Return a thesis for each symbol with conviction level and strongest counterargument.`;
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
