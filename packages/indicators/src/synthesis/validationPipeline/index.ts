/**
 * Validation Pipeline Orchestrator
 *
 * Combines all validation components (DSR, PBO, IC, walk-forward, orthogonality)
 * into a unified pipeline that validates new indicators before deployment.
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md (lines 527-579)
 */

// Re-export pipeline orchestration
export { isIndicatorValid, runValidationPipeline, validateAndRank } from "./pipeline.js";
// Re-export reporting functions
export {
  estimateSurvivalRate,
  evaluateValidation,
  generateRecommendations,
  generateSummary,
} from "./reporting.js";
// Re-export all types and schemas
export {
  type DSRGateResult,
  DSRGateResultSchema,
  type GateResults,
  type ICGateResult,
  ICGateResultSchema,
  type OrthogonalityGateResult,
  OrthogonalityGateResultSchema,
  type PBOGateResult,
  PBOGateResultSchema,
  type TrialInfo,
  TrialInfoSchema,
  VALIDATION_DEFAULTS,
  type ValidationInput,
  ValidationInputSchema,
  type ValidationResult,
  ValidationResultSchema,
  type WalkForwardGateResult,
  WalkForwardGateResultSchema,
} from "./types.js";
// Re-export validators
export {
  computeAnnualizedSharpe,
  runDSRGate,
  runICGate,
  runOrthogonalityGate,
  runPBOGate,
  runWalkForwardGate,
} from "./validators.js";
