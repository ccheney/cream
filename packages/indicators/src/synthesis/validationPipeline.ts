/**
 * Validation Pipeline Orchestrator
 *
 * Combines all validation components (DSR, PBO, IC, walk-forward, orthogonality)
 * into a unified pipeline that validates new indicators before deployment.
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md (lines 527-579)
 */

import { z } from "zod/v4";
import { calculateDSR, type DSRResult, expectedMaxSharpe } from "./dsr.js";
import { calculateICStats, IC_DEFAULTS, timeSeriesIC } from "./ic.js";
import {
  checkOrthogonality,
  ORTHOGONALITY_DEFAULTS,
  type OrthogonalityResult,
} from "./orthogonality.js";
import { computePBO, PBO_DEFAULTS, type PBOResult } from "./pbo.js";
import { type WalkForwardResult, WF_DEFAULTS, walkForwardValidation } from "./walkForward.js";

// ============================================
// Constants and Defaults
// ============================================

/**
 * Default thresholds for validation gates.
 */
export const VALIDATION_DEFAULTS = {
  /** DSR p-value threshold for significance */
  dsrPValueThreshold: 0.95,
  /** PBO threshold (reject if above) */
  pboThreshold: 0.5,
  /** IC mean threshold (accept if above) */
  icMeanThreshold: 0.02,
  /** IC std threshold (accept if below) */
  icStdThreshold: 0.03,
  /** ICIR threshold (accept if above) */
  icirThreshold: 0.5,
  /** Walk-forward efficiency threshold */
  wfEfficiencyThreshold: 0.5,
  /** Walk-forward consistency threshold */
  wfConsistencyThreshold: 0.5,
  /** Maximum acceptable correlation */
  maxCorrelation: ORTHOGONALITY_DEFAULTS.maxCorrelation,
  /** Maximum acceptable VIF */
  maxVIF: ORTHOGONALITY_DEFAULTS.maxVIF,
} as const;

// ============================================
// Schemas
// ============================================

/**
 * Schema for DSR validation result.
 */
export const DSRGateResultSchema = z.object({
  value: z.number(),
  pValue: z.number(),
  nTrials: z.number().int().positive(),
  nObservations: z.number().int().positive(),
  passed: z.boolean(),
  reason: z.string().optional(),
});

export type DSRGateResult = z.infer<typeof DSRGateResultSchema>;

/**
 * Schema for PBO validation result.
 */
export const PBOGateResultSchema = z.object({
  value: z.number(),
  nSplits: z.number().int().positive(),
  nCombinations: z.number().int().positive(),
  passed: z.boolean(),
  reason: z.string().optional(),
});

export type PBOGateResult = z.infer<typeof PBOGateResultSchema>;

/**
 * Schema for IC validation result.
 */
export const ICGateResultSchema = z.object({
  mean: z.number(),
  std: z.number(),
  icir: z.number(),
  hitRate: z.number(),
  nObservations: z.number().int().nonnegative(),
  passed: z.boolean(),
  reason: z.string().optional(),
});

export type ICGateResult = z.infer<typeof ICGateResultSchema>;

/**
 * Schema for walk-forward validation result.
 */
export const WalkForwardGateResultSchema = z.object({
  efficiency: z.number(),
  consistency: z.number(),
  degradation: z.number(),
  nPeriods: z.number().int().positive(),
  passed: z.boolean(),
  reason: z.string().optional(),
});

export type WalkForwardGateResult = z.infer<typeof WalkForwardGateResultSchema>;

/**
 * Schema for orthogonality validation result.
 */
export const OrthogonalityGateResultSchema = z.object({
  maxCorrelation: z.number(),
  correlatedWith: z.string().nullable(),
  vif: z.number().nullable(),
  nExistingIndicators: z.number().int().nonnegative(),
  passed: z.boolean(),
  reason: z.string().optional(),
});

export type OrthogonalityGateResult = z.infer<typeof OrthogonalityGateResultSchema>;

/**
 * Schema for trial counting information.
 */
export const TrialInfoSchema = z.object({
  attempted: z.number().int().nonnegative(),
  selected: z.number().int().nonnegative(),
  multipleTestingPenalty: z.number(),
});

export type TrialInfo = z.infer<typeof TrialInfoSchema>;

/**
 * Schema for complete validation result.
 */
export const ValidationResultSchema = z.object({
  /** Indicator identifier */
  indicatorId: z.string(),
  /** Timestamp of validation */
  timestamp: z.string().datetime(),
  /** DSR gate result */
  dsr: DSRGateResultSchema,
  /** PBO gate result */
  pbo: PBOGateResultSchema,
  /** IC gate result */
  ic: ICGateResultSchema,
  /** Walk-forward gate result */
  walkForward: WalkForwardGateResultSchema,
  /** Orthogonality gate result */
  orthogonality: OrthogonalityGateResultSchema,
  /** Trial counting information */
  trials: TrialInfoSchema,
  /** Overall validation passed */
  overallPassed: z.boolean(),
  /** Number of gates passed */
  gatesPassed: z.number().int().nonnegative(),
  /** Total number of gates */
  totalGates: z.number().int().positive(),
  /** Pass rate (gatesPassed / totalGates) */
  passRate: z.number().min(0).max(1),
  /** Summary of validation */
  summary: z.string(),
  /** Recommendations */
  recommendations: z.array(z.string()),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

/**
 * Input schema for validation pipeline.
 */
export const ValidationInputSchema = z.object({
  /** Unique identifier for the indicator */
  indicatorId: z.string(),
  /** Indicator signal values (predictions/scores) */
  signals: z.array(z.number()),
  /** Corresponding asset returns */
  returns: z.array(z.number()),
  /** Forward returns for IC calculation (same length as signals) */
  forwardReturns: z.array(z.number()).optional(),
  /** Number of trials attempted to find this indicator */
  nTrials: z.number().int().positive().optional().default(1),
  /** Existing indicator values for orthogonality check */
  existingIndicators: z.record(z.string(), z.array(z.number())).optional(),
  /** Custom thresholds (overrides defaults) */
  thresholds: z
    .object({
      dsrPValue: z.number().min(0).max(1).optional(),
      pbo: z.number().min(0).max(1).optional(),
      icMean: z.number().optional(),
      icStd: z.number().optional(),
      wfEfficiency: z.number().optional(),
      maxCorrelation: z.number().min(0).max(1).optional(),
      maxVIF: z.number().positive().optional(),
    })
    .optional(),
});

export type ValidationInput = z.input<typeof ValidationInputSchema>;

// ============================================
// Gate Runner Functions
// ============================================

/**
 * Run DSR validation gate.
 */
function runDSRGate(
  signals: number[],
  returns: number[],
  nTrials: number,
  threshold: number
): DSRGateResult {
  // Compute strategy returns
  const strategyReturns = signals.map((s, i) => {
    const r = returns[i] ?? 0;
    return Math.sign(s) * r;
  });

  // Calculate DSR
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
function runPBOGate(signals: number[], returns: number[], threshold: number): PBOGateResult {
  // Check if we have enough data for PBO calculation
  const minRequired = PBO_DEFAULTS.nSplits * PBO_DEFAULTS.minObservationsPerSplit;
  if (returns.length < minRequired) {
    // Insufficient data - skip PBO gate and pass with warning
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
function runICGate(
  signals: number[],
  forwardReturns: number[],
  meanThreshold: number,
  stdThreshold: number
): ICGateResult {
  // Use timeSeriesIC for 1D arrays, then calculate stats
  const icSeries = timeSeriesIC(signals, forwardReturns, IC_DEFAULTS.defaultWindow);
  const stats = calculateICStats(icSeries);

  // Check if IC passes thresholds
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
function runWalkForwardGate(
  signals: number[],
  returns: number[],
  efficiencyThreshold: number
): WalkForwardGateResult {
  // Check if we have enough data for walk-forward validation
  const minRequired = WF_DEFAULTS.nPeriods * WF_DEFAULTS.minObservationsPerPeriod;
  if (returns.length < minRequired) {
    // Insufficient data - skip walk-forward gate and pass with warning
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
function runOrthogonalityGate(
  signals: number[],
  existingIndicators: Record<string, number[]>,
  maxCorrelation: number,
  maxVIF: number
): OrthogonalityGateResult {
  // If no existing indicators, automatically pass
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

// ============================================
// Helper Functions
// ============================================

/**
 * Compute annualized Sharpe ratio from daily returns.
 */
function computeAnnualizedSharpe(returns: number[]): number {
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
 * Generate summary of validation results.
 */
function generateSummary(
  gatesPassed: number,
  totalGates: number,
  results: {
    dsr: DSRGateResult;
    pbo: PBOGateResult;
    ic: ICGateResult;
    walkForward: WalkForwardGateResult;
    orthogonality: OrthogonalityGateResult;
  }
): string {
  if (gatesPassed === totalGates) {
    return "All validation gates passed. Indicator ready for paper trading.";
  }

  const failures: string[] = [];
  if (!results.dsr.passed) {
    failures.push("DSR");
  }
  if (!results.pbo.passed) {
    failures.push("PBO");
  }
  if (!results.ic.passed) {
    failures.push("IC");
  }
  if (!results.walkForward.passed) {
    failures.push("Walk-Forward");
  }
  if (!results.orthogonality.passed) {
    failures.push("Orthogonality");
  }

  return `Failed ${failures.length} gate(s): ${failures.join(", ")}. Indicator not ready for deployment.`;
}

/**
 * Generate recommendations based on validation results.
 */
function generateRecommendations(results: {
  dsr: DSRGateResult;
  pbo: PBOGateResult;
  ic: ICGateResult;
  walkForward: WalkForwardGateResult;
  orthogonality: OrthogonalityGateResult;
}): string[] {
  const recommendations: string[] = [];

  if (!results.dsr.passed) {
    if (results.dsr.pValue < 0.5) {
      recommendations.push(
        "DSR failure: Strategy performance likely due to chance. Consider fundamental redesign."
      );
    } else {
      recommendations.push(
        "DSR marginal: Collect more data or reduce number of trials to improve significance."
      );
    }
  }

  if (!results.pbo.passed) {
    if (results.pbo.value > 0.7) {
      recommendations.push(
        "High overfitting risk: Strategy heavily optimized on in-sample data. Simplify parameters."
      );
    } else {
      recommendations.push(
        "Moderate overfitting: Consider reducing complexity or increasing validation period."
      );
    }
  }

  if (!results.ic.passed) {
    if (results.ic.mean < 0) {
      recommendations.push(
        "Negative IC: Signal is counterproductive. Investigate signal logic or reverse direction."
      );
    } else if (results.ic.std > 0.05) {
      recommendations.push(
        "Unstable IC: Signal predictive power varies too much. Consider regime-specific models."
      );
    } else {
      recommendations.push(
        "Weak IC: Signal has insufficient predictive power. Enhance feature engineering."
      );
    }
  }

  if (!results.walkForward.passed) {
    if (results.walkForward.efficiency < 0.3) {
      recommendations.push(
        "Severe degradation: OOS performance significantly worse than IS. Strategy is overfit."
      );
    } else {
      recommendations.push(
        "Walk-forward degradation: Consider anchored windows or longer training periods."
      );
    }
  }

  if (!results.orthogonality.passed) {
    if (results.orthogonality.maxCorrelation > 0.8) {
      recommendations.push(
        `High correlation with ${results.orthogonality.correlatedWith}. Consider orthogonalization or removing redundant indicator.`
      );
    } else if (results.orthogonality.vif && results.orthogonality.vif > 10) {
      recommendations.push(
        "Severe multicollinearity detected. Reduce factor set or use regularization."
      );
    } else {
      recommendations.push("Moderate overlap with existing indicators. Monitor for redundancy.");
    }
  }

  if (recommendations.length === 0) {
    recommendations.push("All gates passed. Proceed to paper trading phase.");
  }

  return recommendations;
}

// ============================================
// Main Pipeline Function
// ============================================

/**
 * Run the complete validation pipeline on an indicator.
 */
export function runValidationPipeline(input: ValidationInput): ValidationResult {
  const parsed = ValidationInputSchema.parse(input);
  const { indicatorId, signals, returns, forwardReturns, nTrials, existingIndicators, thresholds } =
    parsed;

  // Use custom thresholds or defaults
  const dsrThreshold = thresholds?.dsrPValue ?? VALIDATION_DEFAULTS.dsrPValueThreshold;
  const pboThreshold = thresholds?.pbo ?? VALIDATION_DEFAULTS.pboThreshold;
  const icMeanThreshold = thresholds?.icMean ?? VALIDATION_DEFAULTS.icMeanThreshold;
  const icStdThreshold = thresholds?.icStd ?? VALIDATION_DEFAULTS.icStdThreshold;
  const wfThreshold = thresholds?.wfEfficiency ?? VALIDATION_DEFAULTS.wfEfficiencyThreshold;
  const maxCorr = thresholds?.maxCorrelation ?? VALIDATION_DEFAULTS.maxCorrelation;
  const maxVIF = thresholds?.maxVIF ?? VALIDATION_DEFAULTS.maxVIF;

  // Use forward returns if provided, otherwise compute from returns
  const fwdReturns = forwardReturns ?? returns.slice(1).concat([0]);

  // Run all validation gates
  const dsrResult = runDSRGate(signals, returns, nTrials, dsrThreshold);
  const pboResult = runPBOGate(signals, returns, pboThreshold);
  const icResult = runICGate(signals, fwdReturns, icMeanThreshold, icStdThreshold);
  const wfResult = runWalkForwardGate(signals, returns, wfThreshold);
  const orthResult = runOrthogonalityGate(signals, existingIndicators ?? {}, maxCorr, maxVIF);

  // Count passed gates
  const gates = [
    dsrResult.passed,
    pboResult.passed,
    icResult.passed,
    wfResult.passed,
    orthResult.passed,
  ];
  const gatesPassed = gates.filter(Boolean).length;
  const totalGates = gates.length;
  const passRate = gatesPassed / totalGates;
  const overallPassed = gatesPassed === totalGates;

  // Generate summary and recommendations
  const summary = generateSummary(gatesPassed, totalGates, {
    dsr: dsrResult,
    pbo: pboResult,
    ic: icResult,
    walkForward: wfResult,
    orthogonality: orthResult,
  });

  const recommendations = generateRecommendations({
    dsr: dsrResult,
    pbo: pboResult,
    ic: icResult,
    walkForward: wfResult,
    orthogonality: orthResult,
  });

  // Compute multiple testing penalty using expected max Sharpe
  const multipleTestingPenalty = expectedMaxSharpe(nTrials);

  return {
    indicatorId,
    timestamp: new Date().toISOString(),
    dsr: dsrResult,
    pbo: pboResult,
    ic: icResult,
    walkForward: wfResult,
    orthogonality: orthResult,
    trials: {
      attempted: nTrials,
      selected: 1, // This indicator was selected
      multipleTestingPenalty,
    },
    overallPassed,
    gatesPassed,
    totalGates,
    passRate,
    summary,
    recommendations,
  };
}

/**
 * Quick check if an indicator passes all validation gates.
 */
export function isIndicatorValid(input: ValidationInput): boolean {
  const result = runValidationPipeline(input);
  return result.overallPassed;
}

/**
 * Validate multiple indicators and return ranked results.
 */
export function validateAndRank(
  indicators: Array<{ id: string; signals: number[] }>,
  returns: number[],
  existingIndicators?: Record<string, number[]>
): Array<{ indicator: { id: string; signals: number[] }; result: ValidationResult }> {
  const results = indicators.map((indicator) => ({
    indicator,
    result: runValidationPipeline({
      indicatorId: indicator.id,
      signals: indicator.signals,
      returns,
      nTrials: indicators.length,
      existingIndicators,
    }),
  }));

  // Sort by pass rate descending, then by DSR p-value descending
  results.sort((a, b) => {
    if (b.result.passRate !== a.result.passRate) {
      return b.result.passRate - a.result.passRate;
    }
    return b.result.dsr.pValue - a.result.dsr.pValue;
  });

  return results;
}

/**
 * Calculate expected survival rate given validation thresholds.
 * Based on plan: approximately 4% of generated indicators should pass all gates.
 */
export function estimateSurvivalRate(
  dsrPValue = 0.95,
  pboThreshold = 0.5,
  icMeanThreshold = 0.02,
  wfEfficiencyThreshold = 0.5,
  orthThreshold = 0.7
): number {
  // Rough estimates for each gate's pass rate under random signals
  // These are approximations based on research literature
  const dsrPassRate = 1 - dsrPValue; // ~5%
  const pboPassRate = pboThreshold; // ~50%
  // Higher IC threshold means stricter filter, lower pass rate
  const icPassRate = Math.max(0.05, 0.3 - icMeanThreshold * 5); // ~20% at 0.02
  // Higher efficiency threshold means stricter filter, lower pass rate
  const wfPassRate = Math.max(0.1, 0.8 - wfEfficiencyThreshold); // ~30% at 0.5
  const orthPassRate = 1 - orthThreshold; // ~30% for low correlation

  // Combined survival rate (assuming independence)
  return dsrPassRate * pboPassRate * icPassRate * wfPassRate * orthPassRate;
}

/**
 * Evaluate a validation result and determine next action.
 */
export function evaluateValidation(result: ValidationResult): {
  action: "deploy" | "retry" | "retire";
  confidence: "high" | "medium" | "low";
  explanation: string;
} {
  if (result.overallPassed) {
    return {
      action: "deploy",
      confidence: result.passRate >= 0.8 ? "high" : "medium",
      explanation: "All validation gates passed. Indicator ready for paper trading.",
    };
  }

  // Check if close to passing
  const closeToPass = result.passRate >= 0.6;

  if (closeToPass) {
    // Identify which gates failed
    const minorFailures =
      (!result.dsr.passed && result.dsr.pValue > 0.9) ||
      (!result.pbo.passed && result.pbo.value < 0.55) ||
      (!result.walkForward.passed && result.walkForward.efficiency > 0.45);

    if (minorFailures) {
      return {
        action: "retry",
        confidence: "medium",
        explanation:
          "Close to validation threshold. Consider parameter tuning or collecting more data.",
      };
    }
  }

  // Check for critical failures
  const criticalFailure =
    result.dsr.pValue < 0.5 ||
    result.pbo.value > 0.7 ||
    result.ic.mean < 0 ||
    result.walkForward.efficiency < 0.3;

  if (criticalFailure) {
    return {
      action: "retire",
      confidence: "high",
      explanation:
        "Critical validation failure. Indicator unlikely to perform well in live trading.",
    };
  }

  return {
    action: "retry",
    confidence: "low",
    explanation: "Multiple validation failures. Consider significant redesign before retry.",
  };
}
