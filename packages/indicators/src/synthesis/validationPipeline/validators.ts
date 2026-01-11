/**
 * Validation Gate Implementations
 *
 * Individual validation step implementations for DSR, PBO, IC, walk-forward, and orthogonality.
 */

import { calculateDSR, type DSRResult } from "../dsr.js";
import { calculateICStats, IC_DEFAULTS, timeSeriesIC } from "../ic/index.js";
import { checkOrthogonality, type OrthogonalityResult } from "../orthogonality.js";
import { computePBO, PBO_DEFAULTS, type PBOResult } from "../pbo.js";
import { type WalkForwardResult, WF_DEFAULTS, walkForwardValidation } from "../walkForward.js";
import type {
  DSRGateResult,
  ICGateResult,
  OrthogonalityGateResult,
  PBOGateResult,
  WalkForwardGateResult,
} from "./types.js";

/**
 * Compute annualized Sharpe ratio from daily returns.
 */
export function computeAnnualizedSharpe(returns: number[]): number {
  if (returns.length === 0) {
    return 0;
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);

  if (std < 1e-15) {
    return 0;
  }

  // Annualize assuming daily returns
  return (mean / std) * Math.sqrt(252);
}

/**
 * Run DSR validation gate.
 */
export function runDSRGate(
  signals: number[],
  returns: number[],
  nTrials: number,
  threshold: number
): DSRGateResult {
  const strategyReturns = signals.map((s, i) => {
    const r = returns[i] ?? 0;
    return Math.sign(s) * r;
  });

  const dsrResult: DSRResult = calculateDSR({
    observedSharpe: computeAnnualizedSharpe(strategyReturns),
    nTrials,
    nObservations: strategyReturns.length,
  });

  const passed = dsrResult.pValue >= threshold;

  return {
    value: dsrResult.dsr,
    pValue: dsrResult.pValue,
    nTrials,
    nObservations: strategyReturns.length,
    passed,
    reason: passed
      ? undefined
      : `DSR p-value (${dsrResult.pValue.toFixed(3)}) below threshold (${threshold})`,
  };
}

/**
 * Run PBO validation gate.
 */
export function runPBOGate(signals: number[], returns: number[], threshold: number): PBOGateResult {
  const minRequired = PBO_DEFAULTS.nSplits * PBO_DEFAULTS.minObservationsPerSplit;
  if (returns.length < minRequired) {
    return {
      value: 0,
      nSplits: PBO_DEFAULTS.nSplits,
      nCombinations: 0,
      passed: true,
      reason: `Insufficient data for PBO (${returns.length} < ${minRequired} required). Skipped.`,
    };
  }

  const pboResult: PBOResult = computePBO({
    returns,
    signals,
    nSplits: PBO_DEFAULTS.nSplits,
  });

  const passed = pboResult.pbo < threshold;

  return {
    value: pboResult.pbo,
    nSplits: PBO_DEFAULTS.nSplits,
    nCombinations: pboResult.nCombinations,
    passed,
    reason: passed
      ? undefined
      : `PBO (${pboResult.pbo.toFixed(3)}) exceeds threshold (${threshold})`,
  };
}

/**
 * Run IC validation gate.
 */
export function runICGate(
  signals: number[],
  forwardReturns: number[],
  meanThreshold: number,
  stdThreshold: number
): ICGateResult {
  const icSeries = timeSeriesIC(signals, forwardReturns, IC_DEFAULTS.defaultWindow);
  const stats = calculateICStats(icSeries);

  const meanPassed = stats.mean >= meanThreshold;
  const stdPassed = stats.std <= stdThreshold;
  const passed = meanPassed && stdPassed;

  let reason: string | undefined;
  if (!passed) {
    const issues: string[] = [];
    if (!meanPassed) {
      issues.push(`IC mean (${stats.mean.toFixed(4)}) below ${meanThreshold}`);
    }
    if (!stdPassed) {
      issues.push(`IC std (${stats.std.toFixed(4)}) above ${stdThreshold}`);
    }
    reason = issues.join("; ");
  }

  return {
    mean: stats.mean,
    std: stats.std,
    icir: stats.icir,
    hitRate: stats.hitRate,
    nObservations: stats.nObservations,
    passed,
    reason,
  };
}

/**
 * Run walk-forward validation gate.
 */
export function runWalkForwardGate(
  signals: number[],
  returns: number[],
  efficiencyThreshold: number
): WalkForwardGateResult {
  const minRequired = WF_DEFAULTS.nPeriods * WF_DEFAULTS.minObservationsPerPeriod;
  if (returns.length < minRequired) {
    return {
      efficiency: 1,
      consistency: 1,
      degradation: 0,
      nPeriods: WF_DEFAULTS.nPeriods,
      passed: true,
      reason: `Insufficient data for walk-forward (${returns.length} < ${minRequired} required). Skipped.`,
    };
  }

  const wfResult: WalkForwardResult = walkForwardValidation({
    returns,
    signals,
    nPeriods: WF_DEFAULTS.nPeriods,
    trainRatio: WF_DEFAULTS.trainRatio,
    method: "rolling",
  });

  const passed = wfResult.efficiency >= efficiencyThreshold;

  return {
    efficiency: wfResult.efficiency,
    consistency: wfResult.consistency,
    degradation: wfResult.degradation,
    nPeriods: wfResult.nPeriods,
    passed,
    reason: passed
      ? undefined
      : `Walk-forward efficiency (${wfResult.efficiency.toFixed(3)}) below threshold (${efficiencyThreshold})`,
  };
}

/**
 * Run orthogonality validation gate.
 */
export function runOrthogonalityGate(
  signals: number[],
  existingIndicators: Record<string, number[]>,
  maxCorrelation: number,
  maxVIF: number
): OrthogonalityGateResult {
  const nExisting = Object.keys(existingIndicators).length;
  if (nExisting === 0) {
    return {
      maxCorrelation: 0,
      correlatedWith: null,
      vif: null,
      nExistingIndicators: 0,
      passed: true,
    };
  }

  const orthResult: OrthogonalityResult = checkOrthogonality({
    newIndicator: signals,
    existingIndicators,
    maxCorrelation,
    maxVIF,
  });

  return {
    maxCorrelation: orthResult.maxCorrelationFound,
    correlatedWith: orthResult.mostCorrelatedWith,
    vif: orthResult.vif?.vif ?? null,
    nExistingIndicators: nExisting,
    passed: orthResult.isOrthogonal,
    reason: orthResult.isOrthogonal ? undefined : orthResult.recommendations[0],
  };
}
