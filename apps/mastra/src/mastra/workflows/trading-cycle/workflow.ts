/**
 * Trading Cycle Workflow
 *
 * OODA loop implementation for hourly trading decisions.
 * Connects all steps: observe → orient → grounding → analysts → debate → trader → consensus → act
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { createWorkflow } from "@mastra/core/workflows";
import type { z } from "zod";
import { type CandleDataSchema, WorkflowInputSchema, WorkflowResultSchema } from "./schemas.js";

type Candle = z.infer<typeof CandleDataSchema>;

function buildCandleSummaries(
	candles: Record<string, Candle[]>,
	instruments: string[],
): {
	symbol: string;
	lastClose: number;
	high20: number;
	low20: number;
	avgVolume20: number;
	trendDirection: "UP" | "DOWN" | "FLAT";
}[] {
	return instruments.flatMap((symbol) => {
		const bars = candles[symbol];
		if (!bars || bars.length < 2) return [];
		const recent = bars.slice(-20);
		const lastBar = recent.at(-1);
		if (!lastBar) return [];
		const lastClose = lastBar.close;
		const high20 = Math.max(...recent.map((c) => c.high));
		const low20 = Math.min(...recent.map((c) => c.low));
		const avgVolume20 = recent.reduce((sum, c) => sum + c.volume, 0) / recent.length;
		const smaStart = recent.slice(0, Math.ceil(recent.length / 2));
		const smaEnd = recent.slice(Math.ceil(recent.length / 2));
		const avgStart = smaStart.reduce((s, c) => s + c.close, 0) / smaStart.length;
		const avgEnd = smaEnd.reduce((s, c) => s + c.close, 0) / smaEnd.length;
		const pctChange = (avgEnd - avgStart) / avgStart;
		const trendDirection =
			pctChange > 0.01
				? ("UP" as const)
				: pctChange < -0.01
					? ("DOWN" as const)
					: ("FLAT" as const);
		return [{ symbol, lastClose, high20, low20, avgVolume20, trendDirection }];
	});
}

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
