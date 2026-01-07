/**
 * Information Coefficient (IC) Calculator
 *
 * Measures the predictive power of signals by computing correlation between
 * predicted and realized returns. Standard metric for evaluating alpha factors
 * in quantitative finance.
 *
 * @see docs/research/indicator-validation-statistics.md Section 3
 */

import { z } from "zod";

// ============================================
// Constants
// ============================================

/**
 * Default configuration for IC calculation
 */
export const IC_DEFAULTS = {
  /** Minimum IC mean to be considered meaningful */
  minICMean: 0.02,
  /** Maximum IC standard deviation for stable predictions */
  maxICStd: 0.03,
  /** Minimum ICIR for consistent signal quality */
  minICIR: 0.5,
  /** Minimum hit rate for reliable signal */
  minHitRate: 0.52,
  /** Minimum observations for valid correlation */
  minObservations: 10,
  /** Default rolling window for time-series IC */
  defaultWindow: 60,
  /** Default forward horizons for decay analysis */
  defaultHorizons: [1, 5, 10, 21, 63],
} as const;

// ============================================
// Schemas
// ============================================

/**
 * Result of IC calculation for a single period
 */
export const ICValueSchema = z.object({
  /** IC value (Spearman rank correlation) */
  ic: z.number().min(-1).max(1),
  /** Number of observations used */
  nObservations: z.number().int().min(0),
  /** Whether this IC is valid (sufficient observations) */
  isValid: z.boolean(),
});

export type ICValue = z.infer<typeof ICValueSchema>;

/**
 * Summary statistics for a series of IC values
 */
export const ICStatsSchema = z.object({
  /** Mean IC across all periods */
  mean: z.number(),
  /** Standard deviation of IC */
  std: z.number(),
  /** Information Coefficient Information Ratio (mean / std) */
  icir: z.number(),
  /** Percentage of periods with positive IC */
  hitRate: z.number().min(0).max(1),
  /** Total number of IC observations */
  nObservations: z.number().int().min(0),
  /** Number of valid IC observations */
  nValidObservations: z.number().int().min(0),
  /** Interpretation of IC quality */
  interpretation: z.enum(["strong", "moderate", "weak"]),
  /** Whether IC passes minimum thresholds */
  passed: z.boolean(),
});

export type ICStats = z.infer<typeof ICStatsSchema>;

/**
 * Result of IC decay analysis
 */
export const ICDecayResultSchema = z.object({
  /** IC values at each horizon */
  icByHorizon: z.record(z.string(), z.number()),
  /** Horizons analyzed */
  horizons: z.array(z.number()),
  /** Optimal horizon (with highest IC) */
  optimalHorizon: z.number(),
  /** IC at optimal horizon */
  optimalIC: z.number(),
  /** Half-life in periods (where IC drops to 50%) */
  halfLife: z.number().nullable(),
});

export type ICDecayResult = z.infer<typeof ICDecayResultSchema>;

/**
 * Full IC analysis result
 */
export const ICAnalysisResultSchema = z.object({
  /** Summary statistics */
  stats: ICStatsSchema,
  /** Time series of IC values */
  icSeries: z.array(ICValueSchema),
  /** Decay analysis (if performed) */
  decay: ICDecayResultSchema.optional(),
});

export type ICAnalysisResult = z.infer<typeof ICAnalysisResultSchema>;

// ============================================
// Core Functions
// ============================================

/**
 * Calculate Spearman rank correlation between two arrays.
 *
 * @param x - First array of values
 * @param y - Second array of values
 * @returns Spearman rank correlation coefficient
 */
export function spearmanCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length) {
    throw new Error(`Arrays must have same length: ${x.length} vs ${y.length}`);
  }

  const n = x.length;
  if (n < 2) {
    return 0;
  }

  // Compute ranks
  const rankX = computeRanks(x);
  const rankY = computeRanks(y);

  // Calculate Pearson correlation on ranks
  return pearsonCorrelation(rankX, rankY);
}

/**
 * Calculate Pearson correlation coefficient.
 *
 * @param x - First array of values
 * @param y - Second array of values
 * @returns Pearson correlation coefficient
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) {
    return 0;
  }

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    const dx = (x[i] ?? 0) - meanX;
    const dy = (y[i] ?? 0) - meanY;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }

  const denominator = Math.sqrt(sumX2 * sumY2);
  if (denominator < 1e-15) {
    return 0;
  }

  return sumXY / denominator;
}

/**
 * Compute ranks for an array (handling ties with average rank).
 *
 * @param arr - Array of values
 * @returns Array of ranks
 */
export function computeRanks(arr: number[]): number[] {
  const n = arr.length;
  const indexed = arr.map((v, i) => ({ value: v, index: i }));
  indexed.sort((a, b) => a.value - b.value);

  const ranks = new Array<number>(n);
  let i = 0;

  while (i < n) {
    let j = i;
    // Find all tied values
    while (j < n - 1 && indexed[j]?.value === indexed[j + 1]?.value) {
      j++;
    }

    // Average rank for tied values
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      const idx = indexed[k]?.index;
      if (idx !== undefined) {
        ranks[idx] = avgRank;
      }
    }

    i = j + 1;
  }

  return ranks;
}

/**
 * Calculate cross-sectional IC for a single time period.
 *
 * Computes Spearman rank correlation between signals and forward returns
 * across multiple assets at a single point in time.
 *
 * @param signals - Signal values for each asset
 * @param forwardReturns - Forward returns for each asset
 * @returns IC value with metadata
 */
export function crossSectionalIC(signals: number[], forwardReturns: number[]): ICValue {
  if (signals.length !== forwardReturns.length) {
    throw new Error(
      `Signals and returns must have same length: ${signals.length} vs ${forwardReturns.length}`
    );
  }

  // Filter out NaN/undefined values
  const validPairs: Array<{ signal: number; ret: number }> = [];
  for (let i = 0; i < signals.length; i++) {
    const signal = signals[i];
    const ret = forwardReturns[i];
    if (signal !== undefined && ret !== undefined && !Number.isNaN(signal) && !Number.isNaN(ret)) {
      validPairs.push({ signal, ret });
    }
  }

  const nObservations = validPairs.length;
  const isValid = nObservations >= IC_DEFAULTS.minObservations;

  // Need at least 2 observations for correlation
  if (nObservations < 2) {
    return { ic: 0, nObservations, isValid };
  }

  const validSignals = validPairs.map((p) => p.signal);
  const validReturns = validPairs.map((p) => p.ret);

  const ic = spearmanCorrelation(validSignals, validReturns);

  return { ic, nObservations, isValid };
}

/**
 * Calculate rolling time-series IC for a single asset.
 *
 * @param signals - Time series of signal values
 * @param forwardReturns - Time series of forward returns
 * @param window - Rolling window size
 * @returns Array of IC values
 */
export function timeSeriesIC(
  signals: number[],
  forwardReturns: number[],
  window: number = IC_DEFAULTS.defaultWindow
): ICValue[] {
  if (signals.length !== forwardReturns.length) {
    throw new Error(
      `Signals and returns must have same length: ${signals.length} vs ${forwardReturns.length}`
    );
  }

  const results: ICValue[] = [];

  for (let i = window; i <= signals.length; i++) {
    const windowSignals = signals.slice(i - window, i);
    const windowReturns = forwardReturns.slice(i - window, i);

    // Filter NaN values
    const validPairs: Array<{ signal: number; ret: number }> = [];
    for (let j = 0; j < window; j++) {
      const signal = windowSignals[j];
      const ret = windowReturns[j];
      if (
        signal !== undefined &&
        ret !== undefined &&
        !Number.isNaN(signal) &&
        !Number.isNaN(ret)
      ) {
        validPairs.push({ signal, ret });
      }
    }

    const nObservations = validPairs.length;
    const isValid = nObservations >= IC_DEFAULTS.minObservations;

    // Need at least 2 observations for correlation
    if (nObservations < 2) {
      results.push({ ic: 0, nObservations, isValid });
      continue;
    }

    const validSignals = validPairs.map((p) => p.signal);
    const validReturns = validPairs.map((p) => p.ret);

    const ic = spearmanCorrelation(validSignals, validReturns);
    results.push({ ic, nObservations, isValid });
  }

  return results;
}

/**
 * Calculate IC statistics from a series of IC values.
 *
 * @param icValues - Array of IC values
 * @returns IC summary statistics
 */
export function calculateICStats(icValues: ICValue[]): ICStats {
  const validICs = icValues.filter((v) => v.isValid).map((v) => v.ic);
  const n = validICs.length;

  if (n === 0) {
    return {
      mean: 0,
      std: 0,
      icir: 0,
      hitRate: 0,
      nObservations: icValues.length,
      nValidObservations: 0,
      interpretation: "weak",
      passed: false,
    };
  }

  // Mean
  const mean = validICs.reduce((a, b) => a + b, 0) / n;

  // Standard deviation
  const squaredDiffs = validICs.map((ic) => (ic - mean) ** 2);
  const variance = n > 1 ? squaredDiffs.reduce((a, b) => a + b, 0) / (n - 1) : 0;
  const std = Math.sqrt(variance);

  // ICIR
  const icir = std > 1e-15 ? mean / std : 0;

  // Hit rate
  const positiveCount = validICs.filter((ic) => ic > 0).length;
  const hitRate = positiveCount / n;

  // Determine interpretation
  let interpretation: "strong" | "moderate" | "weak";
  if (mean > 0.05 && std < 0.05 && icir > IC_DEFAULTS.minICIR) {
    interpretation = "strong";
  } else if (mean > IC_DEFAULTS.minICMean && icir > 0.3) {
    interpretation = "moderate";
  } else {
    interpretation = "weak";
  }

  // Check if passes thresholds
  const passed =
    mean >= IC_DEFAULTS.minICMean && std <= IC_DEFAULTS.maxICStd && icir >= IC_DEFAULTS.minICIR;

  return {
    mean,
    std,
    icir,
    hitRate,
    nObservations: icValues.length,
    nValidObservations: n,
    interpretation,
    passed,
  };
}

/**
 * Analyze IC decay across different forward-looking horizons.
 *
 * @param signals - 2D array of signals [time][asset]
 * @param returns - 2D array of returns [time][asset]
 * @param horizons - Forward horizons to analyze
 * @returns IC decay analysis result
 */
export function analyzeICDecay(
  signals: number[][],
  returns: number[][],
  horizons: readonly number[] = IC_DEFAULTS.defaultHorizons
): ICDecayResult {
  if (signals.length !== returns.length) {
    throw new Error(
      `Signals and returns must have same time dimension: ${signals.length} vs ${returns.length}`
    );
  }

  const icByHorizon: Record<string, number> = {};

  for (const h of horizons) {
    const dailyICs: number[] = [];

    for (let t = 0; t < signals.length - h; t++) {
      const signalsAtT = signals[t];
      if (!signalsAtT) {
        continue;
      }

      // Calculate cumulative forward returns for horizon h
      const nAssets = signalsAtT.length;
      const forwardReturns: number[] = new Array(nAssets).fill(0);

      for (let dt = 1; dt <= h; dt++) {
        const returnsRow = returns[t + dt];
        if (returnsRow) {
          for (let a = 0; a < nAssets; a++) {
            const ret = returnsRow[a];
            if (ret !== undefined) {
              forwardReturns[a] = (forwardReturns[a] ?? 0) + ret;
            }
          }
        }
      }

      // Calculate IC for this time point
      const icResult = crossSectionalIC(signalsAtT, forwardReturns);
      if (icResult.isValid) {
        dailyICs.push(icResult.ic);
      }
    }

    // Mean IC for this horizon
    if (dailyICs.length > 0) {
      icByHorizon[String(h)] = dailyICs.reduce((a, b) => a + b, 0) / dailyICs.length;
    } else {
      icByHorizon[String(h)] = 0;
    }
  }

  // Find optimal horizon
  let optimalHorizon = horizons[0] ?? 1;
  let optimalIC = icByHorizon[String(optimalHorizon)] ?? 0;

  for (const h of horizons) {
    const ic = icByHorizon[String(h)] ?? 0;
    if (ic > optimalIC) {
      optimalIC = ic;
      optimalHorizon = h;
    }
  }

  // Calculate half-life (where IC drops to 50% of optimal)
  let halfLife: number | null = null;
  const targetIC = optimalIC / 2;

  if (optimalIC > 0) {
    for (let i = 0; i < horizons.length - 1; i++) {
      const h1 = horizons[i];
      const h2 = horizons[i + 1];
      if (h1 === undefined || h2 === undefined) {
        continue;
      }
      const ic1 = icByHorizon[String(h1)] ?? 0;
      const ic2 = icByHorizon[String(h2)] ?? 0;

      if (ic1 >= targetIC && ic2 <= targetIC) {
        // Linear interpolation
        const ratio = (ic1 - targetIC) / (ic1 - ic2);
        halfLife = h1 + ratio * (h2 - h1);
        break;
      }
    }
  }

  return {
    icByHorizon,
    horizons: [...horizons],
    optimalHorizon,
    optimalIC,
    halfLife,
  };
}

/**
 * Perform full IC analysis on cross-sectional data.
 *
 * @param signals - 2D array of signals [time][asset]
 * @param forwardReturns - 2D array of forward returns [time][asset]
 * @param options - Analysis options
 * @returns Complete IC analysis result
 */
export function analyzeIC(
  signals: number[][],
  forwardReturns: number[][],
  options: {
    includeDecay?: boolean;
    horizons?: number[];
    returns?: number[][]; // For decay analysis (raw returns, not forward)
  } = {}
): ICAnalysisResult {
  if (signals.length !== forwardReturns.length) {
    throw new Error(
      `Signals and returns must have same time dimension: ${signals.length} vs ${forwardReturns.length}`
    );
  }

  // Calculate IC for each time period
  const icSeries: ICValue[] = [];
  for (let t = 0; t < signals.length; t++) {
    const signalsAtT = signals[t];
    const returnsAtT = forwardReturns[t];

    if (signalsAtT && returnsAtT) {
      icSeries.push(crossSectionalIC(signalsAtT, returnsAtT));
    }
  }

  // Calculate summary statistics
  const stats = calculateICStats(icSeries);

  // Optionally perform decay analysis
  let decay: ICDecayResult | undefined;
  if (options.includeDecay && options.returns) {
    decay = analyzeICDecay(signals, options.returns, options.horizons);
  }

  return { stats, icSeries, decay };
}

/**
 * Evaluate IC analysis result and provide human-readable interpretation.
 *
 * @param result - IC analysis result
 * @returns Human-readable evaluation
 */
export function evaluateIC(result: ICAnalysisResult): {
  summary: string;
  recommendation: "accept" | "review" | "reject";
  details: string[];
} {
  const { stats } = result;
  const details: string[] = [];

  details.push(`Mean IC: ${stats.mean.toFixed(4)}`);
  details.push(`IC Std: ${stats.std.toFixed(4)}`);
  details.push(`ICIR: ${stats.icir.toFixed(3)}`);
  details.push(`Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%`);
  details.push(`Valid Observations: ${stats.nValidObservations} / ${stats.nObservations}`);

  if (result.decay) {
    details.push(`Optimal Horizon: ${result.decay.optimalHorizon} periods`);
    details.push(`IC at Optimal: ${result.decay.optimalIC.toFixed(4)}`);
    if (result.decay.halfLife !== null) {
      details.push(`Half-life: ${result.decay.halfLife.toFixed(1)} periods`);
    }
  }

  let summary: string;
  let recommendation: "accept" | "review" | "reject";

  switch (stats.interpretation) {
    case "strong":
      summary = "Signal shows strong predictive power with consistent IC across time.";
      recommendation = "accept";
      break;
    case "moderate":
      summary = "Signal shows moderate predictive power. May require additional validation.";
      recommendation = "review";
      break;
    case "weak":
      summary = "Signal shows weak predictive power. Consider rejecting or improving the signal.";
      recommendation = "reject";
      break;
  }

  return { summary, recommendation, details };
}

/**
 * Check if IC analysis result passes minimum thresholds.
 *
 * @param result - IC analysis result
 * @param thresholds - Custom thresholds (optional)
 * @returns Whether IC passes thresholds
 */
export function isICSignificant(
  result: ICAnalysisResult,
  thresholds: {
    minMean?: number;
    maxStd?: number;
    minICIR?: number;
  } = {}
): boolean {
  const { stats } = result;

  const minMean = thresholds.minMean ?? IC_DEFAULTS.minICMean;
  const maxStd = thresholds.maxStd ?? IC_DEFAULTS.maxICStd;
  const minICIR = thresholds.minICIR ?? IC_DEFAULTS.minICIR;

  return stats.mean >= minMean && stats.std <= maxStd && stats.icir >= minICIR;
}
