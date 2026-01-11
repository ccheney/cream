/**
 * Indicator Monitoring Types
 *
 * Type definitions, schemas, and configuration for indicator monitoring.
 */

import { z } from "zod";

// ============================================
// Configuration
// ============================================

/**
 * Default configuration values for monitoring
 */
export const MONITORING_DEFAULTS = {
  /** Minimum IC threshold for healthy indicator */
  minHealthyIC: 0.02,
  /** Days of low IC before retirement consideration */
  retirementThresholdDays: 30,
  /** IC stability ratio threshold (mean/std) */
  minICStability: 0.5,
  /** Rolling window for metrics (days) */
  rollingWindowDays: 30,
  /** Minimum hit rate for healthy indicator */
  minHitRate: 0.5,
} as const;

// ============================================
// Schemas
// ============================================

/**
 * Daily IC metrics schema
 */
export const DailyICMetricsSchema = z.object({
  indicatorId: z.string(),
  date: z.string(),
  icValue: z.number(),
  icStd: z.number(),
  nObservations: z.number().int(),
  decisionsUsedIn: z.number().int(),
  decisionsCorrect: z.number().int(),
});

export type DailyICMetrics = z.infer<typeof DailyICMetricsSchema>;

/**
 * Rolling metrics schema
 */
export const RollingMetricsSchema = z.object({
  indicatorId: z.string(),
  ic30Day: z.number(),
  icStd30Day: z.number(),
  icStability: z.number(),
  decisionsTotal: z.number().int(),
  decisionsCorrect: z.number().int(),
  hitRate: z.number().min(0).max(1),
  daysTracked: z.number().int(),
  health: z.enum(["healthy", "degraded", "critical"]),
});

export type RollingMetrics = z.infer<typeof RollingMetricsSchema>;

/**
 * Retirement reason enumeration
 */
export const RetirementReasonSchema = z.enum(["ic_decay", "crowding", "capacity", "manual"]);

export type RetirementReason = z.infer<typeof RetirementReasonSchema>;

/**
 * Retirement check result schema
 */
export const RetirementCheckSchema = z.object({
  indicatorId: z.string(),
  shouldRetire: z.boolean(),
  reason: z.string().optional(),
  retirementReason: RetirementReasonSchema.optional(),
  consecutiveLowICDays: z.number().int(),
  avgIC30Day: z.number(),
  hitRate: z.number(),
  isCrowded: z.boolean(),
  activeIndicatorCount: z.number().int(),
  recommendedAction: z.enum(["none", "monitor", "retire"]),
});

export type RetirementCheck = z.infer<typeof RetirementCheckSchema>;

/**
 * Decision attribution schema
 */
export const DecisionAttributionSchema = z.object({
  id: z.string(),
  decisionId: z.string(),
  indicatorId: z.string(),
  signalValue: z.number(),
  contributionWeight: z.number().min(0).max(1),
  wasCorrect: z.boolean().nullable(),
  createdAt: z.string(),
});

export type DecisionAttribution = z.infer<typeof DecisionAttributionSchema>;

// ============================================
// Options Types
// ============================================

/**
 * Options for retirement condition checking
 */
export interface RetirementCheckOptions {
  /** Check for signal crowding (placeholder - requires external service) */
  checkCrowding?: boolean;
  /** Current count of active indicators (for capacity checking) */
  activeIndicatorCount?: number;
  /** Maximum allowed active indicators (default: 20) */
  maxCapacity?: number;
}
