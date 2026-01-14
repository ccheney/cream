/**
 * Outcome Calculations
 *
 * Core calculation functions for trade returns, P&L, slippage, and metrics.
 */

import type { CompletedTrade, OutcomeFlag, OutcomeMetrics, OutcomeScoringConfig } from "./types.js";

/**
 * Calculate realized return percentage.
 */
export function calculateRealizedReturn(trade: CompletedTrade): number {
	const { entryPrice, exitPrice, direction } = trade;

	if (direction === "LONG") {
		return ((exitPrice - entryPrice) / entryPrice) * 100;
	}
	return ((entryPrice - exitPrice) / entryPrice) * 100;
}

/**
 * Calculate realized P&L in dollars.
 */
export function calculateRealizedPnL(trade: CompletedTrade): number {
	const { entryPrice, exitPrice, quantity, direction } = trade;

	if (direction === "LONG") {
		return (exitPrice - entryPrice) * quantity;
	}
	return (entryPrice - exitPrice) * quantity;
}

/**
 * Calculate holding duration in hours.
 */
export function calculateHoldingDuration(trade: CompletedTrade): number {
	const entry = new Date(trade.entryTime);
	const exit = new Date(trade.exitTime);
	const durationMs = exit.getTime() - entry.getTime();
	return durationMs / (1000 * 60 * 60);
}

/**
 * Calculate entry slippage percentage.
 */
export function calculateEntrySlippage(trade: CompletedTrade): number {
	const { entryPrice, expectedEntryPrice, direction } = trade;

	if (direction === "LONG") {
		return ((entryPrice - expectedEntryPrice) / expectedEntryPrice) * 100;
	}
	return ((expectedEntryPrice - entryPrice) / expectedEntryPrice) * 100;
}

/**
 * Calculate exit slippage percentage.
 */
export function calculateExitSlippage(trade: CompletedTrade): number {
	const { exitPrice, expectedExitPrice, direction } = trade;

	if (direction === "LONG") {
		return ((expectedExitPrice - exitPrice) / expectedExitPrice) * 100;
	}
	return ((exitPrice - expectedExitPrice) / expectedExitPrice) * 100;
}

/**
 * Calculate detailed outcome metrics.
 */
export function calculateMetrics(
	trade: CompletedTrade,
	config: OutcomeScoringConfig,
	flags: OutcomeFlag[]
): OutcomeMetrics {
	const entrySlippagePct = calculateEntrySlippage(trade);
	const exitSlippagePct = calculateExitSlippage(trade);
	const totalSlippagePct = entrySlippagePct + exitSlippagePct;

	if (Math.abs(totalSlippagePct) > config.slippageWarningThreshold) {
		flags.push({
			type: "NEGATIVE",
			code: "HIGH_SLIPPAGE",
			message: `Total slippage ${totalSlippagePct.toFixed(2)}% exceeds threshold`,
		});
	}

	const hitStopLoss = trade.exitReason === "STOP_LOSS" || trade.exitReason === "TRAILING_STOP";
	const hitTakeProfit = trade.exitReason === "TAKE_PROFIT";

	let achievedRiskRewardRatio: number | undefined;
	if (trade.stopLossPrice && trade.expectedExitPrice) {
		const plannedRisk = Math.abs(trade.entryPrice - trade.stopLossPrice);
		const actualReturn = Math.abs(trade.exitPrice - trade.entryPrice);

		if (plannedRisk > 0) {
			const achievedReturnInR = actualReturn / plannedRisk;
			const realizedReturn = calculateRealizedReturn(trade);
			achievedRiskRewardRatio = realizedReturn >= 0 ? achievedReturnInR : -achievedReturnInR;
		}
	}

	return {
		entrySlippagePct,
		exitSlippagePct,
		totalSlippagePct,
		achievedRiskRewardRatio,
		hitStopLoss,
		hitTakeProfit,
	};
}
