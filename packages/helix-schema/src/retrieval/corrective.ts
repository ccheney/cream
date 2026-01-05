/**
 * Corrective Retrieval for Low-Quality Results
 *
 * Implements a self-correcting retrieval strategy that broadens the search
 * when initial retrieval quality is below threshold.
 *
 * ## How It Works
 *
 * 1. Initial retrieval returns results
 * 2. Quality assessment evaluates: avg score, result count, diversity
 * 3. If quality < threshold, trigger correction:
 *    a. Broaden candidate pool (increase k)
 *    b. Lower similarity threshold
 *    c. Optional: Query expansion
 * 4. Corrected results replace initial results
 *
 * ## Quality Metrics
 *
 * - **Average Score**: Mean similarity/relevance of top results
 * - **Result Count**: Number of results returned
 * - **Diversity**: Variance in scores (low = all results similar)
 * - **Coverage**: Fraction of expected results obtained
 *
 * ## When to Correct
 *
 * - Avg similarity < 0.5 (results not relevant enough)
 * - Result count < 3 (too few results)
 * - Diversity score < 0.1 (all results too similar - possible duplicates)
 *
 * @see docs/plans/04-memory-helixdb.md - Retrieval Policies (Corrective Retrieval)
 */

import type { RetrievalResult, RRFResult } from "./rrf";

// ============================================
// Constants
// ============================================

/**
 * Default quality threshold for triggering correction
 */
export const DEFAULT_QUALITY_THRESHOLD = 0.5;

/**
 * Minimum results before considering correction
 */
export const DEFAULT_MIN_RESULTS = 3;

/**
 * Default diversity threshold (std dev of scores)
 */
export const DEFAULT_DIVERSITY_THRESHOLD = 0.1;

/**
 * Default broadening factor (how much to increase k)
 */
export const DEFAULT_BROADENING_FACTOR = 5;

/**
 * Maximum correction attempts before giving up
 */
export const MAX_CORRECTION_ATTEMPTS = 3;

/**
 * Threshold reduction per attempt
 */
export const THRESHOLD_REDUCTION_STEP = 0.1;

// ============================================
// Types
// ============================================

/**
 * Quality assessment result for retrieval
 */
export interface QualityAssessment {
  /** Overall quality score (0-1) */
  overallScore: number;

  /** Average similarity/relevance score of results */
  avgScore: number;

  /** Number of results returned */
  resultCount: number;

  /** Diversity score (std dev of scores, higher = more diverse) */
  diversityScore: number;

  /** Coverage score (resultCount / expectedCount) */
  coverageScore: number;

  /** Whether correction is needed */
  needsCorrection: boolean;

  /** Reasons for needing correction */
  correctionReasons: string[];
}

/**
 * Quality thresholds configuration
 */
export interface QualityThresholds {
  /** Minimum average score (default: 0.5) */
  minAvgScore: number;

  /** Minimum result count (default: 3) */
  minResultCount: number;

  /** Minimum diversity score (default: 0.1) */
  minDiversityScore: number;

  /** Minimum coverage score (default: 0.3) */
  minCoverageScore: number;

  /** Expected result count for coverage calculation (default: 10) */
  expectedResultCount: number;
}

/**
 * Default quality thresholds
 */
export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  minAvgScore: 0.5,
  minResultCount: 3,
  minDiversityScore: 0.1,
  minCoverageScore: 0.3,
  expectedResultCount: 10,
};

/**
 * Correction strategy type
 */
export type CorrectionStrategy = "broaden" | "lower_threshold" | "expand_query";

/**
 * Correction strategy configuration
 */
export interface CorrectionStrategyConfig {
  /** Strategy type */
  strategy: CorrectionStrategy;

  /** Broadening factor (for "broaden" strategy) */
  broadeningFactor?: number;

  /** Threshold reduction amount (for "lower_threshold" strategy) */
  thresholdReduction?: number;

  /** Query expansion terms (for "expand_query" strategy) */
  expansionTerms?: string[];
}

/**
 * Correction attempt result
 */
export interface CorrectionAttempt<T> {
  /** Attempt number (1-based) */
  attemptNumber: number;

  /** Strategy used */
  strategy: CorrectionStrategy;

  /** Parameters used */
  parameters: Record<string, unknown>;

  /** Results from this attempt */
  results: RetrievalResult<T>[];

  /** Quality assessment of these results */
  quality: QualityAssessment;

  /** Whether this attempt succeeded (quality above threshold) */
  succeeded: boolean;
}

/**
 * Corrective retrieval result
 */
export interface CorrectiveRetrievalResult<T> {
  /** Final results (corrected if needed) */
  results: RetrievalResult<T>[];

  /** Whether correction was applied */
  correctionApplied: boolean;

  /** Initial quality assessment */
  initialQuality: QualityAssessment;

  /** Final quality assessment */
  finalQuality: QualityAssessment;

  /** Correction attempts (if any) */
  attempts: CorrectionAttempt<T>[];

  /** Total time spent in correction (ms) */
  correctionTimeMs?: number;
}

/**
 * Corrective retrieval options
 */
export interface CorrectiveRetrievalOptions {
  /** Quality thresholds */
  thresholds?: Partial<QualityThresholds>;

  /** Maximum correction attempts (default: 3) */
  maxAttempts?: number;

  /** Strategies to try in order (default: ["broaden", "lower_threshold"]) */
  strategies?: CorrectionStrategy[];

  /** Broadening factor (default: 5) */
  broadeningFactor?: number;

  /** Whether to log correction attempts */
  enableLogging?: boolean;
}

/**
 * Retrieval function signature for corrective wrapper
 */
export type RetrievalFunction<T> = (params: {
  k: number;
  minScore: number;
  query?: string;
}) => Promise<RetrievalResult<T>[]> | RetrievalResult<T>[];

/**
 * Correction log entry
 */
export interface CorrectionLogEntry {
  /** Timestamp */
  timestamp: Date;

  /** Query identifier (if available) */
  queryId?: string;

  /** Initial quality */
  initialQuality: QualityAssessment;

  /** Final quality */
  finalQuality: QualityAssessment;

  /** Correction attempts */
  attemptCount: number;

  /** Whether correction succeeded */
  succeeded: boolean;

  /** Total correction time (ms) */
  correctionTimeMs: number;
}

// ============================================
// Quality Assessment Functions
// ============================================

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

  // Check each threshold
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

// ============================================
// Correction Strategies
// ============================================

/**
 * Calculate broadened k value for expanded retrieval.
 *
 * @param initialK - Initial k value
 * @param factor - Broadening factor (default: 5)
 * @returns New k value
 */
export function calculateBroadenedK(
  initialK: number,
  factor: number = DEFAULT_BROADENING_FACTOR
): number {
  return Math.ceil(initialK * factor);
}

/**
 * Calculate lowered threshold for more permissive retrieval.
 *
 * @param initialThreshold - Initial similarity threshold
 * @param reduction - Amount to reduce (default: 0.1)
 * @returns New threshold (minimum 0)
 */
export function calculateLoweredThreshold(
  initialThreshold: number,
  reduction: number = THRESHOLD_REDUCTION_STEP
): number {
  return Math.max(0, initialThreshold - reduction);
}

/**
 * Generate expansion terms for query broadening.
 *
 * This is a simple implementation that splits the query into terms
 * and adds common synonyms. In production, this would use an LLM
 * or embedding-based expansion.
 *
 * @param query - Original query
 * @returns Expanded query terms
 */
export function generateExpansionTerms(query: string): string[] {
  // Simple implementation: return the original query terms
  // In production, this would use an LLM or thesaurus
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  return terms;
}

/**
 * Determine which correction strategy to use based on quality issues.
 *
 * @param quality - Quality assessment
 * @param attemptNumber - Current attempt number
 * @returns Recommended strategy
 */
export function selectCorrectionStrategy(
  quality: QualityAssessment,
  attemptNumber: number
): CorrectionStrategy {
  // First attempt: broaden (fastest, most likely to help)
  if (attemptNumber === 1) {
    return "broaden";
  }

  // Second attempt: lower threshold (if avg score was the issue)
  if (attemptNumber === 2 && quality.avgScore < DEFAULT_QUALITY_THRESHOLD) {
    return "lower_threshold";
  }

  // Third attempt: broaden more aggressively
  return "broaden";
}

// ============================================
// Corrective Retrieval Pipeline
// ============================================

/**
 * Execute corrective retrieval with automatic quality-based correction.
 *
 * @param retrieveFn - The retrieval function to call
 * @param initialParams - Initial retrieval parameters
 * @param options - Corrective retrieval options
 * @returns Corrective retrieval result
 */
export async function correctiveRetrieval<T>(
  retrieveFn: RetrievalFunction<T>,
  initialParams: { k: number; minScore: number; query?: string },
  options: CorrectiveRetrievalOptions = {}
): Promise<CorrectiveRetrievalResult<T>> {
  const startTime = Date.now();

  const thresholds: QualityThresholds = {
    ...DEFAULT_QUALITY_THRESHOLDS,
    ...options.thresholds,
  };

  const maxAttempts = options.maxAttempts ?? MAX_CORRECTION_ATTEMPTS;
  const broadeningFactor = options.broadeningFactor ?? DEFAULT_BROADENING_FACTOR;
  const strategies = options.strategies ?? ["broaden", "lower_threshold"];

  // Initial retrieval
  const initialResults = await Promise.resolve(retrieveFn(initialParams));
  const initialQuality = assessRetrievalQuality(initialResults, thresholds);

  // If quality is acceptable, return early
  if (!shouldCorrect(initialQuality)) {
    return {
      results: initialResults,
      correctionApplied: false,
      initialQuality,
      finalQuality: initialQuality,
      attempts: [],
    };
  }

  // Correction loop
  const attempts: CorrectionAttempt<T>[] = [];
  let currentResults = initialResults;
  let currentQuality = initialQuality;
  let currentK = initialParams.k;
  let currentMinScore = initialParams.minScore;

  for (let attemptNum = 1; attemptNum <= maxAttempts; attemptNum++) {
    // Select strategy
    const strategyIndex = Math.min(attemptNum - 1, strategies.length - 1);
    const strategy = strategies[strategyIndex] || "broaden";

    // Apply strategy
    let params: { k: number; minScore: number; query?: string };
    const attemptParams: Record<string, unknown> = {};

    switch (strategy) {
      case "broaden": {
        const newK = calculateBroadenedK(currentK, broadeningFactor);
        attemptParams.previousK = currentK;
        attemptParams.newK = newK;
        currentK = newK;
        params = { ...initialParams, k: currentK };
        break;
      }
      case "lower_threshold": {
        const newThreshold = calculateLoweredThreshold(currentMinScore);
        attemptParams.previousThreshold = currentMinScore;
        attemptParams.newThreshold = newThreshold;
        currentMinScore = newThreshold;
        params = { ...initialParams, minScore: currentMinScore };
        break;
      }
      case "expand_query": {
        if (initialParams.query) {
          const expansionTerms = generateExpansionTerms(initialParams.query);
          attemptParams.expansionTerms = expansionTerms;
          params = {
            ...initialParams,
            query: `${initialParams.query} ${expansionTerms.join(" ")}`,
          };
        } else {
          params = initialParams;
        }
        break;
      }
      default:
        params = initialParams;
    }

    // Execute corrected retrieval
    const correctedResults = await Promise.resolve(retrieveFn(params));
    const correctedQuality = assessRetrievalQuality(correctedResults, thresholds);

    const attempt: CorrectionAttempt<T> = {
      attemptNumber: attemptNum,
      strategy,
      parameters: attemptParams,
      results: correctedResults,
      quality: correctedQuality,
      succeeded: !shouldCorrect(correctedQuality),
    };

    attempts.push(attempt);

    // If quality is now acceptable, or this attempt is better, update current
    if (!shouldCorrect(correctedQuality)) {
      currentResults = correctedResults;
      currentQuality = correctedQuality;
      break;
    }

    // Keep better results even if still below threshold
    if (correctedQuality.overallScore > currentQuality.overallScore) {
      currentResults = correctedResults;
      currentQuality = correctedQuality;
    }
  }

  const correctionTimeMs = Date.now() - startTime;

  return {
    results: currentResults,
    correctionApplied: attempts.length > 0,
    initialQuality,
    finalQuality: currentQuality,
    attempts,
    correctionTimeMs,
  };
}

/**
 * Wrap a retrieval function with automatic corrective behavior.
 *
 * @param retrieveFn - The retrieval function to wrap
 * @param options - Corrective retrieval options
 * @returns Wrapped function with corrective behavior
 */
export function withCorrectiveRetrieval<T>(
  retrieveFn: RetrievalFunction<T>,
  options: CorrectiveRetrievalOptions = {}
): (params: {
  k: number;
  minScore: number;
  query?: string;
}) => Promise<CorrectiveRetrievalResult<T>> {
  return (params) => correctiveRetrieval(retrieveFn, params, options);
}

// ============================================
// RRF Integration
// ============================================

/**
 * Quality assessment for RRF results
 */
export function assessRRFQuality<T>(
  results: RRFResult<T>[],
  thresholds: QualityThresholds = DEFAULT_QUALITY_THRESHOLDS
): QualityAssessment {
  // Convert RRF results to retrieval results for assessment
  const retrievalResults: RetrievalResult<T>[] = results.map((r) => ({
    node: r.node,
    nodeId: r.nodeId,
    score: r.rrfScore,
  }));

  return assessRetrievalQuality(retrievalResults, thresholds);
}

/**
 * Check if RRF results need correction based on quality
 */
export function shouldCorrectRRF<T>(
  results: RRFResult<T>[],
  thresholds: QualityThresholds = DEFAULT_QUALITY_THRESHOLDS
): boolean {
  const quality = assessRRFQuality(results, thresholds);
  return shouldCorrect(quality);
}

// ============================================
// Logging and Metrics
// ============================================

/**
 * Correction metrics for monitoring
 */
export interface CorrectionMetrics {
  /** Total correction attempts */
  totalAttempts: number;

  /** Successful corrections */
  successfulCorrections: number;

  /** Failed corrections (still below threshold after max attempts) */
  failedCorrections: number;

  /** Average attempts per correction */
  avgAttemptsPerCorrection: number;

  /** Average improvement in quality score */
  avgQualityImprovement: number;

  /** Average correction time (ms) */
  avgCorrectionTimeMs: number;

  /** Strategy success rates */
  strategySuccessRates: Record<CorrectionStrategy, { attempts: number; successes: number }>;
}

/**
 * Calculate metrics from correction log entries.
 *
 * @param entries - Correction log entries
 * @returns Aggregated metrics
 */
export function calculateCorrectionMetrics(entries: CorrectionLogEntry[]): CorrectionMetrics {
  if (entries.length === 0) {
    return {
      totalAttempts: 0,
      successfulCorrections: 0,
      failedCorrections: 0,
      avgAttemptsPerCorrection: 0,
      avgQualityImprovement: 0,
      avgCorrectionTimeMs: 0,
      strategySuccessRates: {
        broaden: { attempts: 0, successes: 0 },
        lower_threshold: { attempts: 0, successes: 0 },
        expand_query: { attempts: 0, successes: 0 },
      },
    };
  }

  const totalAttempts = entries.reduce((sum, e) => sum + e.attemptCount, 0);
  const successfulCorrections = entries.filter((e) => e.succeeded).length;
  const failedCorrections = entries.length - successfulCorrections;

  const avgAttemptsPerCorrection = totalAttempts / entries.length;

  const qualityImprovements = entries.map(
    (e) => e.finalQuality.overallScore - e.initialQuality.overallScore
  );
  const avgQualityImprovement = qualityImprovements.reduce((sum, i) => sum + i, 0) / entries.length;

  const avgCorrectionTimeMs =
    entries.reduce((sum, e) => sum + e.correctionTimeMs, 0) / entries.length;

  return {
    totalAttempts,
    successfulCorrections,
    failedCorrections,
    avgAttemptsPerCorrection,
    avgQualityImprovement,
    avgCorrectionTimeMs,
    strategySuccessRates: {
      broaden: { attempts: 0, successes: 0 },
      lower_threshold: { attempts: 0, successes: 0 },
      expand_query: { attempts: 0, successes: 0 },
    },
  };
}

/**
 * Create a correction log entry from a corrective retrieval result.
 *
 * @param result - Corrective retrieval result
 * @param queryId - Optional query identifier
 * @returns Log entry
 */
export function createCorrectionLogEntry<T>(
  result: CorrectiveRetrievalResult<T>,
  queryId?: string
): CorrectionLogEntry {
  return {
    timestamp: new Date(),
    queryId,
    initialQuality: result.initialQuality,
    finalQuality: result.finalQuality,
    attemptCount: result.attempts.length,
    succeeded: !result.finalQuality.needsCorrection,
    correctionTimeMs: result.correctionTimeMs ?? 0,
  };
}
