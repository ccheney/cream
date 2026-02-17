import type { z } from "zod";

import {
	xmlCandleSummary,
	xmlGlobalGrounding,
	xmlGroundingSources,
	xmlMemoryCases,
	xmlPredictionMarketSignals,
} from "../prompt-helpers.js";
import type {
	CandleSummarySchema,
	FundamentalsAnalysisSchema,
	GroundingSourceSchema,
	MemoryCaseSchema,
	PredictionMarketSignalsSchema,
	RegimeDataSchema,
	SentimentAnalysisSchema,
} from "../schemas.js";

type GlobalGrounding = { macro: string[]; events: string[] };

export function buildBullishPrompt(
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
	const symbolSections = instruments.map((symbol) =>
		buildBullishInstrumentSection(
			symbol,
			regimeLabels,
			newsAnalysis,
			fundamentalsAnalysis,
			memoryCases,
			candleSummaries,
		),
	);

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

export function buildBearishPrompt(
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
	const symbolSections = instruments.map((symbol) =>
		buildBearishInstrumentSection(
			symbol,
			regimeLabels,
			newsAnalysis,
			fundamentalsAnalysis,
			memoryCases,
			candleSummaries,
		),
	);

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

function buildBullishInstrumentSection(
	symbol: string,
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	newsAnalysis: z.infer<typeof SentimentAnalysisSchema>[] | undefined,
	fundamentalsAnalysis: z.infer<typeof FundamentalsAnalysisSchema>[] | undefined,
	memoryCases: z.infer<typeof MemoryCaseSchema>[],
	candleSummaries: z.infer<typeof CandleSummarySchema>[],
): string {
	const parts = buildInstrumentBaseParts(
		symbol,
		regimeLabels,
		newsAnalysis,
		memoryCases,
		candleSummaries,
	);
	const fundamentals = fundamentalsAnalysis?.find((item) => item.instrument_id === symbol);
	if (fundamentals) {
		if (fundamentals.fundamental_drivers.length > 0) {
			parts.push(`  <drivers>${fundamentals.fundamental_drivers.join(", ")}</drivers>`);
		}
		parts.push(`  <valuation>${fundamentals.valuation_context}</valuation>`);
	}
	return `<instrument symbol="${symbol}">\n${parts.join("\n")}\n</instrument>`;
}

function buildBearishInstrumentSection(
	symbol: string,
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	newsAnalysis: z.infer<typeof SentimentAnalysisSchema>[] | undefined,
	fundamentalsAnalysis: z.infer<typeof FundamentalsAnalysisSchema>[] | undefined,
	memoryCases: z.infer<typeof MemoryCaseSchema>[],
	candleSummaries: z.infer<typeof CandleSummarySchema>[],
): string {
	const parts = buildInstrumentBaseParts(
		symbol,
		regimeLabels,
		newsAnalysis,
		memoryCases,
		candleSummaries,
	);
	const fundamentals = fundamentalsAnalysis?.find((item) => item.instrument_id === symbol);
	if (fundamentals?.fundamental_headwinds.length) {
		parts.push(`  <headwinds>${fundamentals.fundamental_headwinds.join(", ")}</headwinds>`);
	}
	const eventRiskLine = buildEventRiskLine(fundamentals?.event_risk);
	if (eventRiskLine) parts.push(eventRiskLine);
	return `<instrument symbol="${symbol}">\n${parts.join("\n")}\n</instrument>`;
}

function buildInstrumentBaseParts(
	symbol: string,
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>,
	newsAnalysis: z.infer<typeof SentimentAnalysisSchema>[] | undefined,
	memoryCases: z.infer<typeof MemoryCaseSchema>[],
	candleSummaries: z.infer<typeof CandleSummarySchema>[],
): string[] {
	const parts: string[] = [];
	const regime = regimeLabels[symbol];
	const news = newsAnalysis?.find((item) => item.instrument_id === symbol);
	const candle = candleSummaries.find((item) => item.symbol === symbol);
	const symbolMemory = memoryCases.filter((item) => item.symbol === symbol);

	if (regime) {
		parts.push(`  <regime classification="${regime.regime}" confidence="${regime.confidence}" />`);
	}
	if (candle) parts.push(`  ${xmlCandleSummary(candle)}`);
	if (news) {
		parts.push(
			`  <sentiment overall="${news.overall_sentiment}" strength="${news.sentiment_strength}" />`,
		);
	}
	if (symbolMemory.length > 0) {
		parts.push(`  ${xmlMemoryCases(symbolMemory, symbol)}`);
	}
	return parts;
}

function buildEventRiskLine(
	eventRisk: z.infer<typeof FundamentalsAnalysisSchema>["event_risk"] | undefined,
): string | undefined {
	if (!eventRisk || eventRisk.length === 0) return undefined;
	const formatted = eventRisk.map((event) => `${event.event} (${event.date})`).join(", ");
	return `  <event_risks>${formatted}</event_risks>`;
}
