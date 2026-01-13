/**
 * Execution Quality Scoring
 *
 * Functions to evaluate trade execution quality based on slippage.
 */

import type { OutcomeMetrics } from "./types.js";

/**
 * Score execution quality based on slippage metrics.
 *
 * Returns a score from 0-100 where:
 * - 100 = perfect execution (zero slippage)
 * - Each 0.1% slippage reduces score by 10 points
 * - Positive slippage (better than expected) adds a bonus
 */
export function scoreExecution(metrics: OutcomeMetrics): number {
  const { totalSlippagePct } = metrics;
  const absSlippage = Math.abs(totalSlippagePct);

  const slippagePenalty = absSlippage * 100;
  const score = Math.max(0, 100 - slippagePenalty);

  if (totalSlippagePct < 0) {
    return Math.min(100, score + 10);
  }

  return score;
}
