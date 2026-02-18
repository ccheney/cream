import type { z } from "zod";

import {
	xmlCandleSummary,
	xmlCurrentPositions,
	xmlMemoryCases,
	xmlPredictionMarketSignals,
	xmlQuotes,
	xmlRecentCloses,
} from "../prompt-helpers.js";
import type {
	CandleSummarySchema,
	Constraints,
	DecisionSchema,
	EnrichedPosition,
	FundamentalsAnalysisSchema,
	MemoryCaseSchema,
	PredictionMarketSignalsSchema,
	QuoteDataSchema,
	RecentClose,
	RegimeDataSchema,
	ResearchSchema,
	SentimentAnalysisSchema,
} from "../schemas.js";

type TraderSymbolContext = {
	bullish: z.infer<typeof ResearchSchema> | undefined;
	bearish: z.infer<typeof ResearchSchema> | undefined;
	regime: z.infer<typeof RegimeDataSchema> | undefined;
	news: z.infer<typeof SentimentAnalysisSchema> | undefined;
	fundamentals: z.infer<typeof FundamentalsAnalysisSchema> | undefined;
	memory: z.infer<typeof MemoryCaseSchema>[];
	candle: z.infer<typeof CandleSummarySchema> | undefined;
};

export function buildTraderPrompt(
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
	const globalSections = buildTraderGlobalSections(
		constraints,
		recentCloses,
		quotes,
		predictionMarketSignals,
		positions,
		priorBatchDecisions,
	);
	const symbolSections = instruments.map((symbol) =>
		buildTraderInstrumentSection(
			symbol,
			getTraderSymbolContext(
				symbol,
				regimeLabels,
				newsAnalysis,
				fundamentalsAnalysis,
				bullishResearch,
				bearishResearch,
				memoryCases,
				candleSummaries,
			),
		),
	);
	const allSections = [
		...globalSections,
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

IMPORTANT: Every EQUITY decision MUST include a stopLoss — including HOLD and CLOSE actions (to maintain/update protective stop levels on existing positions). Use current_market_prices to set realistic stop-loss and take-profit levels. Equity decisions without stop-losses will be REJECTED.`;
}

function buildTraderGlobalSections(
	constraints: Constraints | undefined,
	recentCloses: RecentClose[],
	quotes: Record<string, z.infer<typeof QuoteDataSchema>>,
	predictionMarketSignals: z.infer<typeof PredictionMarketSignalsSchema> | undefined,
	positions: EnrichedPosition[],
	priorBatchDecisions: z.infer<typeof DecisionSchema>[],
): string[] {
	return [
		xmlCurrentPositions(positions),
		xmlQuotes(quotes),
		xmlRecentCloses(recentCloses),
		xmlPredictionMarketSignals(predictionMarketSignals),
		buildRiskConstraintsSection(constraints),
		buildPriorBatchSection(priorBatchDecisions),
	].filter((s): s is string => Boolean(s));
}

function buildRiskConstraintsSection(constraints: Constraints | undefined): string | undefined {
	if (!constraints) return undefined;
	return `<risk_constraints>
  <per_instrument max_pct_equity="${(constraints.perInstrument.maxPctEquity * 100).toFixed(1)}%" max_notional="${constraints.perInstrument.maxNotional}" max_shares="${constraints.perInstrument.maxShares}" max_contracts="${constraints.perInstrument.maxContracts}" />
  <portfolio max_positions="${constraints.portfolio.maxPositions}" max_concentration="${(constraints.portfolio.maxConcentration * 100).toFixed(1)}%" max_gross_exposure="${(constraints.portfolio.maxGrossExposure * 100).toFixed(0)}%" max_net_exposure="${(constraints.portfolio.maxNetExposure * 100).toFixed(0)}%" max_risk_per_trade="${(constraints.portfolio.maxRiskPerTrade * 100).toFixed(1)}%" max_drawdown="${(constraints.portfolio.maxDrawdown * 100).toFixed(0)}%" max_sector_exposure="${(constraints.portfolio.maxSectorExposure * 100).toFixed(0)}%" />
  <options max_delta="${constraints.options.maxDelta}" max_gamma="${constraints.options.maxGamma}" max_vega="${constraints.options.maxVega}" max_theta="${constraints.options.maxTheta}" />
</risk_constraints>`;
}

function buildPriorBatchSection(
	priorBatchDecisions: z.infer<typeof DecisionSchema>[],
): string | undefined {
	if (priorBatchDecisions.length === 0) return undefined;
	const priorDecisionsSummary = priorBatchDecisions
		.map(
			(decision) =>
				`  <decision symbol="${decision.instrumentId}" action="${decision.action}" direction="${decision.direction}" size="${decision.size.value} ${decision.size.unit}" confidence="${decision.confidence.toFixed(2)}" />`,
		)
		.join("\n");
	return `<prior_batch_decisions note="Already decided this cycle - consider for concentration/correlation">
${priorDecisionsSummary}
</prior_batch_decisions>`;
}

function getTraderSymbolContext(
	symbol: string,
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	newsAnalysis: z.infer<typeof SentimentAnalysisSchema>[],
	fundamentalsAnalysis: z.infer<typeof FundamentalsAnalysisSchema>[],
	bullishResearch: z.infer<typeof ResearchSchema>[],
	bearishResearch: z.infer<typeof ResearchSchema>[],
	memoryCases: z.infer<typeof MemoryCaseSchema>[],
	candleSummaries: z.infer<typeof CandleSummarySchema>[],
): TraderSymbolContext {
	return {
		bullish: bullishResearch.find((item) => item.instrument_id === symbol),
		bearish: bearishResearch.find((item) => item.instrument_id === symbol),
		regime: regimeLabels[symbol],
		news: newsAnalysis.find((item) => item.instrument_id === symbol),
		fundamentals: fundamentalsAnalysis.find((item) => item.instrument_id === symbol),
		memory: memoryCases.filter((item) => item.symbol === symbol),
		candle: candleSummaries.find((item) => item.symbol === symbol),
	};
}

function buildTraderInstrumentSection(symbol: string, context: TraderSymbolContext): string {
	const parts: string[] = [];
	appendRegimePart(parts, context.regime);
	appendCandlePart(parts, context.candle);
	appendMemoryPart(parts, symbol, context.memory);
	appendSentimentPart(parts, context.news);
	appendFundamentalsPart(parts, context.fundamentals);
	appendThesisPart(parts, "bullish", context.bullish);
	appendThesisPart(parts, "bearish", context.bearish);
	return `<instrument symbol="${symbol}">\n${parts.join("\n")}\n</instrument>`;
}

function appendRegimePart(
	parts: string[],
	regime: z.infer<typeof RegimeDataSchema> | undefined,
): void {
	if (!regime) return;
	parts.push(
		`  <regime classification="${regime.regime}" confidence="${regime.confidence.toFixed(2)}" />`,
	);
}

function appendCandlePart(
	parts: string[],
	candle: z.infer<typeof CandleSummarySchema> | undefined,
): void {
	if (!candle) return;
	parts.push(`  ${xmlCandleSummary(candle)}`);
}

function appendMemoryPart(
	parts: string[],
	symbol: string,
	memory: z.infer<typeof MemoryCaseSchema>[],
): void {
	if (memory.length === 0) return;
	parts.push(`  ${xmlMemoryCases(memory, symbol)}`);
}

function appendSentimentPart(
	parts: string[],
	news: z.infer<typeof SentimentAnalysisSchema> | undefined,
): void {
	if (!news) return;
	parts.push(
		`  <sentiment overall="${news.overall_sentiment}" strength="${news.sentiment_strength}" />`,
	);
}

function appendFundamentalsPart(
	parts: string[],
	fundamentals: z.infer<typeof FundamentalsAnalysisSchema> | undefined,
): void {
	if (!fundamentals) return;
	const fundamentalsParts: string[] = [];
	if (fundamentals.fundamental_drivers.length > 0) {
		fundamentalsParts.push(`    <drivers>${fundamentals.fundamental_drivers.join(", ")}</drivers>`);
	}
	if (fundamentals.fundamental_headwinds.length > 0) {
		fundamentalsParts.push(
			`    <headwinds>${fundamentals.fundamental_headwinds.join(", ")}</headwinds>`,
		);
	}
	fundamentalsParts.push(`    <valuation>${fundamentals.valuation_context}</valuation>`);
	if (fundamentals.event_risk.length > 0) {
		fundamentalsParts.push(
			`    <event_risks>${fundamentals.event_risk.map((event) => `${event.event} (${event.date})`).join(", ")}</event_risks>`,
		);
	}
	parts.push(`  <fundamentals>\n${fundamentalsParts.join("\n")}\n  </fundamentals>`);
}

function appendThesisPart(
	parts: string[],
	side: "bullish" | "bearish",
	research: z.infer<typeof ResearchSchema> | undefined,
): void {
	if (!research) return;
	const factors = formatSupportingFactors(research);
	parts.push(`  <${side}_thesis conviction="${research.conviction_level}">
    <thesis>${research.thesis}</thesis>${factors}
    <counterargument>${research.strongest_counterargument}</counterargument>
  </${side}_thesis>`);
}

function formatSupportingFactors(research: z.infer<typeof ResearchSchema>): string {
	if (research.supporting_factors.length === 0) return "";
	const formatted = research.supporting_factors
		.map((factor) => `${factor.factor} (${factor.source}: ${factor.strength})`)
		.join(", ");
	return `\n    <supporting_factors>${formatted}</supporting_factors>`;
}
