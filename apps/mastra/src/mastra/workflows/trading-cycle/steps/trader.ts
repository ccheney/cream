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
	getRecentDecisions,
	optionChain,
} from "../../../tools/index.js";

const log = createNodeLogger({ service: "trading-cycle:trader" });

import { getModelId } from "@cream/domain";
import {
	xmlCandleSummary,
	xmlCurrentPositions,
	xmlMemoryCases,
	xmlPredictionMarketSignals,
	xmlQuotes,
	xmlRecentCloses,
} from "../prompt-helpers.js";
import {
	CandleSummarySchema,
	type Constraints,
	ConstraintsSchema,
	DecisionPlanSchema,
	type DecisionSchema,
	type EnrichedPosition,
	EnrichedPositionSchema,
	FundamentalsAnalysisSchema,
	MemoryCaseSchema,
	PredictionMarketSignalsSchema,
	QuoteDataSchema,
	type RecentClose,
	RecentCloseSchema,
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

// ============================================
// Step Definition
// ============================================

export const traderStep = createStep({
	id: "trader-synthesize",
	description: "Synthesize research into decision plan with batched processing",
	inputSchema: TraderInputSchema,
	outputSchema: TraderOutputSchema,
	execute: async ({ inputData }) => {
		const startTime = performance.now();
		const {
			cycleId,
			instruments,
			regimeLabels,
			constraints,
			newsAnalysis,
			fundamentalsAnalysis,
			bullishResearch,
			bearishResearch,
			recentCloses,
			quotes,
			memoryCases,
			candleSummaries,
			predictionMarketSignals,
			positions,
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
				bullishResearchCount: bullishResearch.length,
				bearishResearchCount: bearishResearch.length,
				hasConstraints: !!constraints,
				recentClosesCount: recentCloses?.length ?? 0,
				positionsCount: positions?.length ?? 0,
			},
			"Starting trader step with batching",
		);

		const decisionPlan = await runTraderBatched(
			cycleId,
			batches,
			regimeLabels ?? {},
			constraints,
			newsAnalysis ?? [],
			fundamentalsAnalysis ?? [],
			bullishResearch,
			bearishResearch,
			recentCloses ?? [],
			quotes ?? {},
			memoryCases ?? [],
			candleSummaries ?? [],
			predictionMarketSignals,
			positions ?? [],
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

async function runTraderBatched(
	cycleId: string,
	batches: string[][],
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	constraints: Constraints | undefined,
	newsAnalysis: z.infer<typeof SentimentAnalysisSchema>[],
	fundamentalsAnalysis: z.infer<typeof FundamentalsAnalysisSchema>[],
	bullishResearch: z.infer<typeof ResearchSchema>[],
	bearishResearch: z.infer<typeof ResearchSchema>[],
	recentCloses: RecentClose[],
	quotes: Record<string, z.infer<typeof QuoteDataSchema>>,
	memoryCases: z.infer<typeof MemoryCaseSchema>[],
	candleSummaries: z.infer<typeof CandleSummarySchema>[],
	predictionMarketSignals: z.infer<typeof PredictionMarketSignalsSchema> | undefined,
	positions: EnrichedPosition[],
	errors: string[],
	warnings: string[],
): Promise<z.infer<typeof DecisionPlanSchema>> {
	const allDecisions: z.infer<typeof DecisionSchema>[] = [];
	const portfolioNotes: string[] = [];

	for (let i = 0; i < batches.length; i++) {
		const batch = batches[i];
		if (!batch) continue;

		const batchSet = new Set(batch);

		// Filter data to only batch-relevant symbols
		const batchPositions = positions.filter((p) => batchSet.has(p.symbol));
		const batchQuotes = Object.fromEntries(
			Object.entries(quotes).filter(([symbol]) => batchSet.has(symbol)),
		);
		const batchRecentCloses = recentCloses.filter((c) => batchSet.has(c.symbol));

		log.debug(
			{
				cycleId,
				batchIndex: i + 1,
				batchCount: batches.length,
				symbols: batch,
				batchPositionCount: batchPositions.length,
				batchQuoteCount: Object.keys(batchQuotes).length,
			},
			"Processing trader batch",
		);

		try {
			const prompt = buildTraderPrompt(
				cycleId,
				batch,
				regimeLabels,
				constraints,
				newsAnalysis,
				fundamentalsAnalysis,
				bullishResearch,
				bearishResearch,
				batchRecentCloses,
				batchQuotes,
				memoryCases,
				candleSummaries,
				predictionMarketSignals,
				batchPositions,
				allDecisions, // Pass prior batch decisions for context
			);

			log.info(
				{
					cycleId,
					batchIndex: i + 1,
					promptLength: prompt.length,
					promptPreview: prompt.slice(0, 500),
				},
				"Trader batch prompt built",
			);
			log.debug({ cycleId, batchIndex: i + 1, fullPrompt: prompt }, "Full trader prompt");

			// Use multi-step execution: step 0 enables tools for data gathering,
			// subsequent steps use structured output for the decision plan.
			// This is required because Gemini doesn't support tools + structured output simultaneously.
			const stream = await trader.stream(prompt, {
				prepareStep: async ({ stepNumber }) => {
					if (stepNumber === 0) {
						// Step 0: Enable tools for data gathering
						log.debug({ cycleId, batchIndex: i + 1, stepNumber }, "Trader step 0: enabling tools");
						return {
							model: getModelId(),
							tools: {
								optionChain,
								getGreeks,
								getRecentDecisions,
								getEnrichedPortfolioState,
								getPredictionSignals,
							},
							toolChoice: "auto",
						};
					}
					// Step 1+: Disable tools, enable structured output
					log.debug(
						{ cycleId, batchIndex: i + 1, stepNumber },
						"Trader step 1+: structured output mode",
					);
					return {
						model: getModelId(),
						tools: undefined,
						structuredOutput: {
							schema: DecisionPlanSchema,
						},
					};
				},
				abortSignal: AbortSignal.timeout(600_000), // 10 min per batch
			});

			// Consume the stream and get the final structured result
			let toolCallCount = 0;
			const toolsUsed: string[] = [];
			for await (const chunk of stream.fullStream) {
				if (chunk.type === "tool-call") {
					toolCallCount++;
					const toolName = chunk.payload.toolName;
					if (!toolsUsed.includes(toolName)) {
						toolsUsed.push(toolName);
					}
					log.debug(
						{
							cycleId,
							batchIndex: i + 1,
							toolName,
							toolCallId: chunk.payload.toolCallId,
						},
						"Trader tool call",
					);
				}
			}

			if (toolCallCount > 0) {
				log.info(
					{ cycleId, batchIndex: i + 1, toolCallCount, toolsUsed },
					"Trader completed tool calls for options data",
				);
			}

			const plan = await stream.object;
			if (
				plan &&
				typeof plan === "object" &&
				"decisions" in plan &&
				Array.isArray((plan as Record<string, unknown>).decisions)
			) {
				const validatedPlan = validateDecisionPlan(
					cycleId,
					plan as z.infer<typeof DecisionPlanSchema>,
					warnings,
				);

				// Filter decisions to only include symbols in this batch (safety net)
				const batchDecisions = validatedPlan.decisions.filter((d) => batchSet.has(d.instrumentId));

				// Log if model generated off-batch decisions
				const offBatchCount = validatedPlan.decisions.length - batchDecisions.length;
				if (offBatchCount > 0) {
					const offBatchSymbols = validatedPlan.decisions
						.filter((d) => !batchSet.has(d.instrumentId))
						.map((d) => d.instrumentId);
					log.warn(
						{
							cycleId,
							batchIndex: i + 1,
							offBatchCount,
							offBatchSymbols,
						},
						"Filtered out decisions for symbols not in batch",
					);
				}

				allDecisions.push(...batchDecisions);
				if (validatedPlan.portfolioNotes) {
					portfolioNotes.push(validatedPlan.portfolioNotes);
				}
				log.debug(
					{ cycleId, batchIndex: i + 1, decisionCount: batchDecisions.length },
					"Trader batch complete",
				);
			} else {
				log.warn({ cycleId, batchIndex: i + 1 }, "Trader batch returned no structured output");
			}
		} catch (err) {
			const errorMsg = `Trader batch ${i + 1}/${batches.length} failed: ${formatError(err)}`;
			errors.push(errorMsg);
			log.error({ cycleId, batchIndex: i + 1, error: formatError(err) }, "Trader batch failed");
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

function buildTraderPrompt(
	cycleId: string,
	instruments: string[],
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	constraints: Constraints | undefined,
	newsAnalysis: z.infer<typeof SentimentAnalysisSchema>[],
	fundamentalsAnalysis: z.infer<typeof FundamentalsAnalysisSchema>[],
	bullishResearch: z.infer<typeof ResearchSchema>[],
	bearishResearch: z.infer<typeof ResearchSchema>[],
	recentCloses: RecentClose[],
	quotes: Record<string, z.infer<typeof QuoteDataSchema>>,
	memoryCases: z.infer<typeof MemoryCaseSchema>[],
	candleSummaries: z.infer<typeof CandleSummarySchema>[],
	predictionMarketSignals: z.infer<typeof PredictionMarketSignalsSchema> | undefined,
	positions: EnrichedPosition[],
	priorBatchDecisions: z.infer<typeof DecisionSchema>[],
): string {
	const globalSections: string[] = [];

	// Only include positions for batch symbols
	globalSections.push(xmlCurrentPositions(positions));
	// Only include quotes for batch symbols
	globalSections.push(xmlQuotes(quotes));
	globalSections.push(xmlRecentCloses(recentCloses));
	globalSections.push(xmlPredictionMarketSignals(predictionMarketSignals));

	if (constraints) {
		globalSections.push(`<risk_constraints>
  <per_instrument max_pct_equity="${(constraints.perInstrument.maxPctEquity * 100).toFixed(1)}%" max_notional="${constraints.perInstrument.maxNotional}" max_shares="${constraints.perInstrument.maxShares}" max_contracts="${constraints.perInstrument.maxContracts}" />
  <portfolio max_positions="${constraints.portfolio.maxPositions}" max_concentration="${(constraints.portfolio.maxConcentration * 100).toFixed(1)}%" max_gross_exposure="${(constraints.portfolio.maxGrossExposure * 100).toFixed(0)}%" max_net_exposure="${(constraints.portfolio.maxNetExposure * 100).toFixed(0)}%" max_risk_per_trade="${(constraints.portfolio.maxRiskPerTrade * 100).toFixed(1)}%" max_drawdown="${(constraints.portfolio.maxDrawdown * 100).toFixed(0)}%" max_sector_exposure="${(constraints.portfolio.maxSectorExposure * 100).toFixed(0)}%" />
  <options max_delta="${constraints.options.maxDelta}" max_gamma="${constraints.options.maxGamma}" max_vega="${constraints.options.maxVega}" max_theta="${constraints.options.maxTheta}" />
</risk_constraints>`);
	}

	// Include prior batch decisions so trader can avoid concentration
	if (priorBatchDecisions.length > 0) {
		const priorDecisionsSummary = priorBatchDecisions
			.map(
				(d) =>
					`  <decision symbol="${d.instrumentId}" action="${d.action}" direction="${d.direction}" size="${d.size.value} ${d.size.unit}" confidence="${d.confidence.toFixed(2)}" />`,
			)
			.join("\n");
		globalSections.push(`<prior_batch_decisions note="Already decided this cycle - consider for concentration/correlation">
${priorDecisionsSummary}
</prior_batch_decisions>`);
	}

	const symbolSections = instruments.map((symbol) => {
		const bullish = bullishResearch.find((r) => r.instrument_id === symbol);
		const bearish = bearishResearch.find((r) => r.instrument_id === symbol);
		const regime = regimeLabels[symbol];
		const news = newsAnalysis.find((n) => n.instrument_id === symbol);
		const fundamentals = fundamentalsAnalysis.find((f) => f.instrument_id === symbol);
		const symbolMemory = memoryCases.filter((c) => c.symbol === symbol);
		const candle = candleSummaries.find((c) => c.symbol === symbol);

		const parts: string[] = [];
		if (regime)
			parts.push(
				`  <regime classification="${regime.regime}" confidence="${regime.confidence.toFixed(2)}" />`,
			);
		if (candle) parts.push(`  ${xmlCandleSummary(candle)}`);
		if (symbolMemory.length > 0) parts.push(`  ${xmlMemoryCases(symbolMemory, symbol)}`);
		if (news)
			parts.push(
				`  <sentiment overall="${news.overall_sentiment}" strength="${news.sentiment_strength}" />`,
			);
		if (fundamentals) {
			const fParts: string[] = [];
			if (fundamentals.fundamental_drivers.length > 0)
				fParts.push(`    <drivers>${fundamentals.fundamental_drivers.join(", ")}</drivers>`);
			if (fundamentals.fundamental_headwinds.length > 0)
				fParts.push(`    <headwinds>${fundamentals.fundamental_headwinds.join(", ")}</headwinds>`);
			fParts.push(`    <valuation>${fundamentals.valuation_context}</valuation>`);
			if (fundamentals.event_risk.length > 0)
				fParts.push(
					`    <event_risks>${fundamentals.event_risk.map((e) => `${e.event} (${e.date})`).join(", ")}</event_risks>`,
				);
			parts.push(`  <fundamentals>\n${fParts.join("\n")}\n  </fundamentals>`);
		}
		if (bullish) {
			const factors =
				bullish.supporting_factors.length > 0
					? `\n    <supporting_factors>${bullish.supporting_factors.map((f) => `${f.factor} (${f.source}: ${f.strength})`).join(", ")}</supporting_factors>`
					: "";
			parts.push(`  <bullish_thesis conviction="${bullish.conviction_level}">
    <thesis>${bullish.thesis}</thesis>${factors}
    <counterargument>${bullish.strongest_counterargument}</counterargument>
  </bullish_thesis>`);
		}
		if (bearish) {
			const factors =
				bearish.supporting_factors.length > 0
					? `\n    <supporting_factors>${bearish.supporting_factors.map((f) => `${f.factor} (${f.source}: ${f.strength})`).join(", ")}</supporting_factors>`
					: "";
			parts.push(`  <bearish_thesis conviction="${bearish.conviction_level}">
    <thesis>${bearish.thesis}</thesis>${factors}
    <counterargument>${bearish.strongest_counterargument}</counterargument>
  </bearish_thesis>`);
		}
		return `<instrument symbol="${symbol}">\n${parts.join("\n")}\n</instrument>`;
	});

	const allSections = [
		...globalSections.filter(Boolean),
		`<instruments>\n${symbolSections.join("\n")}\n</instruments>`,
	];

	return `Create a decision plan for cycle ${cycleId}.

IMPORTANT: Only generate decisions for these symbols: ${instruments.join(", ")}. Do NOT generate decisions for any other symbols.

${allSections.join("\n\n")}

<options_workflow>
IMPORTANT: For symbols with upcoming catalysts, high conviction, or elevated IV conditions, you MUST:
1. Call optionChain(underlying) to get available strikes and expirations
2. Call getGreeks(contractSymbol) to validate position Greeks before sizing
3. Set instrumentType to "OPTION" and use the OCC symbol as instrumentId (e.g., "AAPL250321C00250000")
4. Include the legs array for multi-leg strategies (spreads, iron condors)
5. Set netLimitPrice for the spread credit/debit

Options decisions do NOT require stopLoss - risk is managed via defined-risk structures and Greeks.
</options_workflow>

IMPORTANT: Every EQUITY BUY or SELL decision MUST include a stopLoss. Use current_market_prices to set realistic stop-loss and take-profit levels. Equity trades without stop-losses will be rejected.`;
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
