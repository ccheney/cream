/**
 * Quality Assessment Functions for Corrective Retrieval
 *
 * Functions for evaluating retrieval quality and determining if correction is needed.
 */

import type { RetrievalResult, RRFResult } from "../rrf.js";
import {
  DEFAULT_QUALITY_THRESHOLDS,
  type QualityAssessment,
  type QualityThresholds,
} from "./types.js";

/**
 * Calculate the average score of retrieval results.
 *
 * @param results - Retrieval results
 * @returns Average score (0 if empty)
 */
export function calculateAvgScore<T>(results: RetrievalResult<T>[]): number {
  if (results.length === 0) {
    return 0;
  }
  const sum = results.reduce((acc, r) => acc + r.score, 0);
  return sum / results.length;
}

/**
 * Calculate diversity score (standard deviation of scores).
 *
 * Higher diversity means results have varied relevance scores,
 * indicating a good mix of highly relevant and somewhat relevant results.
 * Low diversity may indicate duplicates or overly narrow retrieval.
 *
 * @param results - Retrieval results
 * @returns Standard deviation of scores (0 if < 2 results)
 */
export function calculateDiversityScore<T>(results: RetrievalResult<T>[]): number {
  if (results.length < 2) {
    return 0;
  }

  const avg = calculateAvgScore(results);
  const squaredDiffs = results.map((r) => (r.score - avg) ** 2);
  const variance = squaredDiffs.reduce((acc, d) => acc + d, 0) / results.length;

  return Math.sqrt(variance);
}

/**
 * Calculate coverage score (fraction of expected results obtained).
 *
 * @param resultCount - Number of results obtained
 * @param expectedCount - Expected number of results
 * @returns Coverage score (0-1, capped at 1)
 */
export function calculateCoverageScore(resultCount: number, expectedCount: number): number {
  if (expectedCount <= 0) {
    return 1;
  }
  return Math.min(1, resultCount / expectedCount);
}

/**
 * Assess the quality of retrieval results.
 *
 * @param results - Retrieval results to assess
 * @param thresholds - Quality thresholds
 * @returns Quality assessment
 */
export function assessRetrievalQuality<T>(
  results: RetrievalResult<T>[],
  thresholds: QualityThresholds = DEFAULT_QUALITY_THRESHOLDS
): QualityAssessment {
  const avgScore = calculateAvgScore(results);
  const diversityScore = calculateDiversityScore(results);
  const coverageScore = calculateCoverageScore(results.length, thresholds.expectedResultCount);

  const correctionReasons: string[] = [];

  if (avgScore < thresholds.minAvgScore) {
    correctionReasons.push(
      `Average score ${avgScore.toFixed(3)} below threshold ${thresholds.minAvgScore}`
    );
  }

  if (results.length < thresholds.minResultCount) {
    correctionReasons.push(
      `Result count ${results.length} below minimum ${thresholds.minResultCount}`
    );
  }

  if (results.length >= 2 && diversityScore < thresholds.minDiversityScore) {
    correctionReasons.push(
      `Diversity score ${diversityScore.toFixed(3)} below threshold ${thresholds.minDiversityScore}`
    );
  }

  if (coverageScore < thresholds.minCoverageScore) {
    correctionReasons.push(
      `Coverage score ${coverageScore.toFixed(3)} below threshold ${thresholds.minCoverageScore}`
    );
  }

  // Calculate overall score (weighted average)
  const weights = { avg: 0.4, diversity: 0.2, coverage: 0.4 };
  const overallScore =
    weights.avg * avgScore +
    weights.diversity * Math.min(1, diversityScore * 2) + // Scale diversity to [0, 1]
    weights.coverage * coverageScore;

  return {
    overallScore,
    avgScore,
    resultCount: results.length,
    diversityScore,
    coverageScore,
    needsCorrection: correctionReasons.length > 0,
    correctionReasons,
  };
}

/**
 * Check if quality assessment indicates correction is needed.
 *
 * @param quality - Quality assessment
 * @returns True if correction should be attempted
 */
export function shouldCorrect(quality: QualityAssessment): boolean {
  return quality.needsCorrection;
}

/**
 * Quality assessment for RRF results.
 *
 * Converts RRF results to standard retrieval results for assessment.
 */
export function assessRRFQuality<T>(
  results: RRFResult<T>[],
  thresholds: QualityThresholds = DEFAULT_QUALITY_THRESHOLDS
): QualityAssessment {
  const retrievalResults: RetrievalResult<T>[] = results.map((r) => ({
    node: r.node,
    nodeId: r.nodeId,
    score: r.rrfScore,
  }));

  return assessRetrievalQuality(retrievalResults, thresholds);
}

/**
 * Check if RRF results need correction based on quality.
 */
export function shouldCorrectRRF<T>(
  results: RRFResult<T>[],
  thresholds: QualityThresholds = DEFAULT_QUALITY_THRESHOLDS
): boolean {
  const quality = assessRRFQuality(results, thresholds);
  return shouldCorrect(quality);
}
