/**
 * CBR Quality Metrics
 *
 * Calculate quality metrics for CBR retrieval results.
 *
 * @module
 */

import type { CBRQualityMetrics, CBRRetrievalResult } from "./types.js";

/**
 * Calculate quality metrics for a CBR retrieval result.
 */
export function calculateCBRQuality(result: CBRRetrievalResult, minCases = 5): CBRQualityMetrics {
  const { cases, statistics } = result;

  const similarities = cases
    .filter((c): c is typeof c & { similarityScore: number } => c.similarityScore !== undefined)
    .map((c) => c.similarityScore);
  const avgSimilarity =
    similarities.length > 0 ? similarities.reduce((a, b) => a + b, 0) / similarities.length : 0;

  const uniqueRegimes = new Set(cases.filter((c) => c.regime).map((c) => c.regime));
  const regimeDiversity = cases.length > 0 ? uniqueRegimes.size / Math.min(cases.length, 5) : 0;

  const historicalWinRate = statistics.winRate ?? 0;

  const qualityScore =
    avgSimilarity * 0.4 +
    (cases.length >= minCases ? 0.3 : (cases.length / minCases) * 0.3) +
    regimeDiversity * 0.15 +
    historicalWinRate * 0.15;

  return {
    avgSimilarity,
    caseCount: cases.length,
    sufficientCases: cases.length >= minCases,
    regimeDiversity,
    historicalWinRate,
    qualityScore,
  };
}
