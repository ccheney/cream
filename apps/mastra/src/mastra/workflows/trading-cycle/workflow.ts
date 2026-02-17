/**
 * Trading Cycle Workflow
 *
 * OODA loop implementation for hourly trading decisions.
 * Connects all steps: observe → orient → grounding → analysts → debate → trader → consensus → act
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { calculateVRP, classifyVRPLevel } from "@cream/indicators";
import { createWorkflow } from "@mastra/core/workflows";
import type { z } from "zod";
import {
	type CandleDataSchema,
	type CandleSummarySchema,
	WorkflowInputSchema,
	WorkflowResultSchema,
} from "./schemas.js";
import {
	actStep,
	analystsStep,
	consensusStep,
	debateStep,
	groundingStep,
	observeStep,
	orientStep,
	traderStep,
} from "./steps/index.js";

type Candle = z.infer<typeof CandleDataSchema>;
type CandleSummary = z.infer<typeof CandleSummarySchema>;

function buildCandleSummaries(
	candles: Record<string, Candle[]>,
	instruments: string[],
	indicators?: Record<string, number>,
): CandleSummary[] {
	return instruments
		.map((symbol) => buildSymbolCandleSummary(symbol, candles[symbol], indicators))
		.filter((summary): summary is CandleSummary => summary !== undefined);
}

function buildSymbolCandleSummary(
	symbol: string,
	bars: Candle[] | undefined,
	indicators?: Record<string, number>,
): CandleSummary | undefined {
	if (!bars || bars.length < 2) return undefined;
	const recent = bars.slice(-20);
	const lastBar = recent.at(-1);
	if (!lastBar) return undefined;
	const summary = buildBaseCandleSummary(symbol, recent, lastBar.close);
	const atmIV = indicators?.[`${symbol}:atmIV`];
	if (atmIV == null || bars.length < 21) {
		return summary;
	}
	return withVolatilityMetrics(summary, bars, atmIV);
}

function buildBaseCandleSummary(
	symbol: string,
	recent: Candle[],
	lastClose: number,
): CandleSummary {
	return {
		symbol,
		lastClose,
		high20: Math.max(...recent.map((c) => c.high)),
		low20: Math.min(...recent.map((c) => c.low)),
		avgVolume20: recent.reduce((sum, c) => sum + c.volume, 0) / recent.length,
		trendDirection: calculateTrendDirection(recent),
	};
}

function calculateTrendDirection(recent: Candle[]): "UP" | "DOWN" | "FLAT" {
	const midpoint = Math.ceil(recent.length / 2);
	const avgStart = averageClose(recent.slice(0, midpoint));
	const avgEnd = averageClose(recent.slice(midpoint));
	const pctChange = (avgEnd - avgStart) / avgStart;
	if (pctChange > 0.01) return "UP";
	if (pctChange < -0.01) return "DOWN";
	return "FLAT";
}

function averageClose(candles: Candle[]): number {
	return candles.reduce((sum, candle) => sum + candle.close, 0) / candles.length;
}

function withVolatilityMetrics(
	summary: CandleSummary,
	bars: Candle[],
	atmIV: number,
): CandleSummary {
	const result: CandleSummary = { ...summary };
	const vrpResult = calculateVRP(atmIV, bars, 20);
	if (vrpResult) {
		result.atmIV = atmIV;
		result.realizedVol20 = vrpResult.realizedVolatility;
		result.vrp = vrpResult.vrp;
		result.vrpLevel = classifyVRPLevel(vrpResult.vrp);
	}
	const ivRank = calculateIvRank(atmIV, bars);
	if (ivRank !== undefined) {
		result.ivRank = ivRank;
	}
	return result;
}

function calculateIvRank(atmIV: number, bars: Candle[]): number | undefined {
	if (bars.length < 41) return undefined;
	const rvWindows = buildRealizedVolWindows(bars);
	if (rvWindows.length < 5) return undefined;
	const low = Math.min(...rvWindows);
	const high = Math.max(...rvWindows);
	const range = high - low;
	return range > 0 ? Math.max(0, Math.min(100, ((atmIV - low) / range) * 100)) : 50;
}

function buildRealizedVolWindows(bars: Candle[]): number[] {
	const rvWindows: number[] = [];
	for (let i = 20; i <= bars.length; i++) {
		const windowBars = bars.slice(i - 21, i);
		const volatility = calculateAnnualizedVolatility(windowBars);
		if (volatility !== undefined) {
			rvWindows.push(volatility);
		}
	}
	return rvWindows;
}

function calculateAnnualizedVolatility(windowBars: Candle[]): number | undefined {
	const logReturns: number[] = [];
	for (let i = 1; i < windowBars.length; i++) {
		const prev = windowBars[i - 1];
		const curr = windowBars[i];
		if (prev && curr && prev.close > 0 && curr.close > 0) {
			logReturns.push(Math.log(curr.close / prev.close));
		}
	}
	if (logReturns.length < 2) return undefined;
	const mean = logReturns.reduce((sum, value) => sum + value, 0) / logReturns.length;
	const variance =
		logReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (logReturns.length - 1);
	return Math.sqrt(variance) * Math.sqrt(252);
}

export const tradingCycleWorkflow = createWorkflow({
	id: "trading-cycle",
	inputSchema: WorkflowInputSchema,
	outputSchema: WorkflowResultSchema,
})
	// Step 1: Observe - Fetch market snapshot
	.then(observeStep)
	// Map observe output to orient input
	.map(async ({ inputData }) => ({
		cycleId: inputData.cycleId,
		marketSnapshot: inputData.marketSnapshot,
		regimeLabels: inputData.regimeLabels,
		constraints: inputData.constraints,
	}))
	// Step 2: Orient - Load memory and compute regimes
	.then(orientStep)
	// Map orient output to grounding input
	.map(async ({ inputData }) => ({
		cycleId: inputData.cycleId,
		instruments: inputData.marketSnapshot.instruments,
	}))
	// Step 3: Grounding - Fetch real-time web context
	.then(groundingStep)
	// Map grounding output to analysts input (need to carry forward context)
	.map(async ({ inputData, getStepResult }) => {
		const orientResult = getStepResult(orientStep);
		return {
			cycleId: inputData.cycleId,
			instruments: orientResult?.marketSnapshot.instruments ?? [],
			regimeLabels: orientResult?.regimeLabels ?? {},
			groundingContext: {
				perSymbol: inputData.perSymbol,
				global: inputData.global,
			},
			predictionMarketSignals: orientResult?.predictionMarketSignals,
		};
	})
	// Step 4: Analysts - Run news and fundamentals analysts
	.then(analystsStep)
	// Map analysts output to debate input
	.map(async ({ inputData, getStepResult }) => {
		const orientResult = getStepResult(orientStep);
		const groundingResult = getStepResult(groundingStep);
		return {
			cycleId: inputData.cycleId,
			instruments: orientResult?.marketSnapshot.instruments ?? [],
			regimeLabels: orientResult?.regimeLabels ?? {},
			newsAnalysis: inputData.newsAnalysis,
			fundamentalsAnalysis: inputData.fundamentalsAnalysis,
			globalGrounding: groundingResult
				? { macro: groundingResult.global.macro, events: groundingResult.global.events }
				: undefined,
			memoryCases: orientResult?.memoryContext.relevantCases ?? [],
			candleSummaries: buildCandleSummaries(
				orientResult?.marketSnapshot.candles ?? {},
				orientResult?.marketSnapshot.instruments ?? [],
				orientResult?.marketSnapshot.indicators,
			),
			groundingSources: groundingResult?.sources ?? [],
			predictionMarketSignals: orientResult?.predictionMarketSignals,
		};
	})
	// Step 5: Debate - Run bullish and bearish researchers
	.then(debateStep)
	// Map debate output to trader input
	.map(async ({ inputData, getStepResult }) => {
		const observeResult = getStepResult(observeStep);
		const orientResult = getStepResult(orientStep);
		const analystsResult = getStepResult(analystsStep);
		return {
			cycleId: inputData.cycleId,
			instruments: orientResult?.marketSnapshot.instruments ?? [],
			regimeLabels: orientResult?.regimeLabels ?? {},
			constraints: orientResult?.constraints,
			newsAnalysis: analystsResult?.newsAnalysis,
			fundamentalsAnalysis: analystsResult?.fundamentalsAnalysis,
			bullishResearch: inputData.bullishResearch,
			bearishResearch: inputData.bearishResearch,
			recentCloses: observeResult?.recentCloses,
			quotes: observeResult?.marketSnapshot.quotes ?? {},
			memoryCases: orientResult?.memoryContext.relevantCases ?? [],
			candleSummaries: buildCandleSummaries(
				orientResult?.marketSnapshot.candles ?? {},
				orientResult?.marketSnapshot.instruments ?? [],
				orientResult?.marketSnapshot.indicators,
			),
			predictionMarketSignals: orientResult?.predictionMarketSignals,
			positions: observeResult?.positions ?? [],
		};
	})
	// Step 6: Trader - Synthesize decision plan
	.then(traderStep)
	// Map trader output to consensus input
	.map(async ({ inputData, getStepResult }) => {
		const observeResult = getStepResult(observeStep);
		const orientResult = getStepResult(orientStep);
		return {
			cycleId: inputData.cycleId,
			decisionPlan: inputData.decisionPlan,
			constraints: orientResult?.constraints,
			regimeLabels: orientResult?.regimeLabels ?? {},
			iterations: 0,
			quotes: observeResult?.marketSnapshot.quotes ?? {},
			recentCloses: observeResult?.recentCloses ?? [],
		};
	})
	// Step 7: Consensus - Run risk manager and critic
	.then(consensusStep)
	// Map consensus output to act input
	.map(async ({ inputData, getStepResult }) => {
		const traderResult = getStepResult(traderStep);
		return {
			cycleId: inputData.cycleId,
			approved: inputData.approved,
			iterations: inputData.iterations,
			decisionPlan: traderResult?.decisionPlan,
			riskApproval: inputData.riskApproval,
			criticApproval: inputData.criticApproval,
			mode: "LLM" as const,
		};
	})
	// Step 8: Act - Execute approved decisions
	.then(actStep)
	.commit();
