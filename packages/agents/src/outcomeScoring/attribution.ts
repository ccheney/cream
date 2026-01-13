/**
 * Return Attribution
 *
 * Functions to decompose trade returns into market, alpha, and timing components.
 */

import type { CompletedTrade, OutcomeScoringConfig, ReturnAttribution } from "./types.js";

/**
 * Estimate timing contribution based on price execution vs expectations.
 */
export function estimateTimingContribution(trade: CompletedTrade): number {
  const entryDiff = (trade.expectedEntryPrice - trade.entryPrice) / trade.expectedEntryPrice;
  const exitDiff = (trade.exitPrice - trade.expectedExitPrice) / trade.expectedExitPrice;

  if (trade.direction === "LONG") {
    return (entryDiff + exitDiff) * 100;
  }
  return (-entryDiff - exitDiff) * 100;
}

/**
 * Calculate return attribution breakdown.
 */
export function calculateAttribution(
  trade: CompletedTrade,
  realizedReturn: number,
  config: OutcomeScoringConfig
): ReturnAttribution {
  const benchmarkReturn = trade.benchmarkReturn ?? 0;
  const marketContribution = config.assumedBeta * benchmarkReturn;
  const timingContribution = estimateTimingContribution(trade);
  const alphaContribution = realizedReturn - marketContribution - timingContribution;

  return {
    marketContribution,
    alphaContribution,
    timingContribution,
    totalReturn: realizedReturn,
  };
}
