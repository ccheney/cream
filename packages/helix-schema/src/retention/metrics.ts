/**
 * Metrics Module
 *
 * Provides functions for calculating summary statistics
 * from forgetting decisions for monitoring and analysis.
 */

import type { ForgettingDecision, ForgettingMetrics } from "./types.js";

/**
 * Calculate metrics from forgetting decisions.
 *
 * @param decisions - Array of forgetting decisions
 * @returns Summary metrics
 */
export function calculateForgettingMetrics(decisions: ForgettingDecision[]): ForgettingMetrics {
  const finiteScores = decisions
    .map((d) => d.score)
    .filter((s) => Number.isFinite(s))
    .sort((a, b) => a - b);

  const avgScore =
    finiteScores.length > 0 ? finiteScores.reduce((sum, s) => sum + s, 0) / finiteScores.length : 0;

  const medianScore =
    finiteScores.length > 0 ? (finiteScores[Math.floor(finiteScores.length / 2)] ?? 0) : 0;

  const distribution = {
    infinite: decisions.filter((d) => !Number.isFinite(d.score)).length,
    high: decisions.filter((d) => Number.isFinite(d.score) && d.score >= 0.5).length,
    medium: decisions.filter((d) => Number.isFinite(d.score) && d.score >= 0.1 && d.score < 0.5)
      .length,
    low: decisions.filter((d) => Number.isFinite(d.score) && d.score >= 0.05 && d.score < 0.1)
      .length,
    veryLow: decisions.filter((d) => Number.isFinite(d.score) && d.score < 0.05).length,
  };

  return {
    totalNodes: decisions.length,
    complianceOverrideCount: decisions.filter((d) => d.breakdown.complianceOverride).length,
    summarizationCandidates: decisions.filter((d) => d.shouldSummarize && !d.shouldDelete).length,
    deletionCandidates: decisions.filter((d) => d.shouldDelete).length,
    avgRetentionScore: avgScore,
    medianRetentionScore: medianScore,
    scoreDistribution: distribution,
  };
}
