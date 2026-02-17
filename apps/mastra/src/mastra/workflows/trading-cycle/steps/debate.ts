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
import { buildBearishPrompt, buildBullishPrompt } from "./debate-prompts.js";

const log = createNodeLogger({ service: "trading-cycle:debate" });

import { getModelId } from "@cream/domain";
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
	execute: async ({ inputData }) => executeDebateStep(inputData),
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

async function executeDebateStep(
	inputData: z.infer<typeof DebateInputSchema>,
): Promise<z.infer<typeof DebateOutputSchema>> {
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

	logDebateStart(cycleId, instruments.length, batches.length, newsAnalysis, fundamentalsAnalysis);
	const batchResult = await runDebateBatches(
		cycleId,
		batches,
		regimeLabels,
		newsAnalysis,
		fundamentalsAnalysis,
		globalGrounding,
		memoryCases ?? [],
		candleSummaries ?? [],
		groundingSources ?? [],
		predictionMarketSignals,
		errors,
	);
	logDebateCompletion(
		cycleId,
		batchResult.allBullishResearch.length,
		batchResult.allBearishResearch.length,
		errors,
	);

	return {
		cycleId,
		bullishResearch: batchResult.allBullishResearch,
		bearishResearch: batchResult.allBearishResearch,
		errors,
		warnings,
		metrics: {
			totalMs: performance.now() - startTime,
			bullishMs: batchResult.bullishMs,
			bearishMs: batchResult.bearishMs,
			batchCount: batches.length,
		},
	};
}

function logDebateStart(
	cycleId: string,
	symbolCount: number,
	batchCount: number,
	newsAnalysis: z.infer<typeof SentimentAnalysisSchema>[] | undefined,
	fundamentalsAnalysis: z.infer<typeof FundamentalsAnalysisSchema>[] | undefined,
): void {
	log.info(
		{
			cycleId,
			symbolCount,
			batchCount,
			batchSize: BATCH_SIZE,
			hasNewsAnalysis: (newsAnalysis?.length ?? 0) > 0,
			hasFundamentalsAnalysis: (fundamentalsAnalysis?.length ?? 0) > 0,
		},
		"Starting debate step with batching",
	);
}

async function runDebateBatches(
	cycleId: string,
	batches: string[][],
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	newsAnalysis: z.infer<typeof SentimentAnalysisSchema>[] | undefined,
	fundamentalsAnalysis: z.infer<typeof FundamentalsAnalysisSchema>[] | undefined,
	globalGrounding: GlobalGrounding | undefined,
	memoryCases: z.infer<typeof MemoryCaseSchema>[],
	candleSummaries: z.infer<typeof CandleSummarySchema>[],
	groundingSources: z.infer<typeof GroundingSourceSchema>[],
	predictionMarketSignals: z.infer<typeof PredictionMarketSignalsSchema> | undefined,
	errors: string[],
): Promise<{
	allBullishResearch: z.infer<typeof ResearchSchema>[];
	allBearishResearch: z.infer<typeof ResearchSchema>[];
	bullishMs: number;
	bearishMs: number;
}> {
	const bullishStart = performance.now();
	const bearishStart = performance.now();
	const allBullishResearch: z.infer<typeof ResearchSchema>[] = [];
	const allBearishResearch: z.infer<typeof ResearchSchema>[] = [];

	for (let i = 0; i < batches.length; i++) {
		const batch = batches[i];
		if (!batch) continue;
		const result = await runDebateBatch(
			cycleId,
			i + 1,
			batches.length,
			batch,
			regimeLabels,
			newsAnalysis,
			fundamentalsAnalysis,
			globalGrounding,
			memoryCases,
			candleSummaries,
			groundingSources,
			predictionMarketSignals,
			errors,
		);
		allBullishResearch.push(...result.bullishResults);
		allBearishResearch.push(...result.bearishResults);
	}

	return {
		allBullishResearch,
		allBearishResearch,
		bullishMs: performance.now() - bullishStart,
		bearishMs: performance.now() - bearishStart,
	};
}

async function runDebateBatch(
	cycleId: string,
	batchIndex: number,
	batchCount: number,
	batch: string[],
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	newsAnalysis: z.infer<typeof SentimentAnalysisSchema>[] | undefined,
	fundamentalsAnalysis: z.infer<typeof FundamentalsAnalysisSchema>[] | undefined,
	globalGrounding: GlobalGrounding | undefined,
	memoryCases: z.infer<typeof MemoryCaseSchema>[],
	candleSummaries: z.infer<typeof CandleSummarySchema>[],
	groundingSources: z.infer<typeof GroundingSourceSchema>[],
	predictionMarketSignals: z.infer<typeof PredictionMarketSignalsSchema> | undefined,
	errors: string[],
): Promise<{
	bullishResults: z.infer<typeof ResearchSchema>[];
	bearishResults: z.infer<typeof ResearchSchema>[];
}> {
	log.debug({ cycleId, batchIndex, batchCount, symbols: batch }, "Processing debate batch");
	const [bullishResults, bearishResults] = await Promise.all([
		runBullishResearcherBatch(
			cycleId,
			batchIndex,
			batch,
			regimeLabels,
			newsAnalysis,
			fundamentalsAnalysis,
			globalGrounding,
			memoryCases,
			candleSummaries,
			groundingSources,
			predictionMarketSignals,
			errors,
		),
		runBearishResearcherBatch(
			cycleId,
			batchIndex,
			batch,
			regimeLabels,
			newsAnalysis,
			fundamentalsAnalysis,
			globalGrounding,
			memoryCases,
			candleSummaries,
			groundingSources,
			predictionMarketSignals,
			errors,
		),
	]);
	log.debug(
		{
			cycleId,
			batchIndex,
			bullishCount: bullishResults.length,
			bearishCount: bearishResults.length,
		},
		"Debate batch complete",
	);
	return { bullishResults, bearishResults };
}

function logDebateCompletion(
	cycleId: string,
	bullishResultCount: number,
	bearishResultCount: number,
	errors: string[],
): void {
	log.info(
		{ cycleId, bullishResultCount, bearishResultCount, errorCount: errors.length },
		"Completed debate step",
	);
}

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
			abortSignal: AbortSignal.timeout(900_000), // 15 min per batch
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
			abortSignal: AbortSignal.timeout(900_000), // 15 min per batch
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

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
