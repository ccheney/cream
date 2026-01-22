/**
 * Outcome Aggregation
 *
 * Functions to aggregate and summarize outcome scores across multiple trades.
 */

import type { OutcomeScore, OutcomeSummary, ReturnAttribution } from "./types.js";

const EMPTY_ATTRIBUTION: ReturnAttribution = {
	marketContribution: 0,
	alphaContribution: 0,
	timingContribution: 0,
	totalReturn: 0,
};

const EMPTY_SUMMARY: OutcomeSummary = {
	totalTrades: 0,
	winningTrades: 0,
	losingTrades: 0,
	winRate: 0,
	averageReturn: 0,
	totalReturn: 0,
	averageWinner: 0,
	averageLoser: 0,
	profitFactor: 0,
	averageOutcomeScore: 0,
	averageExecutionQuality: 0,
	averageHoldingHours: 0,
	attribution: EMPTY_ATTRIBUTION,
};

/**
 * Calculate summary statistics from outcome scores.
 */
export function getOutcomeSummary(scores: OutcomeScore[]): OutcomeSummary {
	if (scores.length === 0) {
		return EMPTY_SUMMARY;
	}

	const winners = scores.filter((s) => s.realizedReturn > 0);
	const losers = scores.filter((s) => s.realizedReturn < 0);

	const grossProfit = winners.reduce((sum, s) => sum + s.realizedReturn, 0);
	const grossLoss = Math.abs(losers.reduce((sum, s) => sum + s.realizedReturn, 0));

	const avgWinner = winners.length > 0 ? grossProfit / winners.length : 0;
	const avgLoser = losers.length > 0 ? grossLoss / losers.length : 0;

	const totalAttribution = scores.reduce(
		(acc, s) => ({
			marketContribution: acc.marketContribution + s.attribution.marketContribution,
			alphaContribution: acc.alphaContribution + s.attribution.alphaContribution,
			timingContribution: acc.timingContribution + s.attribution.timingContribution,
			totalReturn: acc.totalReturn + s.attribution.totalReturn,
		}),
		{ ...EMPTY_ATTRIBUTION },
	);

	const profitFactor = calculateProfitFactor(grossProfit, grossLoss);

	return {
		totalTrades: scores.length,
		winningTrades: winners.length,
		losingTrades: losers.length,
		winRate: winners.length / scores.length,
		averageReturn: scores.reduce((sum, s) => sum + s.realizedReturn, 0) / scores.length,
		totalReturn: scores.reduce((sum, s) => sum + s.realizedReturn, 0),
		averageWinner: avgWinner,
		averageLoser: avgLoser,
		profitFactor,
		averageOutcomeScore: scores.reduce((sum, s) => sum + s.outcomeScore, 0) / scores.length,
		averageExecutionQuality: scores.reduce((sum, s) => sum + s.executionQuality, 0) / scores.length,
		averageHoldingHours: scores.reduce((sum, s) => sum + s.holdingDurationHours, 0) / scores.length,
		attribution: totalAttribution,
	};
}

function calculateProfitFactor(grossProfit: number, grossLoss: number): number {
	if (grossLoss > 0) {
		return grossProfit / grossLoss;
	}
	if (grossProfit > 0) {
		return Infinity;
	}
	return 0;
}
