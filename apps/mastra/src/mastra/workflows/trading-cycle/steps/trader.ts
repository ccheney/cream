/**
 * Trader Step
 *
 * Sixth step in the OODA trading cycle. Synthesizes all analysis
 * (bullish/bearish research, news, fundamentals) into a decision plan.
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { createNodeLogger } from "@cream/logger";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { trader } from "../../../agents/index.js";

const log = createNodeLogger({ service: "trading-cycle:trader" });

import { getModelId } from "@cream/domain";
import {
	xmlCandleSummary,
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
});

const TraderOutputSchema = z.object({
	cycleId: z.string(),
	decisionPlan: DecisionPlanSchema,
	errors: z.array(z.string()),
	warnings: z.array(z.string()),
	metrics: z.object({
		totalMs: z.number(),
	}),
});

// ============================================
// Step Definition
// ============================================

export const traderStep = createStep({
	id: "trader-synthesize",
	description: "Synthesize research into decision plan",
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
		} = inputData;
		const errors: string[] = [];
		const warnings: string[] = [];

		log.info(
			{
				cycleId,
				symbolCount: instruments.length,
				bullishResearchCount: bullishResearch.length,
				bearishResearchCount: bearishResearch.length,
				hasConstraints: !!constraints,
				recentClosesCount: recentCloses?.length ?? 0,
			},
			"Starting trader step",
		);

		const decisionPlan = await runTraderAgent(
			cycleId,
			instruments,
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
			},
		};
	},
});

// ============================================
// Helper Functions
// ============================================

async function runTraderAgent(
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
	errors: string[],
	warnings: string[],
): Promise<z.infer<typeof DecisionPlanSchema>> {
	const emptyPlan: z.infer<typeof DecisionPlanSchema> = {
		cycleId,
		timestamp: new Date().toISOString(),
		decisions: [],
		portfolioNotes: "No decisions generated",
	};

	try {
		const prompt = buildTraderPrompt(
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
		);
		log.debug({ cycleId, promptLength: prompt.length }, "Calling trader agent");
		const response = await trader.generate(prompt, {
			structuredOutput: {
				schema: DecisionPlanSchema,
				model: getModelId(),
			},
		});

		const plan = response.object;
		if (!plan) {
			log.warn({ cycleId }, "Trader agent returned no structured output, using empty plan");
			return emptyPlan;
		}

		const validatedPlan = validateDecisionPlan(cycleId, plan, warnings);
		log.debug(
			{ cycleId, decisionCount: validatedPlan.decisions.length },
			"Trader agent returned plan",
		);
		return validatedPlan;
	} catch (err) {
		const errorMsg = `Trader agent failed: ${formatError(err)}`;
		errors.push(errorMsg);
		log.error({ cycleId, error: formatError(err) }, "Trader agent LLM call failed");
		return emptyPlan;
	}
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
): string {
	const globalSections: string[] = [];

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

${allSections.join("\n\n")}

IMPORTANT: Every BUY or SELL decision MUST include a stopLoss. Use current_market_prices to set realistic stop-loss and take-profit levels. Trades without stop-losses will be rejected.`;
}

function validateDecisionPlan(
	cycleId: string,
	plan: z.infer<typeof DecisionPlanSchema>,
	warnings: string[],
): z.infer<typeof DecisionPlanSchema> {
	const validatedDecisions: z.infer<typeof DecisionSchema>[] = [];

	for (const d of plan.decisions) {
		if (d.stopLoss) {
			if (!Number.isFinite(d.stopLoss.price) || d.stopLoss.price <= 0) {
				const errMsg = `Decision ${d.decisionId} (${d.instrumentId}) has invalid stop-loss price: ${d.stopLoss.price}. Must be a positive number.`;
				warnings.push(errMsg);
				log.error(
					{
						cycleId,
						decisionId: d.decisionId,
						instrumentId: d.instrumentId,
						action: d.action,
						rawPrice: d.stopLoss.price,
					},
					"Invalid stop-loss price - must be positive",
				);
				if (d.action === "BUY" || d.action === "SELL") continue;
			}
		}

		if (
			(d.action === "BUY" || d.action === "SELL") &&
			!d.stopLoss &&
			d.instrumentType !== "OPTION"
		) {
			const errMsg = `Decision ${d.decisionId} (${d.instrumentId}) REJECTED: missing stop-loss for ${d.action} action`;
			warnings.push(errMsg);
			log.error(
				{ cycleId, decisionId: d.decisionId, instrumentId: d.instrumentId, action: d.action },
				"REJECTING trade - missing stop-loss for actionable trade",
			);
			continue;
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
