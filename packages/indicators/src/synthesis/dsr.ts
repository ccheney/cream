/**
 * Deflated Sharpe Ratio (DSR) Calculator
 *
 * Statistical method to determine if a strategy's Sharpe ratio is significant
 * after correcting for multiple testing bias and non-normal returns.
 *
 * Based on Bailey & López de Prado (2014).
 *
 * @see docs/research/indicator-validation-statistics.md Section 1
 */

import { z } from "zod";

// ============================================
// Constants
// ============================================

/**
 * Euler-Mascheroni constant (γ)
 */
const EULER_MASCHERONI = 0.5772156649;

/**
 * Default configuration for DSR calculation
 */
export const DSR_DEFAULTS = {
  /** p-value threshold to consider strategy significant */
  significanceThreshold: 0.95,
  /** p-value threshold to consider strategy questionable */
  questionableThreshold: 0.5,
  /** Assumed kurtosis for normal distribution */
  normalKurtosis: 3.0,
  /** Minimum observations required */
  minObservations: 30,
  /** Annualization factor (trading days per year) */
  tradingDaysPerYear: 252,
} as const;

// ============================================
// Schemas
// ============================================

/**
 * Input parameters for DSR calculation
 */
export const DSRInputSchema = z.object({
  /** Observed Sharpe ratio (annualized) */
  observedSharpe: z.number(),
  /** Number of strategy configurations tested */
  nTrials: z.number().int().positive(),
  /** Number of return observations */
  nObservations: z.number().int().positive(),
  /** Return skewness (default: 0 for symmetric) */
  skewness: z.number().optional().default(0),
  /** Return kurtosis (default: 3 for normal) */
  kurtosis: z.number().optional().default(3),
});

export type DSRInput = z.input<typeof DSRInputSchema>;

/**
 * Result of DSR calculation
 */
export const DSRResultSchema = z.object({
  /** Deflated Sharpe Ratio value */
  dsr: z.number(),
  /** Probability that the strategy has true skill (1 - p-value) */
  probability: z.number().min(0).max(1),
  /** p-value of the test (lower = more likely due to chance) */
  pValue: z.number().min(0).max(1),
  /** Expected maximum Sharpe from random chance */
  expectedMaxSharpe: z.number(),
  /** Standard error of the Sharpe ratio */
  standardError: z.number(),
  /** Z-statistic of the test */
  zStatistic: z.number(),
  /** Original observed Sharpe ratio */
  observedSharpe: z.number(),
  /** Interpretation of the result */
  interpretation: z.enum(["significant", "questionable", "likely_chance"]),
  /** Whether strategy passes DSR test */
  passed: z.boolean(),
});

export type DSRResult = z.infer<typeof DSRResultSchema>;

/**
 * Return statistics needed for DSR calculation
 */
export const ReturnStatisticsSchema = z.object({
  /** Mean return (annualized) */
  mean: z.number(),
  /** Standard deviation of returns (annualized) */
  std: z.number(),
  /** Skewness of returns */
  skewness: z.number(),
  /** Kurtosis of returns (excess kurtosis + 3) */
  kurtosis: z.number(),
  /** Number of observations */
  nObservations: z.number().int().positive(),
  /** Sharpe ratio (mean / std) */
  sharpeRatio: z.number(),
});

export type ReturnStatistics = z.infer<typeof ReturnStatisticsSchema>;

// ============================================
// Core Functions
// ============================================

/**
 * Calculate expected maximum Sharpe ratio from multiple testing.
 *
 * Under the null hypothesis (no skill), the expected maximum Sharpe
 * from N independent trials follows this distribution.
 *
 * @param nTrials - Number of independent trials tested
 * @returns Expected maximum Sharpe ratio
 */
export function expectedMaxSharpe(nTrials: number): number {
  if (nTrials <= 1) {
    return 0;
  }

  const z = Math.sqrt(2 * Math.log(nTrials));
  const correction = (EULER_MASCHERONI + Math.log(Math.PI / 2)) / z;

  return z - correction;
}

/**
 * Calculate standard error of the Sharpe ratio.
 *
 * Adjusts for non-normal returns using skewness and kurtosis.
 *
 * @param sharpe - Observed Sharpe ratio
 * @param nObservations - Number of observations
 * @param skewness - Return skewness (0 for symmetric)
 * @param kurtosis - Return kurtosis (3 for normal)
 * @returns Standard error of Sharpe ratio
 */
export function sharpeStandardError(
  sharpe: number,
  nObservations: number,
  skewness = 0,
  kurtosis = 3
): number {
  // Lo (2002) formula with non-normality adjustment
  const variance =
    (1 + 0.5 * sharpe * sharpe - skewness * sharpe + ((kurtosis - 3) / 4) * sharpe * sharpe) /
    nObservations;

  return Math.sqrt(Math.max(variance, 0));
}

/**
 * Calculate the Deflated Sharpe Ratio.
 *
 * Tests whether the observed Sharpe ratio is significantly higher
 * than what would be expected from random chance given the number
 * of trials tested.
 *
 * @param input - DSR input parameters
 * @returns DSR calculation result
 */
export function calculateDSR(input: DSRInput): DSRResult {
  const { observedSharpe, nTrials, nObservations, skewness, kurtosis } =
    DSRInputSchema.parse(input);

  // Calculate expected max Sharpe under null hypothesis
  const srBenchmark = expectedMaxSharpe(nTrials);

  // Calculate standard error adjusted for non-normality
  const se = sharpeStandardError(observedSharpe, nObservations, skewness, kurtosis);

  // Calculate z-statistic
  const zStat = se > 0 ? (observedSharpe - srBenchmark) / se : 0;

  // Calculate p-value using standard normal CDF
  const pValue = 1 - normalCDF(zStat);

  // Calculate probability of skill (1 - p-value, for "higher is better")
  const probability = 1 - pValue;

  // DSR value
  const dsr = observedSharpe - srBenchmark;

  // Determine interpretation
  let interpretation: "significant" | "questionable" | "likely_chance";
  if (probability >= DSR_DEFAULTS.significanceThreshold) {
    interpretation = "significant";
  } else if (probability >= DSR_DEFAULTS.questionableThreshold) {
    interpretation = "questionable";
  } else {
    interpretation = "likely_chance";
  }

  return {
    dsr,
    probability,
    pValue,
    expectedMaxSharpe: srBenchmark,
    standardError: se,
    zStatistic: zStat,
    observedSharpe,
    interpretation,
    passed: probability >= DSR_DEFAULTS.significanceThreshold,
  };
}

/**
 * Calculate return statistics from a returns array.
 *
 * @param returns - Array of period returns (e.g., daily returns)
 * @param annualizationFactor - Factor to annualize (default: 252 trading days)
 * @returns Return statistics
 */
export function calculateReturnStatistics(
  returns: number[],
  annualizationFactor: number = DSR_DEFAULTS.tradingDaysPerYear
): ReturnStatistics {
  const n = returns.length;

  if (n < DSR_DEFAULTS.minObservations) {
    throw new Error(`Insufficient observations: ${n} < ${DSR_DEFAULTS.minObservations} required`);
  }

  // Mean
  const sum = returns.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  // Standard deviation
  const squaredDiffs = returns.map((r) => (r - mean) ** 2);
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (n - 1);
  const std = Math.sqrt(variance);

  // Skewness (Fisher-Pearson)
  const cubedDiffs = returns.map((r) => ((r - mean) / std) ** 3);
  const skewness = (n / ((n - 1) * (n - 2))) * cubedDiffs.reduce((a, b) => a + b, 0);

  // Kurtosis (using standard formula, returns full kurtosis not excess)
  // For normal distribution, kurtosis = 3
  const fourthDiffs = returns.map((r) => ((r - mean) / std) ** 4);
  const m4 = fourthDiffs.reduce((a, b) => a + b, 0) / n;
  // Bias-corrected kurtosis (Fisher's formula for excess kurtosis)
  const g2 = ((n - 1) / ((n - 2) * (n - 3))) * ((n + 1) * m4 - 3 * (n - 1));
  // Convert excess kurtosis to full kurtosis (add 3)
  const kurtosis = g2 + 3;

  // Annualize
  const annualizedMean = mean * annualizationFactor;
  const annualizedStd = std * Math.sqrt(annualizationFactor);
  const sharpeRatio = annualizedStd > 0 ? annualizedMean / annualizedStd : 0;

  return {
    mean: annualizedMean,
    std: annualizedStd,
    skewness,
    kurtosis,
    nObservations: n,
    sharpeRatio,
  };
}

/**
 * Calculate DSR from raw returns.
 *
 * Convenience function that calculates return statistics and DSR in one call.
 *
 * @param returns - Array of period returns
 * @param nTrials - Number of strategy configurations tested
 * @param annualizationFactor - Factor to annualize (default: 252)
 * @returns DSR result
 */
export function calculateDSRFromReturns(
  returns: number[],
  nTrials: number,
  annualizationFactor: number = DSR_DEFAULTS.tradingDaysPerYear
): DSRResult {
  const stats = calculateReturnStatistics(returns, annualizationFactor);

  return calculateDSR({
    observedSharpe: stats.sharpeRatio,
    nTrials,
    nObservations: stats.nObservations,
    skewness: stats.skewness,
    kurtosis: stats.kurtosis,
  });
}

// ============================================
// Helper Functions
// ============================================

/**
 * Standard normal CDF approximation.
 *
 * Uses the Abramowitz and Stegun approximation (7.1.26).
 *
 * @param x - Z-score
 * @returns Cumulative probability
 */
function normalCDF(x: number): number {
  // Constants for approximation
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  // Save the sign and use local variable to avoid parameter mutation
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;

  // Approximation
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Validate if a strategy passes DSR test.
 *
 * @param result - DSR calculation result
 * @param threshold - Probability threshold (default: 0.95)
 * @returns True if strategy is statistically significant
 */
export function isDSRSignificant(
  result: DSRResult,
  threshold: number = DSR_DEFAULTS.significanceThreshold
): boolean {
  return result.probability >= threshold;
}

/**
 * Get the minimum Sharpe ratio needed to pass DSR test.
 *
 * Given the number of trials, calculates what observed Sharpe ratio
 * would be needed to achieve statistical significance.
 *
 * @param nTrials - Number of strategy configurations tested
 * @param nObservations - Number of return observations
 * @param targetProbability - Target probability threshold (default: 0.95)
 * @param skewness - Return skewness (default: 0)
 * @param kurtosis - Return kurtosis (default: 3)
 * @returns Minimum required Sharpe ratio
 */
export function minimumRequiredSharpe(
  nTrials: number,
  nObservations: number,
  targetProbability = DSR_DEFAULTS.significanceThreshold,
  skewness = 0,
  kurtosis = 3
): number {
  const srBenchmark = expectedMaxSharpe(nTrials);

  // Z-score for target probability (inverse normal CDF)
  const zTarget = inverseNormalCDF(targetProbability);

  // Solve iteratively for required Sharpe
  // SR_required = SR_benchmark + z * SE(SR_required)
  // This requires iteration since SE depends on SR

  let srEstimate = srBenchmark + 0.5; // Initial guess

  for (let i = 0; i < 20; i++) {
    const se = sharpeStandardError(srEstimate, nObservations, skewness, kurtosis);
    const newEstimate = srBenchmark + zTarget * se;

    if (Math.abs(newEstimate - srEstimate) < 1e-6) {
      break;
    }

    srEstimate = newEstimate;
  }

  return srEstimate;
}

/**
 * Inverse standard normal CDF approximation.
 *
 * Uses rational approximation.
 *
 * @param p - Probability (0 < p < 1)
 * @returns Z-score
 */
function inverseNormalCDF(p: number): number {
  if (p <= 0 || p >= 1) {
    throw new Error("Probability must be between 0 and 1 exclusive");
  }

  // Coefficients for rational approximation - destructure to avoid non-null assertions
  const [a0, a1, a2, a3, a4, a5] = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];

  const [b0, b1, b2, b3, b4] = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];

  const [c0, c1, c2, c3, c4, c5] = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];

  const [d0, d1, d2, d3] = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;
  let r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c0 * q + c1) * q + c2) * q + c3) * q + c4) * q + c5) /
      ((((d0 * q + d1) * q + d2) * q + d3) * q + 1)
    );
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a0 * r + a1) * r + a2) * r + a3) * r + a4) * r + a5) * q) /
      (((((b0 * r + b1) * r + b2) * r + b3) * r + b4) * r + 1)
    );
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(((((c0 * q + c1) * q + c2) * q + c3) * q + c4) * q + c5) /
      ((((d0 * q + d1) * q + d2) * q + d3) * q + 1)
    );
  }
}

/**
 * Evaluate DSR result and provide human-readable interpretation.
 *
 * @param result - DSR calculation result
 * @returns Human-readable evaluation
 */
export function evaluateDSR(result: DSRResult): {
  summary: string;
  recommendation: "accept" | "review" | "reject";
  details: string[];
} {
  const details: string[] = [];

  details.push(`Observed Sharpe: ${result.observedSharpe.toFixed(3)}`);
  details.push(`Expected Max Sharpe (under null): ${result.expectedMaxSharpe.toFixed(3)}`);
  details.push(`Deflated Sharpe Ratio: ${result.dsr.toFixed(3)}`);
  details.push(`Probability of true skill: ${(result.probability * 100).toFixed(1)}%`);
  details.push(`P-value: ${result.pValue.toFixed(4)}`);

  let summary: string;
  let recommendation: "accept" | "review" | "reject";

  switch (result.interpretation) {
    case "significant":
      summary =
        "Strategy shows statistically significant skill after accounting for multiple testing bias.";
      recommendation = "accept";
      break;
    case "questionable":
      summary = "Strategy performance is questionable - could be skill or luck.";
      recommendation = "review";
      break;
    case "likely_chance":
      summary = "Strategy performance is likely due to chance/overfitting.";
      recommendation = "reject";
      break;
  }

  return { summary, recommendation, details };
}
