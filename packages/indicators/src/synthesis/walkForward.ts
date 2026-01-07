/**
 * Walk-Forward Validation Module
 *
 * Tests strategy robustness by simulating real trading conditions where
 * parameters are optimized on past data and tested on subsequent unseen data.
 *
 * @see docs/research/indicator-validation-statistics.md Section 4
 */

import { z } from "zod";

// ============================================
// Constants
// ============================================

/**
 * Default configuration for walk-forward validation
 */
export const WF_DEFAULTS = {
  /** Number of validation periods */
  nPeriods: 5,
  /** Train/test split ratio (train portion) */
  trainRatio: 0.8,
  /** Minimum efficiency to pass validation */
  minEfficiency: 0.5,
  /** Minimum consistency (% positive OOS) */
  minConsistency: 0.6,
  /** Annualization factor */
  tradingDaysPerYear: 252,
  /** Minimum observations per period */
  minObservationsPerPeriod: 20,
} as const;

/**
 * Walk-forward method types
 */
export type WalkForwardMethod = "rolling" | "anchored";

// ============================================
// Schemas
// ============================================

/**
 * Input parameters for walk-forward validation
 */
export const WalkForwardInputSchema = z.object({
  /** Array of period returns */
  returns: z.array(z.number()),
  /** Array of signal values (same length as returns) */
  signals: z.array(z.number()),
  /** Number of periods for walk-forward */
  nPeriods: z.number().int().min(2).optional().default(5),
  /** Train/test split ratio (portion for training) */
  trainRatio: z.number().min(0.1).max(0.95).optional().default(0.8),
  /** Walk-forward method */
  method: z.enum(["rolling", "anchored"]).optional().default("rolling"),
});

export type WalkForwardInput = z.input<typeof WalkForwardInputSchema>;

/**
 * Result of a single walk-forward period
 */
export const WalkForwardPeriodSchema = z.object({
  /** Period index (0-based) */
  periodIndex: z.number().int().min(0),
  /** Start index of the period in original data */
  startIndex: z.number().int().min(0),
  /** End index of the period in original data */
  endIndex: z.number().int().min(0),
  /** In-sample Sharpe ratio */
  inSampleSharpe: z.number(),
  /** Out-of-sample Sharpe ratio */
  outOfSampleSharpe: z.number(),
  /** Number of IS observations */
  nInSample: z.number().int().min(0),
  /** Number of OOS observations */
  nOutOfSample: z.number().int().min(0),
  /** Period efficiency (OOS/IS) */
  efficiency: z.number(),
  /** Whether OOS was positive */
  oosPositive: z.boolean(),
});

export type WalkForwardPeriod = z.infer<typeof WalkForwardPeriodSchema>;

/**
 * Result of walk-forward validation
 */
export const WalkForwardResultSchema = z.object({
  /** Walk-forward efficiency (mean OOS / mean IS) */
  efficiency: z.number(),
  /** Performance degradation (1 - efficiency) */
  degradation: z.number(),
  /** Consistency (% of periods with positive OOS) */
  consistency: z.number().min(0).max(1),
  /** Mean in-sample Sharpe */
  meanInSampleSharpe: z.number(),
  /** Mean out-of-sample Sharpe */
  meanOutOfSampleSharpe: z.number(),
  /** Standard deviation of IS Sharpe */
  stdInSampleSharpe: z.number(),
  /** Standard deviation of OOS Sharpe */
  stdOutOfSampleSharpe: z.number(),
  /** Number of periods tested */
  nPeriods: z.number().int().min(1),
  /** Walk-forward method used */
  method: z.enum(["rolling", "anchored"]),
  /** Train/test ratio used */
  trainRatio: z.number(),
  /** Interpretation of result */
  interpretation: z.enum(["robust", "marginal", "overfit"]),
  /** Whether strategy passes walk-forward validation */
  passed: z.boolean(),
  /** Details for each period */
  periods: z.array(WalkForwardPeriodSchema),
});

export type WalkForwardResult = z.infer<typeof WalkForwardResultSchema>;

// ============================================
// Core Functions
// ============================================

/**
 * Calculate Sharpe ratio from returns.
 *
 * @param returns - Array of period returns
 * @param annualizationFactor - Factor to annualize (default: 252)
 * @returns Annualized Sharpe ratio
 */
function calculateSharpe(
  returns: number[],
  annualizationFactor: number = WF_DEFAULTS.tradingDaysPerYear
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

  // Use tolerance for near-zero std
  if (std < 1e-15) {
    return 0;
  }

  return (mean / std) * Math.sqrt(annualizationFactor);
}

/**
 * Calculate strategy returns from market returns and signals.
 *
 * @param returns - Market returns
 * @param signals - Signal values
 * @returns Strategy returns (returns * sign of signal)
 */
function calculateStrategyReturns(returns: number[], signals: number[]): number[] {
  const strategyReturns: number[] = [];

  for (let i = 0; i < returns.length; i++) {
    const ret = returns[i];
    const sig = signals[i];
    if (ret !== undefined && sig !== undefined) {
      strategyReturns.push(ret * Math.sign(sig));
    }
  }

  return strategyReturns;
}

/**
 * Perform walk-forward validation.
 *
 * Splits data into multiple periods, each with a training and test portion.
 * Evaluates strategy performance by comparing IS to OOS performance.
 *
 * @param input - Walk-forward validation input
 * @returns Walk-forward validation result
 */
export function walkForwardValidation(input: WalkForwardInput): WalkForwardResult {
  const parsed = WalkForwardInputSchema.parse(input);
  const { returns, signals, nPeriods, trainRatio, method } = parsed;

  if (returns.length !== signals.length) {
    throw new Error(
      `Returns and signals must have same length: ${returns.length} vs ${signals.length}`
    );
  }

  const n = returns.length;
  const periodSize = Math.floor(n / nPeriods);

  if (periodSize < WF_DEFAULTS.minObservationsPerPeriod) {
    throw new Error(
      `Insufficient data: each period needs at least ${WF_DEFAULTS.minObservationsPerPeriod} ` +
        `observations, but only have ${periodSize}. Need ${nPeriods * WF_DEFAULTS.minObservationsPerPeriod} total observations.`
    );
  }

  const periods: WalkForwardPeriod[] = [];

  for (let i = 0; i < nPeriods; i++) {
    let start: number;
    let end: number;

    if (method === "rolling") {
      // Rolling window: each period is a fixed-size window
      start = i * periodSize;
      end = start + periodSize;
    } else {
      // Anchored: training starts from beginning, window grows
      start = 0;
      end = (i + 1) * periodSize;
    }

    // Ensure we don't exceed array bounds
    end = Math.min(end, n);

    const periodReturns = returns.slice(start, end);
    const periodSignals = signals.slice(start, end);

    const trainSize = Math.floor(periodReturns.length * trainRatio);
    const testSize = periodReturns.length - trainSize;

    if (trainSize < 2 || testSize < 2) {
      continue; // Skip periods with insufficient data
    }

    // In-sample (training)
    const isReturns = periodReturns.slice(0, trainSize);
    const isSignals = periodSignals.slice(0, trainSize);
    const isStrategyReturns = calculateStrategyReturns(isReturns, isSignals);
    const inSampleSharpe = calculateSharpe(isStrategyReturns);

    // Out-of-sample (test)
    const oosReturns = periodReturns.slice(trainSize);
    const oosSignals = periodSignals.slice(trainSize);
    const oosStrategyReturns = calculateStrategyReturns(oosReturns, oosSignals);
    const outOfSampleSharpe = calculateSharpe(oosStrategyReturns);

    // Period efficiency
    const efficiency = inSampleSharpe !== 0 ? outOfSampleSharpe / inSampleSharpe : 0;

    periods.push({
      periodIndex: i,
      startIndex: start,
      endIndex: end,
      inSampleSharpe,
      outOfSampleSharpe,
      nInSample: trainSize,
      nOutOfSample: testSize,
      efficiency,
      oosPositive: outOfSampleSharpe > 0,
    });
  }

  if (periods.length === 0) {
    return {
      efficiency: 0,
      degradation: 1,
      consistency: 0,
      meanInSampleSharpe: 0,
      meanOutOfSampleSharpe: 0,
      stdInSampleSharpe: 0,
      stdOutOfSampleSharpe: 0,
      nPeriods: 0,
      method,
      trainRatio,
      interpretation: "overfit",
      passed: false,
      periods: [],
    };
  }

  // Calculate summary statistics
  const isSharpes = periods.map((p) => p.inSampleSharpe);
  const oosSharpes = periods.map((p) => p.outOfSampleSharpe);

  const meanIS = isSharpes.reduce((a, b) => a + b, 0) / isSharpes.length;
  const meanOOS = oosSharpes.reduce((a, b) => a + b, 0) / oosSharpes.length;

  const stdIS = Math.sqrt(
    isSharpes.map((s) => (s - meanIS) ** 2).reduce((a, b) => a + b, 0) /
      Math.max(isSharpes.length - 1, 1)
  );
  const stdOOS = Math.sqrt(
    oosSharpes.map((s) => (s - meanOOS) ** 2).reduce((a, b) => a + b, 0) /
      Math.max(oosSharpes.length - 1, 1)
  );

  // Walk-forward efficiency
  const efficiency = meanIS !== 0 ? meanOOS / meanIS : 0;
  const degradation = 1 - efficiency;

  // Consistency (% of periods with positive OOS)
  const positiveOOS = periods.filter((p) => p.oosPositive).length;
  const consistency = positiveOOS / periods.length;

  // Determine interpretation
  let interpretation: "robust" | "marginal" | "overfit";
  if (efficiency >= WF_DEFAULTS.minEfficiency && consistency >= WF_DEFAULTS.minConsistency) {
    interpretation = "robust";
  } else if (efficiency >= 0.3 && consistency >= 0.4) {
    interpretation = "marginal";
  } else {
    interpretation = "overfit";
  }

  // Check if passes validation
  const passed =
    efficiency >= WF_DEFAULTS.minEfficiency && consistency >= WF_DEFAULTS.minConsistency;

  return {
    efficiency,
    degradation,
    consistency,
    meanInSampleSharpe: meanIS,
    meanOutOfSampleSharpe: meanOOS,
    stdInSampleSharpe: stdIS,
    stdOutOfSampleSharpe: stdOOS,
    nPeriods: periods.length,
    method,
    trainRatio,
    interpretation,
    passed,
    periods,
  };
}

/**
 * Perform walk-forward validation with multiple configurations.
 *
 * Tests different numbers of periods and train ratios to find optimal settings.
 *
 * @param returns - Array of period returns
 * @param signals - Array of signal values
 * @param configs - Array of configurations to test
 * @returns Results for each configuration
 */
export function walkForwardSweep(
  returns: number[],
  signals: number[],
  configs: Array<{
    nPeriods: number;
    trainRatio: number;
    method: WalkForwardMethod;
  }> = [
    { nPeriods: 5, trainRatio: 0.8, method: "rolling" },
    { nPeriods: 5, trainRatio: 0.8, method: "anchored" },
    { nPeriods: 10, trainRatio: 0.8, method: "rolling" },
    { nPeriods: 5, trainRatio: 0.7, method: "rolling" },
  ]
): Array<{ config: (typeof configs)[0]; result: WalkForwardResult }> {
  const results: Array<{ config: (typeof configs)[0]; result: WalkForwardResult }> = [];

  for (const config of configs) {
    try {
      const result = walkForwardValidation({
        returns,
        signals,
        nPeriods: config.nPeriods,
        trainRatio: config.trainRatio,
        method: config.method,
      });

      results.push({ config, result });
    } catch {}
  }

  return results;
}

/**
 * Check if walk-forward result passes validation.
 *
 * @param result - Walk-forward validation result
 * @param thresholds - Custom thresholds (optional)
 * @returns Whether strategy passes walk-forward validation
 */
export function isWalkForwardRobust(
  result: WalkForwardResult,
  thresholds: {
    minEfficiency?: number;
    minConsistency?: number;
  } = {}
): boolean {
  const minEfficiency = thresholds.minEfficiency ?? WF_DEFAULTS.minEfficiency;
  const minConsistency = thresholds.minConsistency ?? WF_DEFAULTS.minConsistency;

  return result.efficiency >= minEfficiency && result.consistency >= minConsistency;
}

/**
 * Evaluate walk-forward result and provide human-readable interpretation.
 *
 * @param result - Walk-forward validation result
 * @returns Human-readable evaluation
 */
export function evaluateWalkForward(result: WalkForwardResult): {
  summary: string;
  recommendation: "accept" | "review" | "reject";
  details: string[];
} {
  const details: string[] = [];

  details.push(`Method: ${result.method}`);
  details.push(`Periods: ${result.nPeriods}`);
  details.push(`Train Ratio: ${(result.trainRatio * 100).toFixed(0)}%`);
  details.push(`Efficiency: ${(result.efficiency * 100).toFixed(1)}%`);
  details.push(`Degradation: ${(result.degradation * 100).toFixed(1)}%`);
  details.push(`Consistency: ${(result.consistency * 100).toFixed(1)}%`);
  details.push(`Mean IS Sharpe: ${result.meanInSampleSharpe.toFixed(3)}`);
  details.push(`Mean OOS Sharpe: ${result.meanOutOfSampleSharpe.toFixed(3)}`);

  let summary: string;
  let recommendation: "accept" | "review" | "reject";

  switch (result.interpretation) {
    case "robust":
      summary =
        "Strategy shows robust out-of-sample performance. " +
        "Walk-forward efficiency and consistency meet thresholds.";
      recommendation = "accept";
      break;
    case "marginal":
      summary =
        "Strategy shows marginal out-of-sample performance. " +
        "Some degradation observed but may still be viable.";
      recommendation = "review";
      break;
    case "overfit":
      summary =
        "Strategy appears overfit to in-sample data. " +
        "Significant performance degradation out-of-sample.";
      recommendation = "reject";
      break;
  }

  return { summary, recommendation, details };
}

/**
 * Calculate minimum data length needed for walk-forward validation.
 *
 * @param nPeriods - Number of periods
 * @param minObsPerPeriod - Minimum observations per period
 * @returns Minimum total observations needed
 */
export function minimumWalkForwardLength(
  nPeriods: number = WF_DEFAULTS.nPeriods,
  minObsPerPeriod: number = WF_DEFAULTS.minObservationsPerPeriod
): number {
  return nPeriods * minObsPerPeriod;
}

/**
 * Compare rolling vs anchored walk-forward results.
 *
 * @param returns - Array of period returns
 * @param signals - Array of signal values
 * @param options - Validation options
 * @returns Comparison of both methods
 */
export function compareWalkForwardMethods(
  returns: number[],
  signals: number[],
  options: {
    nPeriods?: number;
    trainRatio?: number;
  } = {}
): {
  rolling: WalkForwardResult;
  anchored: WalkForwardResult;
  better: "rolling" | "anchored" | "tie";
  explanation: string;
} {
  const nPeriods = options.nPeriods ?? WF_DEFAULTS.nPeriods;
  const trainRatio = options.trainRatio ?? WF_DEFAULTS.trainRatio;

  const rolling = walkForwardValidation({
    returns,
    signals,
    nPeriods,
    trainRatio,
    method: "rolling",
  });

  const anchored = walkForwardValidation({
    returns,
    signals,
    nPeriods,
    trainRatio,
    method: "anchored",
  });

  let better: "rolling" | "anchored" | "tie";
  let explanation: string;

  // Compare based on efficiency and consistency
  const rollingScore = rolling.efficiency + rolling.consistency;
  const anchoredScore = anchored.efficiency + anchored.consistency;

  if (Math.abs(rollingScore - anchoredScore) < 0.05) {
    better = "tie";
    explanation = "Both methods show similar performance.";
  } else if (rollingScore > anchoredScore) {
    better = "rolling";
    explanation =
      "Rolling window performs better, suggesting strategy benefits from adapting to recent market conditions.";
  } else {
    better = "anchored";
    explanation =
      "Anchored window performs better, suggesting strategy benefits from more training data.";
  }

  return { rolling, anchored, better, explanation };
}
