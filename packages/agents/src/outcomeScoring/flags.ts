/**
 * Outcome Flags
 *
 * Functions to generate descriptive flags for trade outcomes.
 */

import type { CompletedTrade, OutcomeFlag, OutcomeMetrics } from "./types.js";

/**
 * Generate outcome-specific flags for a trade.
 */
export function generateOutcomeFlags(
	trade: CompletedTrade,
	realizedReturn: number,
	metrics: OutcomeMetrics,
	flags: OutcomeFlag[]
): void {
	addProfitabilityFlags(realizedReturn, metrics, flags);
	addMagnitudeFlags(realizedReturn, flags);
	addRiskRewardFlags(metrics, flags);
	addExitReasonFlags(trade, flags);
}

function addProfitabilityFlags(
	realizedReturn: number,
	metrics: OutcomeMetrics,
	flags: OutcomeFlag[]
): void {
	if (realizedReturn > 0) {
		flags.push({
			type: "POSITIVE",
			code: "PROFITABLE",
			message: `Trade profitable with ${realizedReturn.toFixed(2)}% return`,
		});

		if (metrics.hitTakeProfit) {
			flags.push({
				type: "POSITIVE",
				code: "HIT_TARGET",
				message: "Take profit target reached",
			});
		}
	}

	if (realizedReturn < 0) {
		flags.push({
			type: "NEGATIVE",
			code: "LOSS",
			message: `Trade lost ${Math.abs(realizedReturn).toFixed(2)}%`,
		});

		if (metrics.hitStopLoss) {
			flags.push({
				type: "NEUTRAL",
				code: "STOP_LOSS_WORKED",
				message: "Stop loss protected from larger loss",
			});
		}
	}
}

function addMagnitudeFlags(realizedReturn: number, flags: OutcomeFlag[]): void {
	if (realizedReturn > 5) {
		flags.push({
			type: "POSITIVE",
			code: "BIG_WINNER",
			message: `Exceptional trade with ${realizedReturn.toFixed(2)}% return`,
		});
	}

	if (realizedReturn < -5) {
		flags.push({
			type: "NEGATIVE",
			code: "BIG_LOSER",
			message: `Large loss of ${Math.abs(realizedReturn).toFixed(2)}%`,
		});
	}
}

function addRiskRewardFlags(metrics: OutcomeMetrics, flags: OutcomeFlag[]): void {
	if (metrics.achievedRiskRewardRatio === undefined) {
		return;
	}

	if (metrics.achievedRiskRewardRatio >= 2) {
		flags.push({
			type: "POSITIVE",
			code: "GOOD_RR_ACHIEVED",
			message: `Achieved ${metrics.achievedRiskRewardRatio.toFixed(2)}R`,
		});
	} else if (metrics.achievedRiskRewardRatio < 0) {
		flags.push({
			type: "NEGATIVE",
			code: "NEGATIVE_RR",
			message: `Lost ${Math.abs(metrics.achievedRiskRewardRatio).toFixed(2)}R`,
		});
	}
}

function addExitReasonFlags(trade: CompletedTrade, flags: OutcomeFlag[]): void {
	if (trade.exitReason === "TIME_EXIT") {
		flags.push({
			type: "NEUTRAL",
			code: "TIME_EXIT",
			message: "Position closed due to time limit",
		});
	}
}
