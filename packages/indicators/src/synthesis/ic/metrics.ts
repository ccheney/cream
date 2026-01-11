/**
 * IC Metric Calculations
 *
 * Functions for calculating IC values from signals and returns.
 */

import { spearmanCorrelation } from "./statistics.js";
import { IC_DEFAULTS, type ICStats, type ICValue } from "./types.js";

/**
 * Calculate cross-sectional IC for a single time period.
 *
 * Computes Spearman rank correlation between signals and forward returns
 * across multiple assets at a single point in time.
 */
export function crossSectionalIC(signals: number[], forwardReturns: number[]): ICValue {
  if (signals.length !== forwardReturns.length) {
    throw new Error(
      `Signals and returns must have same length: ${signals.length} vs ${forwardReturns.length}`
    );
  }

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

  const mean = validICs.reduce((a, b) => a + b, 0) / n;

  const squaredDiffs = validICs.map((ic) => (ic - mean) ** 2);
  const variance = n > 1 ? squaredDiffs.reduce((a, b) => a + b, 0) / (n - 1) : 0;
  const std = Math.sqrt(variance);

  const icir = std > 1e-15 ? mean / std : 0;

  const positiveCount = validICs.filter((ic) => ic > 0).length;
  const hitRate = positiveCount / n;

  let interpretation: "strong" | "moderate" | "weak";
  if (mean > 0.05 && std < 0.05 && icir > IC_DEFAULTS.minICIR) {
    interpretation = "strong";
  } else if (mean > IC_DEFAULTS.minICMean && icir > 0.3) {
    interpretation = "moderate";
  } else {
    interpretation = "weak";
  }

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
