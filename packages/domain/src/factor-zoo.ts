/**
 * Factor Zoo Types and Schemas
 *
 * Defines the data model for the Factor Zoo system that manages alpha factors
 * throughout their lifecycle following the AlphaForge pattern.
 *
 * @see docs/plans/20-research-to-production-pipeline.md
 * @see https://arxiv.org/html/2406.18394v1 (AlphaForge Paper)
 */

import { z } from "zod";

// ============================================
// Enums and Constants
// ============================================

/**
 * Hypothesis lifecycle status
 */
export const HypothesisStatusSchema = z.enum([
  "proposed",
  "implementing",
  "validating",
  "validated",
  "rejected",
]);
export type HypothesisStatus = z.infer<typeof HypothesisStatusSchema>;

/**
 * Factor lifecycle status
 */
export const FactorStatusSchema = z.enum([
  "research",
  "validating",
  "active",
  "decaying",
  "retired",
]);
export type FactorStatus = z.infer<typeof FactorStatusSchema>;

/**
 * Research run trigger types
 */
export const ResearchTriggerTypeSchema = z.enum([
  "scheduled",
  "decay_detected",
  "regime_change",
  "manual",
  "refinement",
]);
export type ResearchTriggerType = z.infer<typeof ResearchTriggerTypeSchema>;

/**
 * Research run phase
 */
export const ResearchPhaseSchema = z.enum([
  "idea",
  "implementation",
  "stage1",
  "stage2",
  "translation",
  "equivalence",
  "paper",
  "promotion",
  "completed",
  "failed",
]);
export type ResearchPhase = z.infer<typeof ResearchPhaseSchema>;

/**
 * Target market regime
 */
export const TargetRegimeSchema = z.enum(["bull", "bear", "sideways", "volatile", "all"]);
export type TargetRegime = z.infer<typeof TargetRegimeSchema>;

// ============================================
// Hypothesis Schema
// ============================================

/**
 * Falsification criteria for a hypothesis
 */
export const FalsificationCriteriaSchema = z.object({
  conditions: z.array(z.string()),
  thresholds: z.record(z.string(), z.number()).optional(),
  timeHorizon: z.string().optional(),
});
export type FalsificationCriteria = z.infer<typeof FalsificationCriteriaSchema>;

/**
 * Economic hypothesis that drives factor generation
 */
export const HypothesisSchema = z.object({
  hypothesisId: z.string(),
  title: z.string(),
  economicRationale: z.string(),
  marketMechanism: z.string(),
  targetRegime: TargetRegimeSchema.nullable(),
  falsificationCriteria: FalsificationCriteriaSchema.nullable(),
  status: HypothesisStatusSchema,
  iteration: z.number().int().positive(),
  parentHypothesisId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Hypothesis = z.infer<typeof HypothesisSchema>;

/**
 * Input for creating a new hypothesis
 */
export const NewHypothesisSchema = HypothesisSchema.omit({
  hypothesisId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  hypothesisId: z.string().optional(),
});
export type NewHypothesis = z.infer<typeof NewHypothesisSchema>;

// ============================================
// Factor Schema
// ============================================

/**
 * Alpha factor with complete lifecycle tracking
 */
export const FactorSchema = z.object({
  factorId: z.string(),
  hypothesisId: z.string().nullable(),
  name: z.string(),
  status: FactorStatusSchema,
  version: z.number().int().positive(),
  author: z.string(),

  // Implementation
  pythonModule: z.string().nullable(),
  typescriptModule: z.string().nullable(),

  // Complexity metrics (AlphaForge regularization)
  symbolicLength: z.number().int().nonnegative().nullable(),
  parameterCount: z.number().int().nonnegative().nullable(),
  featureCount: z.number().int().nonnegative().nullable(),

  // Quality metrics
  originalityScore: z.number().min(0).max(1).nullable(),
  hypothesisAlignment: z.number().min(0).max(1).nullable(),

  // Stage 1 validation (backtesting)
  stage1Sharpe: z.number().nullable(),
  stage1Ic: z.number().nullable(),
  stage1MaxDrawdown: z.number().nullable(),
  stage1CompletedAt: z.string().datetime().nullable(),

  // Stage 2 validation (statistical rigor)
  stage2Pbo: z.number().min(0).max(1).nullable(),
  stage2DsrPvalue: z.number().min(0).max(1).nullable(),
  stage2Wfe: z.number().nullable(),
  stage2CompletedAt: z.string().datetime().nullable(),

  // Paper trading validation
  paperValidationPassed: z.boolean(),
  paperStartDate: z.string().datetime().nullable(),
  paperEndDate: z.string().datetime().nullable(),
  paperRealizedSharpe: z.number().nullable(),
  paperRealizedIc: z.number().nullable(),

  // Production state
  currentWeight: z.number(),
  lastIc: z.number().nullable(),
  decayRate: z.number().nullable(),

  // Regime targeting
  targetRegimes: z.array(TargetRegimeSchema).nullable(),

  // Parity validation
  parityReport: z.record(z.string(), z.unknown()).nullable(),
  parityValidatedAt: z.string().datetime().nullable(),

  // Lifecycle timestamps
  createdAt: z.string().datetime(),
  promotedAt: z.string().datetime().nullable(),
  retiredAt: z.string().datetime().nullable(),
  lastUpdated: z.string().datetime(),
});
export type Factor = z.infer<typeof FactorSchema>;

/**
 * Input for creating a new factor
 */
export const NewFactorSchema = FactorSchema.omit({
  factorId: true,
  createdAt: true,
  lastUpdated: true,
  targetRegimes: true,
  parityReport: true,
  parityValidatedAt: true,
}).extend({
  factorId: z.string().optional(),
  targetRegimes: z.array(TargetRegimeSchema).nullable().optional(),
});
export type NewFactor = z.infer<typeof NewFactorSchema>;

// ============================================
// Factor Performance Schema
// ============================================

/**
 * Daily performance metrics for a factor
 */
export const FactorPerformanceSchema = z.object({
  id: z.string(),
  factorId: z.string(),
  date: z.string(),
  ic: z.number(),
  icir: z.number().nullable(),
  sharpe: z.number().nullable(),
  weight: z.number(),
  signalCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type FactorPerformance = z.infer<typeof FactorPerformanceSchema>;

/**
 * Input for recording daily performance
 */
export const DailyMetricsSchema = z.object({
  date: z.string(),
  ic: z.number(),
  icir: z.number().optional(),
  sharpe: z.number().optional(),
  weight: z.number().optional().default(0),
  signalCount: z.number().int().nonnegative().optional().default(0),
});
export type DailyMetrics = z.infer<typeof DailyMetricsSchema>;

// ============================================
// Factor Correlation Schema
// ============================================

/**
 * Pairwise correlation between two factors
 */
export const FactorCorrelationSchema = z.object({
  factorId1: z.string(),
  factorId2: z.string(),
  correlation: z.number().min(-1).max(1),
  computedAt: z.string().datetime(),
});
export type FactorCorrelation = z.infer<typeof FactorCorrelationSchema>;

// ============================================
// Research Run Schema
// ============================================

/**
 * Research pipeline run tracking
 */
export const ResearchRunSchema = z.object({
  runId: z.string(),
  triggerType: ResearchTriggerTypeSchema,
  triggerReason: z.string(),
  phase: ResearchPhaseSchema,
  currentIteration: z.number().int().positive(),
  hypothesisId: z.string().nullable(),
  factorId: z.string().nullable(),
  prUrl: z.string().url().nullable(),
  errorMessage: z.string().nullable(),
  tokensUsed: z.number().int().nonnegative(),
  computeHours: z.number().nonnegative(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type ResearchRun = z.infer<typeof ResearchRunSchema>;

/**
 * Input for creating a new research run
 */
export const NewResearchRunSchema = ResearchRunSchema.omit({
  runId: true,
  startedAt: true,
}).extend({
  runId: z.string().optional(),
});
export type NewResearchRun = z.infer<typeof NewResearchRunSchema>;

// ============================================
// Aggregation Types
// ============================================

/**
 * Factor zoo statistics summary
 */
export const FactorZooStatsSchema = z.object({
  totalFactors: z.number().int().nonnegative(),
  activeFactors: z.number().int().nonnegative(),
  decayingFactors: z.number().int().nonnegative(),
  researchFactors: z.number().int().nonnegative(),
  retiredFactors: z.number().int().nonnegative(),
  averageIc: z.number(),
  totalWeight: z.number(),
  hypothesesValidated: z.number().int().nonnegative(),
  hypothesesRejected: z.number().int().nonnegative(),
});
export type FactorZooStats = z.infer<typeof FactorZooStatsSchema>;

/**
 * Factor weight update
 */
export const FactorWeightUpdateSchema = z.object({
  factorId: z.string(),
  newWeight: z.number().min(0).max(1),
  reason: z.string().optional(),
});
export type FactorWeightUpdate = z.infer<typeof FactorWeightUpdateSchema>;

/**
 * Research budget status for the current month
 */
export const ResearchBudgetStatusSchema = z.object({
  /** Tokens used this month */
  tokensUsedThisMonth: z.number().int().nonnegative(),
  /** Compute hours used this month */
  computeHoursThisMonth: z.number().nonnegative(),
  /** Number of research runs this month */
  runsThisMonth: z.number().int().nonnegative(),
  /** Maximum allowed tokens per month (0 = unlimited) */
  maxMonthlyTokens: z.number().int().nonnegative(),
  /** Maximum allowed compute hours per month (0 = unlimited) */
  maxMonthlyComputeHours: z.number().nonnegative(),
  /** Whether budget is exhausted */
  isExhausted: z.boolean(),
  /** Start of the current billing period (first day of month) */
  periodStart: z.string().datetime(),
});
export type ResearchBudgetStatus = z.infer<typeof ResearchBudgetStatusSchema>;
