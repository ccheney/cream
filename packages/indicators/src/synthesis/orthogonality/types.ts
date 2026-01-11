/**
 * Orthogonality Types and Schemas
 *
 * Type definitions and Zod schemas for orthogonality analysis.
 */

import { z } from "zod/v4";

/**
 * Default configuration for orthogonality checks.
 */
export const ORTHOGONALITY_DEFAULTS = {
  /** Maximum acceptable correlation with any existing indicator */
  maxCorrelation: 0.7,
  /** Maximum acceptable VIF (Variance Inflation Factor) */
  maxVIF: 5.0,
  /** Minimum observations required for reliable correlation */
  minObservations: 30,
  /** Warning threshold for moderate correlation */
  correlationWarning: 0.5,
  /** Warning threshold for moderate VIF */
  vifWarning: 3.0,
} as const;

/**
 * Schema for correlation result between two indicators.
 */
export const CorrelationResultSchema = z.object({
  /** Name of the compared indicator */
  name: z.string(),
  /** Pearson correlation coefficient */
  correlation: z.number().min(-1).max(1),
  /** Number of overlapping observations */
  nObservations: z.number().int().nonnegative(),
  /** Whether this correlation is acceptable */
  isAcceptable: z.boolean(),
  /** Whether this triggers a warning */
  isWarning: z.boolean(),
});

export type CorrelationResult = z.infer<typeof CorrelationResultSchema>;

/**
 * Schema for VIF calculation result.
 */
export const VIFResultSchema = z.object({
  /** Calculated VIF value */
  vif: z.number().nonnegative(),
  /** R-squared from regression */
  rSquared: z.number().min(0).max(1),
  /** Number of observations used */
  nObservations: z.number().int().nonnegative(),
  /** Number of existing indicators */
  nIndicators: z.number().int().nonnegative(),
  /** Whether VIF is acceptable */
  isAcceptable: z.boolean(),
  /** Whether this triggers a warning */
  isWarning: z.boolean(),
});

export type VIFResult = z.infer<typeof VIFResultSchema>;

/**
 * Input schema for orthogonality check.
 */
export const OrthogonalityInputSchema = z.object({
  /** New indicator values to check */
  newIndicator: z.array(z.number()),
  /** Map of existing indicator names to their values */
  existingIndicators: z.record(z.string(), z.array(z.number())),
  /** Maximum acceptable correlation (default: 0.7) */
  maxCorrelation: z.number().min(0).max(1).optional().default(0.7),
  /** Maximum acceptable VIF (default: 5.0) */
  maxVIF: z.number().positive().optional().default(5.0),
  /** Minimum observations required (default: 30) */
  minObservations: z.number().int().positive().optional().default(30),
});

export type OrthogonalityInput = z.input<typeof OrthogonalityInputSchema>;

/**
 * Schema for orthogonality check result.
 */
export const OrthogonalityResultSchema = z.object({
  /** Is the new indicator sufficiently orthogonal? */
  isOrthogonal: z.boolean(),
  /** Maximum correlation found with any existing indicator */
  maxCorrelationFound: z.number().min(-1).max(1),
  /** Name of the most correlated indicator */
  mostCorrelatedWith: z.string().nullable(),
  /** VIF result if multiple indicators exist */
  vif: VIFResultSchema.nullable(),
  /** Individual correlation results */
  correlations: z.array(CorrelationResultSchema),
  /** Summary of orthogonality status */
  summary: z.string(),
  /** Detailed recommendations */
  recommendations: z.array(z.string()),
  /** Thresholds used for evaluation */
  thresholds: z.object({
    maxCorrelation: z.number(),
    maxVIF: z.number(),
    minObservations: z.number(),
  }),
});

export type OrthogonalityResult = z.infer<typeof OrthogonalityResultSchema>;
