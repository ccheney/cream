/**
 * Probability of Backtest Overfitting (PBO) Calculator
 *
 * Uses Combinatorially Symmetric Cross-Validation (CSCV) to estimate the
 * probability that a strategy selected based on in-sample performance
 * will underperform out-of-sample.
 *
 * Based on Bailey, Borwein, López de Prado & Zhu (2016).
 *
 * @see docs/research/indicator-validation-statistics.md Section 2
 */

import { z } from "zod";

// ============================================
// Constants
// ============================================

/**
 * Default configuration for PBO calculation
 */
export const PBO_DEFAULTS = {
  /** Number of data splits (must be even) */
  nSplits: 8,
  /** PBO threshold below which strategy is acceptable */
  acceptableThreshold: 0.5,
  /** PBO threshold below which strategy has low overfitting risk */
  lowRiskThreshold: 0.3,
  /** Minimum observations per split */
  minObservationsPerSplit: 25,
  /** Annualization factor (trading days per year) */
  tradingDaysPerYear: 252,
} as const;

// ============================================
// Schemas
// ============================================

/**
 * Input parameters for PBO calculation
 */
export const PBOInputSchema = z.object({
  /** Array of period returns */
  returns: z.array(z.number()),
  /** Array of signal values (same length as returns) */
  signals: z.array(z.number()),
  /** Number of splits for CSCV (must be even, default: 8) */
  nSplits: z
    .number()
    .int()
    .positive()
    .refine((n) => n % 2 === 0, {
      message: "nSplits must be even for symmetric cross-validation",
    })
    .optional()
    .default(8),
});

export type PBOInput = z.input<typeof PBOInputSchema>;

/**
 * Result of a single CSCV combination
 */
export const CSCVCombinationResultSchema = z.object({
  /** Indices used for in-sample (training) */
  trainIndices: z.array(z.number()),
  /** Indices used for out-of-sample (test) */
  testIndices: z.array(z.number()),
  /** In-sample Sharpe ratio */
  inSampleSharpe: z.number(),
  /** Out-of-sample Sharpe ratio */
  outOfSampleSharpe: z.number(),
  /** Whether OOS underperformed IS */
  underperformed: z.boolean(),
});

export type CSCVCombinationResult = z.infer<typeof CSCVCombinationResultSchema>;

/**
 * Result of PBO calculation
 */
export const PBOResultSchema = z.object({
  /** Probability of Backtest Overfitting (0 to 1) */
  pbo: z.number().min(0).max(1),
  /** Number of combinations tested */
  nCombinations: z.number().int().positive(),
  /** Number of combinations where OOS underperformed IS */
  nUnderperformed: z.number().int().min(0),
  /** Mean in-sample Sharpe across all combinations */
  meanInSampleSharpe: z.number(),
  /** Mean out-of-sample Sharpe across all combinations */
  meanOutOfSampleSharpe: z.number(),
  /** Standard deviation of IS Sharpe */
  stdInSampleSharpe: z.number(),
  /** Standard deviation of OOS Sharpe */
  stdOutOfSampleSharpe: z.number(),
  /** Performance degradation ratio (1 - OOS/IS) */
  degradation: z.number(),
  /** Interpretation of the result */
  interpretation: z.enum(["low_risk", "moderate_risk", "high_risk"]),
  /** Whether strategy passes PBO test */
  passed: z.boolean(),
  /** Details of each combination (optional, for debugging) */
  combinations: z.array(CSCVCombinationResultSchema).optional(),
});

export type PBOResult = z.infer<typeof PBOResultSchema>;

// ============================================
// Core Functions
// ============================================

/**
 * Compute all combinations of n items taken k at a time.
 *
 * @param n - Total number of items
 * @param k - Number of items to choose
 * @returns Array of arrays, each containing k indices
 */
export function combinations(n: number, k: number): number[][] {
  const result: number[][] = [];

  function backtrack(start: number, current: number[]): void {
    if (current.length === k) {
      result.push([...current]);
      return;
    }

    for (let i = start; i < n; i++) {
      current.push(i);
      backtrack(i + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return result;
}

/**
 * Calculate the number of combinations C(n, k).
 *
 * @param n - Total items
 * @param k - Items to choose
 * @returns Number of combinations
 */
export function nCr(n: number, k: number): number {
  if (k > n || k < 0) {
    return 0;
  }
  if (k === 0 || k === n) {
    return 1;
  }

  // Use smaller k for efficiency
  const kToUse = k > n - k ? n - k : k;

  let result = 1;
  for (let i = 0; i < kToUse; i++) {
    result = (result * (n - i)) / (i + 1);
  }

  return Math.round(result);
}

/**
 * Calculate Sharpe ratio from returns.
 *
 * @param returns - Array of period returns
 * @param annualizationFactor - Factor to annualize (default: 252)
 * @returns Annualized Sharpe ratio
 */
export function computeSharpe(
  returns: number[],
  annualizationFactor: number = PBO_DEFAULTS.tradingDaysPerYear
): number {
  if (returns.length === 0) {
    return 0;
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;

  if (returns.length === 1) {
    return 0;
  }

  const squaredDiffs = returns.map((r) => (r - mean) ** 2);
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);

  // Use tolerance for near-zero std to handle floating point precision
  if (std < 1e-15) {
    return 0;
  }

  return (mean / std) * Math.sqrt(annualizationFactor);
}

/**
 * Compute Probability of Backtest Overfitting using CSCV.
 *
 * The algorithm:
 * 1. Split data into S equal sub-samples
 * 2. Generate all combinations of S/2 sub-samples for training
 * 3. For each combination, compute IS and OOS performance
 * 4. PBO = fraction of combinations where OOS < IS
 *
 * @param input - PBO input parameters
 * @param includeDetails - Whether to include combination details
 * @returns PBO calculation result
 */
export function computePBO(input: PBOInput, includeDetails = false): PBOResult {
  const { returns, signals, nSplits } = PBOInputSchema.parse(input);

  if (returns.length !== signals.length) {
    throw new Error(
      `Returns and signals must have same length: ${returns.length} vs ${signals.length}`
    );
  }

  const n = returns.length;
  const splitSize = Math.floor(n / nSplits);

  if (splitSize < PBO_DEFAULTS.minObservationsPerSplit) {
    throw new Error(
      `Insufficient data: each split needs at least ${PBO_DEFAULTS.minObservationsPerSplit} ` +
        `observations, but only have ${splitSize}. Need ${nSplits * PBO_DEFAULTS.minObservationsPerSplit} total observations.`
    );
  }

  // Create splits
  const splits: Array<{ returns: number[]; signals: number[] }> = [];
  for (let i = 0; i < nSplits; i++) {
    const start = i * splitSize;
    const end = start + splitSize;
    splits.push({
      returns: returns.slice(start, end),
      signals: signals.slice(start, end),
    });
  }

  // Generate all combinations of nSplits/2 for training
  const trainCombos = combinations(nSplits, nSplits / 2);
  const allIndices = Array.from({ length: nSplits }, (_, i) => i);

  const combinationResults: CSCVCombinationResult[] = [];
  let underperformCount = 0;

  for (const trainIndices of trainCombos) {
    const testIndices = allIndices.filter((i) => !trainIndices.includes(i));

    // Compute IS performance (strategy returns = market returns * sign of signal)
    const isReturns: number[] = [];
    for (const idx of trainIndices) {
      const split = splits[idx];
      if (!split) {
        continue;
      }
      for (let j = 0; j < split.returns.length; j++) {
        const signalVal = split.signals[j];
        const returnVal = split.returns[j];
        if (signalVal !== undefined && returnVal !== undefined) {
          isReturns.push(returnVal * Math.sign(signalVal));
        }
      }
    }
    const inSampleSharpe = computeSharpe(isReturns);

    // Compute OOS performance
    const oosReturns: number[] = [];
    for (const idx of testIndices) {
      const split = splits[idx];
      if (!split) {
        continue;
      }
      for (let j = 0; j < split.returns.length; j++) {
        const signalVal = split.signals[j];
        const returnVal = split.returns[j];
        if (signalVal !== undefined && returnVal !== undefined) {
          oosReturns.push(returnVal * Math.sign(signalVal));
        }
      }
    }
    const outOfSampleSharpe = computeSharpe(oosReturns);

    // Check if OOS underperforms IS
    const underperformed = outOfSampleSharpe < inSampleSharpe;
    if (underperformed) {
      underperformCount++;
    }

    combinationResults.push({
      trainIndices,
      testIndices,
      inSampleSharpe,
      outOfSampleSharpe,
      underperformed,
    });
  }

  // Calculate PBO
  const pbo = underperformCount / trainCombos.length;

  // Calculate summary statistics
  const isSharpes = combinationResults.map((c) => c.inSampleSharpe);
  const oosSharpes = combinationResults.map((c) => c.outOfSampleSharpe);

  const meanIS = isSharpes.reduce((a, b) => a + b, 0) / isSharpes.length;
  const meanOOS = oosSharpes.reduce((a, b) => a + b, 0) / oosSharpes.length;

  const stdIS = Math.sqrt(
    isSharpes.map((s) => (s - meanIS) ** 2).reduce((a, b) => a + b, 0) / isSharpes.length
  );
  const stdOOS = Math.sqrt(
    oosSharpes.map((s) => (s - meanOOS) ** 2).reduce((a, b) => a + b, 0) / oosSharpes.length
  );

  // Performance degradation
  const degradation = meanIS !== 0 ? 1 - meanOOS / meanIS : 0;

  // Determine interpretation
  let interpretation: "low_risk" | "moderate_risk" | "high_risk";
  if (pbo < PBO_DEFAULTS.lowRiskThreshold) {
    interpretation = "low_risk";
  } else if (pbo < PBO_DEFAULTS.acceptableThreshold) {
    interpretation = "moderate_risk";
  } else {
    interpretation = "high_risk";
  }

  const result: PBOResult = {
    pbo,
    nCombinations: trainCombos.length,
    nUnderperformed: underperformCount,
    meanInSampleSharpe: meanIS,
    meanOutOfSampleSharpe: meanOOS,
    stdInSampleSharpe: stdIS,
    stdOutOfSampleSharpe: stdOOS,
    degradation,
    interpretation,
    passed: pbo < PBO_DEFAULTS.acceptableThreshold,
  };

  if (includeDetails) {
    result.combinations = combinationResults;
  }

  return result;
}

/**
 * Calculate minimum backtest length needed for reliable PBO.
 *
 * Based on Bailey et al. (2016) minimum backtest length formula.
 *
 * @param nTrials - Number of strategy configurations tested
 * @param targetSharpe - Target Sharpe ratio (default: 1.0)
 * @returns Minimum number of days of data needed
 */
export function minimumBacktestLength(nTrials: number, targetSharpe = 1.0): number {
  if (nTrials <= 1) {
    return PBO_DEFAULTS.tradingDaysPerYear;
  }

  // Approximate formula from Bailey et al.
  const minDays = Math.ceil(
    ((1 + (1 - 0.5 * Math.log(nTrials))) * PBO_DEFAULTS.tradingDaysPerYear) / targetSharpe ** 2
  );

  return Math.max(minDays, PBO_DEFAULTS.tradingDaysPerYear);
}

/**
 * Check if PBO result indicates strategy is acceptable.
 *
 * @param result - PBO calculation result
 * @param threshold - PBO threshold (default: 0.50)
 * @returns True if strategy passes PBO test
 */
export function isPBOAcceptable(
  result: PBOResult,
  threshold: number = PBO_DEFAULTS.acceptableThreshold
): boolean {
  return result.pbo < threshold;
}

/**
 * Evaluate PBO result and provide human-readable interpretation.
 *
 * @param result - PBO calculation result
 * @returns Human-readable evaluation
 */
export function evaluatePBO(result: PBOResult): {
  summary: string;
  recommendation: "accept" | "review" | "reject";
  details: string[];
} {
  const details: string[] = [];

  details.push(`PBO: ${(result.pbo * 100).toFixed(1)}%`);
  details.push(`Combinations tested: ${result.nCombinations}`);
  details.push(`Underperformed: ${result.nUnderperformed} / ${result.nCombinations}`);
  details.push(`Mean IS Sharpe: ${result.meanInSampleSharpe.toFixed(3)}`);
  details.push(`Mean OOS Sharpe: ${result.meanOutOfSampleSharpe.toFixed(3)}`);
  details.push(`Performance degradation: ${(result.degradation * 100).toFixed(1)}%`);

  let summary: string;
  let recommendation: "accept" | "review" | "reject";

  switch (result.interpretation) {
    case "low_risk":
      summary =
        "Strategy shows low overfitting risk. OOS performance consistently matches IS performance.";
      recommendation = "accept";
      break;
    case "moderate_risk":
      summary = "Strategy has moderate overfitting risk. Some degradation expected out-of-sample.";
      recommendation = "review";
      break;
    case "high_risk":
      summary = "Strategy has high overfitting risk. IS performance likely not reproducible OOS.";
      recommendation = "reject";
      break;
  }

  return { summary, recommendation, details };
}

/**
 * Compute PBO for multiple strategies and rank them.
 *
 * Useful for comparing multiple indicator configurations.
 *
 * @param strategies - Array of strategy configurations with returns and signals
 * @param nSplits - Number of splits for CSCV
 * @returns Strategies ranked by PBO (lowest first)
 */
export function rankStrategiesByPBO(
  strategies: Array<{
    name: string;
    returns: number[];
    signals: number[];
  }>,
  nSplits: number = PBO_DEFAULTS.nSplits
): Array<{
  name: string;
  pbo: number;
  passed: boolean;
  result: PBOResult;
}> {
  const results = strategies.map((strategy) => {
    const result = computePBO({
      returns: strategy.returns,
      signals: strategy.signals,
      nSplits,
    });

    return {
      name: strategy.name,
      pbo: result.pbo,
      passed: result.passed,
      result,
    };
  });

  // Sort by PBO (lowest = best)
  return results.sort((a, b) => a.pbo - b.pbo);
}

/**
 * Generate synthetic returns for testing.
 *
 * @param n - Number of observations
 * @param drift - Mean return (daily)
 * @param volatility - Standard deviation of returns (daily)
 * @returns Array of returns
 */
export function generateSyntheticReturns(n: number, drift = 0.0001, volatility = 0.02): number[] {
  const returns: number[] = [];

  for (let i = 0; i < n; i++) {
    // Box-Muller transform for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    returns.push(drift + volatility * z);
  }

  return returns;
}

/**
 * Generate synthetic signals for testing.
 *
 * @param returns - Array of returns
 * @param icTarget - Target information coefficient
 * @returns Array of signals correlated with returns
 */
export function generateSyntheticSignals(returns: number[], icTarget = 0.05): number[] {
  const n = returns.length;
  const signals: number[] = [];

  for (let i = 0; i < n; i++) {
    // Generate signal with target IC
    const returnVal = returns[i];
    if (returnVal !== undefined) {
      const u1 = Math.random();
      const u2 = Math.random();
      const noise = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      // Signal = alpha * return + (1-alpha) * noise
      const alpha = icTarget * 2; // Approximate relationship
      signals.push(alpha * returnVal + (1 - alpha) * noise * 0.02);
    }
  }

  return signals;
}
