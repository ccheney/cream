/**
 * Shared prompt-building helpers for trading cycle steps.
 *
 * Provides XML-tag-based formatters used across analysts, debate,
 * trader, and consensus prompt construction.
 */

import type { z } from "zod";
import type {
	CandleSummarySchema,
	GroundingSourceSchema,
	MemoryCaseSchema,
	PredictionMarketSignalsSchema,
	QuoteDataSchema,
	RecentCloseSchema,
	RegimeDataSchema,
} from "./schemas.js";

type PredictionMarketSignals = z.infer<typeof PredictionMarketSignalsSchema>;
type RegimeData = z.infer<typeof RegimeDataSchema>;
type MemoryCase = z.infer<typeof MemoryCaseSchema>;
type CandleSummary = z.infer<typeof CandleSummarySchema>;
type GroundingSource = z.infer<typeof GroundingSourceSchema>;
type QuoteData = z.infer<typeof QuoteDataSchema>;
type RecentClose = z.infer<typeof RecentCloseSchema>;

export function xmlPredictionMarketSignals(signals: PredictionMarketSignals | undefined): string {
	if (!signals) return "";
	const lines: string[] = [];
	if (signals.fedCutProbability != null)
		lines.push(
			`  <fed_cut_probability>${(signals.fedCutProbability * 100).toFixed(0)}%</fed_cut_probability>`,
		);
	if (signals.fedHikeProbability != null)
		lines.push(
			`  <fed_hike_probability>${(signals.fedHikeProbability * 100).toFixed(0)}%</fed_hike_probability>`,
		);
	if (signals.recessionProbability12m != null)
		lines.push(
			`  <recession_probability_12m>${(signals.recessionProbability12m * 100).toFixed(0)}%</recession_probability_12m>`,
		);
	if (signals.macroUncertaintyIndex != null)
		lines.push(
			`  <macro_uncertainty_index>${signals.macroUncertaintyIndex.toFixed(2)}</macro_uncertainty_index>`,
		);
	if (lines.length === 0) return "";
	return `<prediction_market_signals>\n${lines.join("\n")}\n</prediction_market_signals>`;
}

export function xmlRegimes(regimeLabels: Record<string, RegimeData>): string {
	const entries = Object.entries(regimeLabels);
	if (entries.length === 0) return "";
	const lines = entries.map(
		([symbol, r]) =>
			`  <regime symbol="${symbol}" classification="${r.regime}" confidence="${r.confidence.toFixed(2)}" />`,
	);
	return `<market_regimes>\n${lines.join("\n")}\n</market_regimes>`;
}

export function xmlGlobalGrounding(
	global: { macro: string[]; events: string[] } | undefined,
): string {
	if (!global) return "";
	const parts: string[] = [];
	if (global.macro.length > 0) {
		parts.push(
			`  <macro_context>\n${global.macro.map((m) => `    <item>${m}</item>`).join("\n")}\n  </macro_context>`,
		);
	}
	if (global.events.length > 0) {
		parts.push(
			`  <upcoming_events>\n${global.events.map((e) => `    <event>${e}</event>`).join("\n")}\n  </upcoming_events>`,
		);
	}
	if (parts.length === 0) return "";
	return `<global_grounding>\n${parts.join("\n")}\n</global_grounding>`;
}

export function xmlMemoryCases(cases: MemoryCase[], symbol?: string): string {
	const relevant = symbol ? cases.filter((c) => c.symbol === symbol) : cases;
	if (relevant.length === 0) return "";
	const lines = relevant.map(
		(c) =>
			`  <case id="${c.caseId}" symbol="${c.symbol}" action="${c.action}" regime="${c.regime}" similarity="${c.similarity.toFixed(2)}">${c.rationale}</case>`,
	);
	return `<historical_precedents>\n${lines.join("\n")}\n</historical_precedents>`;
}

export function xmlCandleSummary(candle: CandleSummary): string {
	return `<price_action last_close="${candle.lastClose.toFixed(2)}" high_20="${candle.high20.toFixed(2)}" low_20="${candle.low20.toFixed(2)}" avg_volume_20="${candle.avgVolume20.toLocaleString()}" trend="${candle.trendDirection}" />`;
}

export function xmlGroundingSources(sources: GroundingSource[]): string {
	if (sources.length === 0) return "";
	const lines = sources
		.slice(0, 10)
		.map((s) => `  <source title="${s.title}" url="${s.url}" relevance="${s.relevance}" />`);
	return `<grounding_sources>\n${lines.join("\n")}\n</grounding_sources>`;
}

export function xmlQuotes(quotes: Record<string, QuoteData>): string {
	const entries = Object.entries(quotes);
	if (entries.length === 0) return "";
	const lines = entries.map(([symbol, q]) => {
		const mid = (q.bid + q.ask) / 2;
		return `  <quote symbol="${symbol}" bid="${q.bid.toFixed(2)}" ask="${q.ask.toFixed(2)}" mid="${mid.toFixed(2)}" />`;
	});
	return `<current_market_prices>\n${lines.join("\n")}\n</current_market_prices>`;
}

export function xmlRecentCloses(closes: RecentClose[]): string {
	if (closes.length === 0) return "";
	const lines = closes.map((c) => {
		const reason = c.closeReason ?? c.rationale ?? "N/A";
		return `  <closed_position symbol="${c.symbol}" closed_at="${c.closedAt}" reason="${reason}" cooldown_until="${c.cooldownUntil ?? "unknown"}" />`;
	});
	return `<recent_closes_cooldown>\n${lines.join("\n")}\n</recent_closes_cooldown>`;
}
