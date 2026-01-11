/**
 * Information Coefficient (IC) Type Definitions
 *
 * Type definitions and Zod schemas for IC calculation results.
 */

import { z } from "zod";

// ============================================
// Constants
// ============================================

/**
 * Default configuration for IC calculation
 */
export const IC_DEFAULTS = {
  /** Minimum IC mean to be considered meaningful */
  minICMean: 0.02,
  /** Maximum IC standard deviation for stable predictions */
  maxICStd: 0.03,
  /** Minimum ICIR for consistent signal quality */
  minICIR: 0.5,
  /** Minimum hit rate for reliable signal */
  minHitRate: 0.52,
  /** Minimum observations for valid correlation */
  minObservations: 10,
  /** Default rolling window for time-series IC */
  defaultWindow: 60,
  /** Default forward horizons for decay analysis */
  defaultHorizons: [1, 5, 10, 21, 63],
} as const;

// ============================================
// Schemas
// ============================================

/**
 * Result of IC calculation for a single period
 */
export const ICValueSchema = z.object({
  /** IC value (Spearman rank correlation) */
  ic: z.number().min(-1).max(1),
  /** Number of observations used */
  nObservations: z.number().int().min(0),
  /** Whether this IC is valid (sufficient observations) */
  isValid: z.boolean(),
});

export type ICValue = z.infer<typeof ICValueSchema>;

/**
 * Summary statistics for a series of IC values
 */
export const ICStatsSchema = z.object({
  /** Mean IC across all periods */
  mean: z.number(),
  /** Standard deviation of IC */
  std: z.number(),
  /** Information Coefficient Information Ratio (mean / std) */
  icir: z.number(),
  /** Percentage of periods with positive IC */
  hitRate: z.number().min(0).max(1),
  /** Total number of IC observations */
  nObservations: z.number().int().min(0),
  /** Number of valid IC observations */
  nValidObservations: z.number().int().min(0),
  /** Interpretation of IC quality */
  interpretation: z.enum(["strong", "moderate", "weak"]),
  /** Whether IC passes minimum thresholds */
  passed: z.boolean(),
});

export type ICStats = z.infer<typeof ICStatsSchema>;

/**
 * Result of IC decay analysis
 */
export const ICDecayResultSchema = z.object({
  /** IC values at each horizon */
  icByHorizon: z.record(z.string(), z.number()),
  /** Horizons analyzed */
  horizons: z.array(z.number()),
  /** Optimal horizon (with highest IC) */
  optimalHorizon: z.number(),
  /** IC at optimal horizon */
  optimalIC: z.number(),
  /** Half-life in periods (where IC drops to 50%) */
  halfLife: z.number().nullable(),
});

export type ICDecayResult = z.infer<typeof ICDecayResultSchema>;

/**
 * Full IC analysis result
 */
export const ICAnalysisResultSchema = z.object({
  /** Summary statistics */
  stats: ICStatsSchema,
  /** Time series of IC values */
  icSeries: z.array(ICValueSchema),
  /** Decay analysis (if performed) */
  decay: ICDecayResultSchema.optional(),
});

export type ICAnalysisResult = z.infer<typeof ICAnalysisResultSchema>;

/**
 * Options for IC analysis
 */
export interface ICAnalysisOptions {
  includeDecay?: boolean;
  horizons?: number[];
  /** For decay analysis (raw returns, not forward) */
  returns?: number[][];
}

/**
 * IC significance thresholds
 */
export interface ICSignificanceThresholds {
  minMean?: number;
  maxStd?: number;
  minICIR?: number;
}

/**
 * IC evaluation result
 */
export interface ICEvaluation {
  summary: string;
  recommendation: "accept" | "review" | "reject";
  details: string[];
}
