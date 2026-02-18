/**
 * Trader Step
 *
 * Sixth step in the OODA trading cycle. Synthesizes all analysis
 * (bullish/bearish research, news, fundamentals) into a decision plan.
 * Processes symbols in batches to improve structured output reliability,
 * with each batch seeing decisions from prior batches.
 *
 * Uses multi-step execution with prepareStep to enable tool calling
 * before structured output generation.
 * This is required because Gemini doesn't support tools + structured
 * output simultaneously.
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { createNodeLogger } from "@cream/logger";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { trader } from "../../../agents/index.js";
import {
	getEnrichedPortfolioState,
	getGreeks,
	getPredictionSignals,
	getQuotes,
	getRecentDecisions,
	optionChain,
} from "../../../tools/index.js";
import {
	buildBatchPrompt,
	createBatchState,
	isDecisionPlan,
	logOffBatchDecisions,
	type NormalizedTraderInput,
	type TraderBatchOutcome,
	type TraderBatchState,
} from "./trader-batch-utils.js";

const log = createNodeLogger({ service: "trading-cycle:trader" });

import { getModelId } from "@cream/domain";
import {
	CandleSummarySchema,
	ConstraintsSchema,
	DecisionPlanSchema,
	type DecisionSchema,
	EnrichedPositionSchema,
	FundamentalsAnalysisSchema,
	MemoryCaseSchema,
	PredictionMarketSignalsSchema,
	QuoteDataSchema,
	RecentCloseSchema,
	RegimeDataSchema,
	ResearchSchema,
	SentimentAnalysisSchema,
} from "../schemas.js";

const BATCH_SIZE = 5;

const TraderInputSchema = z.object({
	cycleId: z.string().describe("Unique identifier for this trading cycle"),
	instruments: z.array(z.string()).min(1).describe("Symbols to trade"),
	regimeLabels: z
		.record(z.string(), RegimeDataSchema)
		.optional()
		.describe("Regime classifications per symbol"),
	constraints: ConstraintsSchema.optional().describe("Runtime risk constraints"),
	newsAnalysis: z
		.array(SentimentAnalysisSchema)
		.optional()
		.describe("News analysis from analysts step"),
	fundamentalsAnalysis: z
		.array(FundamentalsAnalysisSchema)
		.optional()
		.describe("Fundamentals analysis from analysts step"),
	bullishResearch: z.array(ResearchSchema).describe("Bullish research from debate step"),
	bearishResearch: z.array(ResearchSchema).describe("Bearish research from debate step"),
	recentCloses: z
		.array(RecentCloseSchema)
		.optional()
		.describe("Recently closed positions (cooldown)"),
	quotes: z
		.record(z.string(), QuoteDataSchema)
		.optional()
		.describe("Current market quotes keyed by symbol"),
	memoryCases: z
		.array(MemoryCaseSchema)
		.optional()
		.describe("Similar historical cases from memory"),
	candleSummaries: z
		.array(CandleSummarySchema)
		.optional()
		.describe("Price action summaries per symbol"),
	predictionMarketSignals: PredictionMarketSignalsSchema.optional().describe(
		"Prediction market signals from orient step",
	),
	positions: z
		.array(EnrichedPositionSchema)
		.optional()
		.describe("Current open positions with thesis context"),
});

const TraderOutputSchema = z.object({
	cycleId: z.string(),
	decisionPlan: DecisionPlanSchema,
	errors: z.array(z.string()),
	warnings: z.array(z.string()),
	metrics: z.object({
		totalMs: z.number(),
		batchCount: z.number(),
	}),
});

export const traderStep = createStep({
	id: "trader-synthesize",
	description: "Synthesize research into decision plan with batched processing",
	inputSchema: TraderInputSchema,
	outputSchema: TraderOutputSchema,
	execute: async ({ inputData }) => {
		const startTime = performance.now();
		const { cycleId, instruments } = inputData;
		const errors: string[] = [];
		const warnings: string[] = [];

		const batches = chunk(instruments, BATCH_SIZE);
		const normalizedInput = normalizeTraderInput(inputData);
		logTraderStart(inputData, cycleId, batches.length);

		const decisionPlan = await runTraderBatched(
			cycleId,
			batches,
			normalizedInput,
			errors,
			warnings,
		);

		log.info(
			{
				cycleId,
				decisionCount: decisionPlan.decisions.length,
				decisions: decisionPlan.decisions.map((d) => ({
					symbol: d.instrumentId,
					action: d.action,
					confidence: d.confidence,
				})),
				errorCount: errors.length,
				warningCount: warnings.length,
				errors: errors.length > 0 ? errors : undefined,
				warnings: warnings.length > 0 ? warnings : undefined,
			},
			"Completed trader step",
		);

		return {
			cycleId,
			decisionPlan,
			errors,
			warnings,
			metrics: {
				totalMs: performance.now() - startTime,
				batchCount: batches.length,
			},
		};
	},
});

function chunk<T>(array: T[], size: number): T[][] {
	const result: T[][] = [];
	for (let i = 0; i < array.length; i += size) {
		result.push(array.slice(i, i + size));
	}
	return result;
}

function normalizeTraderInput(inputData: z.infer<typeof TraderInputSchema>): NormalizedTraderInput {
	return {
		regimeLabels: inputData.regimeLabels ?? {},
		constraints: inputData.constraints,
		newsAnalysis: inputData.newsAnalysis ?? [],
		fundamentalsAnalysis: inputData.fundamentalsAnalysis ?? [],
		bullishResearch: inputData.bullishResearch,
		bearishResearch: inputData.bearishResearch,
		recentCloses: inputData.recentCloses ?? [],
		quotes: inputData.quotes ?? {},
		memoryCases: inputData.memoryCases ?? [],
		candleSummaries: inputData.candleSummaries ?? [],
		predictionMarketSignals: inputData.predictionMarketSignals,
		positions: inputData.positions ?? [],
	};
}

function logTraderStart(
	inputData: z.infer<typeof TraderInputSchema>,
	cycleId: string,
	batchCount: number,
): void {
	log.info(
		{
			cycleId,
			symbolCount: inputData.instruments.length,
			batchCount,
			batchSize: BATCH_SIZE,
			bullishResearchCount: inputData.bullishResearch.length,
			bearishResearchCount: inputData.bearishResearch.length,
			hasConstraints: !!inputData.constraints,
			recentClosesCount: inputData.recentCloses?.length ?? 0,
			positionsCount: inputData.positions?.length ?? 0,
		},
		"Starting trader step with batching",
	);
}

function logBatchStart(cycleId: string, batchState: TraderBatchState): void {
	log.debug(
		{
			cycleId,
			batchIndex: batchState.batchIndex + 1,
			batchCount: batchState.batchCount,
			symbols: batchState.batch,
			batchPositionCount: batchState.batchPositions.length,
			batchQuoteCount: Object.keys(batchState.batchQuotes).length,
		},
		"Processing trader batch",
	);
}

async function consumeTraderToolCalls(
	cycleId: string,
	batchIndex: number,
	stream: Awaited<ReturnType<typeof trader.stream>>,
): Promise<void> {
	let toolCallCount = 0;
	const toolsUsed: string[] = [];
	for await (const chunk of stream.fullStream) {
		if (chunk.type !== "tool-call") continue;
		toolCallCount++;
		const toolName = chunk.payload.toolName;
		if (!toolsUsed.includes(toolName)) {
			toolsUsed.push(toolName);
		}
		log.debug(
			{ cycleId, batchIndex: batchIndex + 1, toolName, toolCallId: chunk.payload.toolCallId },
			"Trader tool call",
		);
	}
	if (toolCallCount > 0) {
		log.info(
			{ cycleId, batchIndex: batchIndex + 1, toolCallCount, toolsUsed },
			"Trader completed tool calls",
		);
	}
}

async function runTraderBatched(
	cycleId: string,
	batches: string[][],
	input: NormalizedTraderInput,
	errors: string[],
	warnings: string[],
): Promise<z.infer<typeof DecisionPlanSchema>> {
	const allDecisions: z.infer<typeof DecisionSchema>[] = [];
	const portfolioNotes: string[] = [];
	for (const [batchIndex, batch] of batches.entries()) {
		if (!batch) continue;
		const outcome = await processTraderBatch(
			cycleId,
			batchIndex,
			batches.length,
			batch,
			input,
			allDecisions,
			warnings,
		);
		if (outcome.error) {
			errors.push(`Trader batch ${batchIndex + 1}/${batches.length} failed: ${outcome.error}`);
			continue;
		}
		allDecisions.push(...outcome.decisions);
		if (outcome.portfolioNotes) {
			portfolioNotes.push(outcome.portfolioNotes);
		}
	}

	return {
		cycleId,
		timestamp: new Date().toISOString(),
		decisions: allDecisions,
		portfolioNotes:
			portfolioNotes.length > 0 ? portfolioNotes.join(" | ") : "No decisions generated",
	};
}

async function processTraderBatch(
	cycleId: string,
	batchIndex: number,
	batchCount: number,
	batch: string[],
	input: NormalizedTraderInput,
	priorDecisions: z.infer<typeof DecisionSchema>[],
	warnings: string[],
): Promise<TraderBatchOutcome> {
	const batchState = createBatchState(batch, batchIndex, batchCount, input);
	logBatchStart(cycleId, batchState);
	try {
		const prompt = buildBatchPrompt(cycleId, batchState, input, priorDecisions);
		logBatchPrompt(cycleId, batchState, prompt);
		const stream = await createTraderStream(cycleId, batchState, prompt);
		await consumeTraderToolCalls(cycleId, batchState.batchIndex, stream);
		const plan = await stream.object;
		return buildBatchOutcome(cycleId, batchState, plan, warnings);
	} catch (error) {
		log.error(
			{ cycleId, batchIndex: batchIndex + 1, error: formatError(error) },
			"Trader batch failed",
		);
		return { decisions: [], error: formatError(error) };
	}
}

function logBatchPrompt(cycleId: string, batchState: TraderBatchState, prompt: string): void {
	log.info(
		{
			cycleId,
			batchIndex: batchState.batchIndex + 1,
			promptLength: prompt.length,
			promptPreview: prompt.slice(0, 500),
		},
		"Trader batch prompt built",
	);
	log.debug(
		{ cycleId, batchIndex: batchState.batchIndex + 1, fullPrompt: prompt },
		"Full trader prompt",
	);
}

async function createTraderStream(
	cycleId: string,
	batchState: TraderBatchState,
	prompt: string,
): Promise<Awaited<ReturnType<typeof trader.stream>>> {
	return trader.stream(prompt, {
		memory: {
			thread: {
				id: `${cycleId}-trader-batch-${batchState.batchIndex + 1}`,
				metadata: { cycleId, symbols: batchState.batch, batchIndex: batchState.batchIndex + 1 },
			},
			resource: "trader",
		},
		prepareStep: async ({ stepNumber }) =>
			prepareTraderStep(cycleId, batchState.batchIndex, stepNumber),
		abortSignal: AbortSignal.timeout(900_000),
	});
}

function prepareTraderStep(
	cycleId: string,
	batchIndex: number,
	stepNumber: number,
): {
	model: string;
	tools:
		| {
				optionChain: typeof optionChain;
				getGreeks: typeof getGreeks;
				getQuotes: typeof getQuotes;
				getRecentDecisions: typeof getRecentDecisions;
				getEnrichedPortfolioState: typeof getEnrichedPortfolioState;
				getPredictionSignals: typeof getPredictionSignals;
		  }
		| undefined;
	toolChoice?: "auto";
	structuredOutput?: { schema: typeof DecisionPlanSchema };
} {
	if (stepNumber === 0) {
		log.debug({ cycleId, batchIndex: batchIndex + 1, stepNumber }, "Trader step 0: enabling tools");
		return {
			model: getModelId(),
			tools: {
				optionChain,
				getGreeks,
				getQuotes,
				getRecentDecisions,
				getEnrichedPortfolioState,
				getPredictionSignals,
			},
			toolChoice: "auto",
		};
	}
	log.debug(
		{ cycleId, batchIndex: batchIndex + 1, stepNumber },
		"Trader step 1+: structured output mode",
	);
	return {
		model: getModelId(),
		tools: undefined,
		structuredOutput: { schema: DecisionPlanSchema },
	};
}

function buildBatchOutcome(
	cycleId: string,
	batchState: TraderBatchState,
	plan: unknown,
	warnings: string[],
): TraderBatchOutcome {
	if (!isDecisionPlan(plan)) {
		log.warn(
			{ cycleId, batchIndex: batchState.batchIndex + 1 },
			"Trader batch returned no structured output",
		);
		return { decisions: [] };
	}
	const validatedPlan = validateDecisionPlan(
		cycleId,
		plan as z.infer<typeof DecisionPlanSchema>,
		warnings,
	);
	const batchDecisions = validatedPlan.decisions.filter((decision) =>
		batchState.batchSet.has(decision.instrumentId),
	);
	logOffBatchDecisions(batchState, validatedPlan.decisions, batchDecisions);
	log.debug(
		{ cycleId, batchIndex: batchState.batchIndex + 1, decisionCount: batchDecisions.length },
		"Trader batch complete",
	);
	return { decisions: batchDecisions, portfolioNotes: validatedPlan.portfolioNotes };
}

function validateDecisionPlan(
	cycleId: string,
	plan: z.infer<typeof DecisionPlanSchema>,
	warnings: string[],
): z.infer<typeof DecisionPlanSchema> {
	const validatedDecisions: z.infer<typeof DecisionSchema>[] = [];

	for (const d of plan.decisions) {
		// Options are exempt from stop-loss requirement (managed via option Greeks)
		const isOption = d.instrumentType === "OPTION";

		// Validate stop-loss for equity positions
		if (!isOption) {
			if (!d.stopLoss || !Number.isFinite(d.stopLoss.price) || d.stopLoss.price <= 0) {
				const errMsg = `Decision ${d.decisionId} (${d.instrumentId}) REJECTED: invalid or missing stop-loss price ${d.stopLoss?.price}`;
				warnings.push(errMsg);
				log.error(
					{
						cycleId,
						decisionId: d.decisionId,
						instrumentId: d.instrumentId,
						action: d.action,
						rawPrice: d.stopLoss?.price,
					},
					"REJECTING decision - invalid stop-loss price",
				);
				continue;
			}
		}

		if (d.takeProfit && (!Number.isFinite(d.takeProfit.price) || d.takeProfit.price <= 0)) {
			log.warn(
				{
					cycleId,
					decisionId: d.decisionId,
					instrumentId: d.instrumentId,
					rawPrice: d.takeProfit.price,
				},
				"Invalid take-profit price - ignoring",
			);
			validatedDecisions.push({ ...d, takeProfit: undefined });
			continue;
		}

		validatedDecisions.push(d);
	}

	return { ...plan, decisions: validatedDecisions };
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
