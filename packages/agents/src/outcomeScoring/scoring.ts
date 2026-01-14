/**
 * Overall Outcome Scoring
 *
 * Functions to calculate the overall outcome score combining return,
 * execution quality, and prediction accuracy.
 */

import type { DecisionQualityScore } from "../planScoring.js";

import type { CompletedTrade, OutcomeScoringConfig } from "./types.js";

/**
 * Calculate overall outcome score.
 *
 * Combines return score, execution quality, and prediction accuracy
 * using configured weights.
 */
export function calculateOverallScore(
	realizedReturn: number,
	executionQuality: number,
	planScore: DecisionQualityScore | undefined,
	trade: CompletedTrade,
	config: OutcomeScoringConfig
): number {
	const returnScore = normalizeReturnScore(realizedReturn);
	const predictionScore = calculatePredictionScore(planScore, realizedReturn, trade);

	const overall =
		returnScore * config.returnWeight +
		executionQuality * config.executionWeight +
		predictionScore * config.predictionWeight;

	return Math.round(overall);
}

/**
 * Normalize return to 0-100 scale.
 * Assumes +10% return = 100, 0% = 50, -10% = 0.
 */
function normalizeReturnScore(realizedReturn: number): number {
	return Math.max(0, Math.min(100, 50 + realizedReturn * 5));
}

/**
 * Calculate prediction accuracy score.
 */
function calculatePredictionScore(
	planScore: DecisionQualityScore | undefined,
	realizedReturn: number,
	trade: CompletedTrade
): number {
	if (!planScore) {
		return 50;
	}

	const predictedPositive = planScore.expectedValue.netExpectedValue > 0;
	const actualPositive = realizedReturn > 0;

	if (predictedPositive !== actualPositive) {
		return 30;
	}

	if (trade.exitReason === "TAKE_PROFIT" && predictedPositive) {
		return 90;
	}

	return 70;
}
