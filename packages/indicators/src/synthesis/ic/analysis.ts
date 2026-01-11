/**
 * IC Analysis and Aggregation
 *
 * Higher-level functions for IC analysis, decay analysis, and evaluation.
 */

import { calculateICStats, crossSectionalIC } from "./metrics.js";
import {
  IC_DEFAULTS,
  type ICAnalysisOptions,
  type ICAnalysisResult,
  type ICDecayResult,
  type ICEvaluation,
  type ICSignificanceThresholds,
  type ICValue,
} from "./types.js";

/**
 * Analyze IC decay across different forward-looking horizons.
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

      const icResult = crossSectionalIC(signalsAtT, forwardReturns);
      if (icResult.isValid) {
        dailyICs.push(icResult.ic);
      }
    }

    if (dailyICs.length > 0) {
      icByHorizon[String(h)] = dailyICs.reduce((a, b) => a + b, 0) / dailyICs.length;
    } else {
      icByHorizon[String(h)] = 0;
    }
  }

  let optimalHorizon = horizons[0] ?? 1;
  let optimalIC = icByHorizon[String(optimalHorizon)] ?? 0;

  for (const h of horizons) {
    const ic = icByHorizon[String(h)] ?? 0;
    if (ic > optimalIC) {
      optimalIC = ic;
      optimalHorizon = h;
    }
  }

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
 */
export function analyzeIC(
  signals: number[][],
  forwardReturns: number[][],
  options: ICAnalysisOptions = {}
): ICAnalysisResult {
  if (signals.length !== forwardReturns.length) {
    throw new Error(
      `Signals and returns must have same time dimension: ${signals.length} vs ${forwardReturns.length}`
    );
  }

  const icSeries: ICValue[] = [];
  for (let t = 0; t < signals.length; t++) {
    const signalsAtT = signals[t];
    const returnsAtT = forwardReturns[t];

    if (signalsAtT && returnsAtT) {
      icSeries.push(crossSectionalIC(signalsAtT, returnsAtT));
    }
  }

  const stats = calculateICStats(icSeries);

  let decay: ICDecayResult | undefined;
  if (options.includeDecay && options.returns) {
    decay = analyzeICDecay(signals, options.returns, options.horizons);
  }

  return { stats, icSeries, decay };
}

/**
 * Evaluate IC analysis result and provide human-readable interpretation.
 */
export function evaluateIC(result: ICAnalysisResult): ICEvaluation {
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
 */
export function isICSignificant(
  result: ICAnalysisResult,
  thresholds: ICSignificanceThresholds = {}
): boolean {
  const { stats } = result;

  const minMean = thresholds.minMean ?? IC_DEFAULTS.minICMean;
  const maxStd = thresholds.maxStd ?? IC_DEFAULTS.maxICStd;
  const minICIR = thresholds.minICIR ?? IC_DEFAULTS.minICIR;

  return stats.mean >= minMean && stats.std <= maxStd && stats.icir >= minICIR;
}
