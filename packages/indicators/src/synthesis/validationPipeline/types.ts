/**
 * Validation Pipeline Type Definitions
 *
 * Contains all Zod schemas, types, and validation defaults for the indicator validation pipeline.
 */

import { z } from "zod/v4";
import { ORTHOGONALITY_DEFAULTS } from "../orthogonality.js";

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

/**
 * Intermediate type for gate results used in reporting.
 */
export interface GateResults {
  dsr: DSRGateResult;
  pbo: PBOGateResult;
  ic: ICGateResult;
  walkForward: WalkForwardGateResult;
  orthogonality: OrthogonalityGateResult;
}
