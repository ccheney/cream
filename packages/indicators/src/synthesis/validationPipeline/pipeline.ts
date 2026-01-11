/**
 * Validation Pipeline Orchestration
 *
 * Core pipeline logic that combines all validation gates into a unified workflow.
 */

import { expectedMaxSharpe } from "../dsr.js";
import { generateRecommendations, generateSummary } from "./reporting.js";
import {
  VALIDATION_DEFAULTS,
  type ValidationInput,
  ValidationInputSchema,
  type ValidationResult,
} from "./types.js";
import {
  runDSRGate,
  runICGate,
  runOrthogonalityGate,
  runPBOGate,
  runWalkForwardGate,
} from "./validators.js";

/**
 * Run the complete validation pipeline on an indicator.
 */
export function runValidationPipeline(input: ValidationInput): ValidationResult {
  const parsed = ValidationInputSchema.parse(input);
  const { indicatorId, signals, returns, forwardReturns, nTrials, existingIndicators, thresholds } =
    parsed;

  const dsrThreshold = thresholds?.dsrPValue ?? VALIDATION_DEFAULTS.dsrPValueThreshold;
  const pboThreshold = thresholds?.pbo ?? VALIDATION_DEFAULTS.pboThreshold;
  const icMeanThreshold = thresholds?.icMean ?? VALIDATION_DEFAULTS.icMeanThreshold;
  const icStdThreshold = thresholds?.icStd ?? VALIDATION_DEFAULTS.icStdThreshold;
  const wfThreshold = thresholds?.wfEfficiency ?? VALIDATION_DEFAULTS.wfEfficiencyThreshold;
  const maxCorr = thresholds?.maxCorrelation ?? VALIDATION_DEFAULTS.maxCorrelation;
  const maxVIF = thresholds?.maxVIF ?? VALIDATION_DEFAULTS.maxVIF;

  const fwdReturns = forwardReturns ?? returns.slice(1).concat([0]);

  const dsrResult = runDSRGate(signals, returns, nTrials, dsrThreshold);
  const pboResult = runPBOGate(signals, returns, pboThreshold);
  const icResult = runICGate(signals, fwdReturns, icMeanThreshold, icStdThreshold);
  const wfResult = runWalkForwardGate(signals, returns, wfThreshold);
  const orthResult = runOrthogonalityGate(signals, existingIndicators ?? {}, maxCorr, maxVIF);

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
      selected: 1,
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

  results.sort((a, b) => {
    if (b.result.passRate !== a.result.passRate) {
      return b.result.passRate - a.result.passRate;
    }
    return b.result.dsr.pValue - a.result.dsr.pValue;
  });

  return results;
}
