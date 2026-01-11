/**
 * Research Trigger Detection Types and Schemas
 *
 * Defines the data model for detecting when the Orient Agent should
 * spawn autonomous research pipelines.
 *
 * @see docs/plans/20-research-to-production-pipeline.md - Phase 0: Trigger Detection
 * @see https://markrbest.github.io/alpha-decay/ - Alpha decay detection
 * @see https://arxiv.org/html/2512.11913 - Factor crowding detection
 */

import { z } from "zod";

export const ResearchTriggerDetectionTypeSchema = z.enum([
  "REGIME_GAP", // Current regime not covered by active strategies
  "ALPHA_DECAY", // Rolling IC < 50% of peak for 20+ days
  "PERFORMANCE_DEGRADATION", // Rolling Sharpe < 0.5 for 10+ days
  "FACTOR_CROWDING", // Correlation with market beta > 0.8
]);
export type ResearchTriggerDetectionType = z.infer<typeof ResearchTriggerDetectionTypeSchema>;

export const TriggerSeveritySchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type TriggerSeverity = z.infer<typeof TriggerSeveritySchema>;

export const RegimeGapMetadataSchema = z.object({
  currentRegime: z.string(),
  coveredRegimes: z.array(z.string()),
  uncoveredRegimes: z.array(z.string()),
});
export type RegimeGapMetadata = z.infer<typeof RegimeGapMetadataSchema>;

export const AlphaDecayMetadataSchema = z.object({
  peakIC: z.number(),
  currentIC: z.number(),
  rollingIC: z.number(),
  decayRate: z.number().describe("Rate of IC decline per day"),
  daysDecaying: z.number().int().nonnegative(),
});
export type AlphaDecayMetadata = z.infer<typeof AlphaDecayMetadataSchema>;

export const PerformanceDegradationMetadataSchema = z.object({
  rollingSharpe: z.number(),
  sharpeThreshold: z.number(),
  daysBelowThreshold: z.number().int().nonnegative(),
  maxDrawdown: z.number().optional(),
});
export type PerformanceDegradationMetadata = z.infer<typeof PerformanceDegradationMetadataSchema>;

export const FactorCrowdingMetadataSchema = z.object({
  marketBetaCorrelation: z.number().min(-1).max(1),
  crowdingThreshold: z.number(),
  correlationTrend: z.enum(["increasing", "stable", "decreasing"]),
});
export type FactorCrowdingMetadata = z.infer<typeof FactorCrowdingMetadataSchema>;

export const TriggerMetadataSchema = z.union([
  RegimeGapMetadataSchema,
  AlphaDecayMetadataSchema,
  PerformanceDegradationMetadataSchema,
  FactorCrowdingMetadataSchema,
]);
export type TriggerMetadata = z.infer<typeof TriggerMetadataSchema>;

export const ResearchTriggerSchema = z.object({
  type: ResearchTriggerDetectionTypeSchema,
  severity: TriggerSeveritySchema,
  affectedFactors: z.array(z.string()),
  suggestedFocus: z.string(),
  detectedAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()),
});
export type ResearchTrigger = z.infer<typeof ResearchTriggerSchema>;

export const BlockingConditionsSchema = z.object({
  /** Days since last research run completed */
  daysSinceLastResearch: z.number().int().nonnegative(),
  /** Number of currently active research pipelines */
  activeResearchCount: z.number().int().nonnegative(),
  /** Number of active factors in the Factor Zoo */
  factorZooSize: z.number().int().nonnegative(),
  /** Whether monthly research budget is exhausted */
  budgetExhausted: z.boolean(),
});
export type BlockingConditions = z.infer<typeof BlockingConditionsSchema>;

export const BlockingCheckResultSchema = z.object({
  isBlocked: z.boolean(),
  reasons: z.array(z.string()),
  conditions: BlockingConditionsSchema,
});
export type BlockingCheckResult = z.infer<typeof BlockingCheckResultSchema>;

export const ResearchTriggerConfigSchema = z.object({
  cooldownDays: z.number().int().positive().default(7),

  // Capacity limits
  maxActiveResearch: z.number().int().positive().default(2),
  maxFactorZooSize: z.number().int().positive().default(30),

  // Budget limits (0 = unlimited)
  maxMonthlyTokens: z.number().int().nonnegative().default(0),
  maxMonthlyComputeHours: z.number().nonnegative().default(0),

  // Alpha decay thresholds
  alphaDecayICThreshold: z
    .number()
    .min(0)
    .max(1)
    .default(0.5)
    .describe("IC threshold as fraction of peak (0.5 = 50% of peak)"),
  alphaDecayMinDays: z.number().int().positive().default(20),

  // Performance degradation thresholds
  performanceSharpeThreshold: z.number().default(0.5),
  performanceMinDays: z.number().int().positive().default(10),

  // Factor crowding thresholds
  crowdingCorrelationThreshold: z.number().min(0).max(1).default(0.8),

  // Severity thresholds
  highSeverityFactorCount: z.number().int().positive().default(3),
});
export type ResearchTriggerConfig = z.infer<typeof ResearchTriggerConfigSchema>;

export const DEFAULT_RESEARCH_TRIGGER_CONFIG: ResearchTriggerConfig = {
  cooldownDays: 7,
  maxActiveResearch: 2,
  maxFactorZooSize: 30,
  maxMonthlyTokens: 0, // Unlimited by default
  maxMonthlyComputeHours: 0, // Unlimited by default
  alphaDecayICThreshold: 0.5,
  alphaDecayMinDays: 20,
  performanceSharpeThreshold: 0.5,
  performanceMinDays: 10,
  crowdingCorrelationThreshold: 0.8,
  highSeverityFactorCount: 3,
};

export const TriggerDetectionStateSchema = z.object({
  /** Current market regime */
  currentRegime: z.string(),
  /** Regimes covered by active strategies */
  activeRegimes: z.array(z.string()),
  /** Active factor IDs */
  activeFactorIds: z.array(z.string()),
  /** Timestamp of state snapshot */
  timestamp: z.string().datetime(),
});
export type TriggerDetectionState = z.infer<typeof TriggerDetectionStateSchema>;

export const TriggerDetectionResultSchema = z.object({
  /** Detected trigger, if any */
  trigger: ResearchTriggerSchema.nullable(),
  /** Whether research should be spawned */
  shouldTrigger: z.boolean(),
  /** Blocking check result */
  blockingCheck: BlockingCheckResultSchema,
  /** All detected triggers (even if blocked) */
  allTriggers: z.array(ResearchTriggerSchema),
  /** Detection timestamp */
  checkedAt: z.string().datetime(),
});
export type TriggerDetectionResult = z.infer<typeof TriggerDetectionResultSchema>;
