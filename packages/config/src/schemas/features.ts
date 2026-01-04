/**
 * Feature/Transform Configuration Schema
 *
 * Defines normalization transforms for feature engineering.
 * Supports returns, z-score, percentile rank, and volatility scaling.
 *
 * @see docs/plans/11-configuration.md for full specification
 */

import { z } from "zod";

// ============================================
// Transform Types
// ============================================

/**
 * Supported transform names
 */
export const TransformName = z.enum([
  "returns",
  "zscore",
  "percentile_rank",
  "volatility_scale",
]);
export type TransformName = z.infer<typeof TransformName>;

// ============================================
// Transform-Specific Parameter Schemas
// ============================================

/**
 * Returns transform parameters
 *
 * Price returns (percentage change) for momentum features.
 */
export const ReturnsParamsSchema = z.object({
  /**
   * Periods for return calculation
   *
   * e.g., [1, 5, 20] calculates 1h, 5h, 20h returns
   */
  periods: z.array(z.number().int().positive()).min(1),
});

/**
 * Z-score transform parameters
 *
 * (X - mean) / std_dev
 * Standardizes to mean=0, std=1 for cross-feature comparison.
 */
export const ZScoreParamsSchema = z.object({
  /**
   * Lookback window for mean/std calculation
   */
  lookback: z.number().int().positive().default(100),
});

/**
 * Percentile rank transform parameters
 *
 * Maps values to percentile rank (0-100) within lookback window.
 * More robust to outliers than z-score.
 */
export const PercentileRankParamsSchema = z.object({
  /**
   * Lookback window for percentile calculation
   *
   * ~252 for ~1 year of hourly bars
   */
  lookback: z.number().int().positive().default(252),
});

/**
 * Volatility scale transform parameters
 *
 * Scales returns by recent volatility for risk-adjusted signals.
 */
export const VolatilityScaleParamsSchema = z.object({
  /**
   * Rolling window for volatility estimate
   */
  vol_window: z.number().int().positive().default(20),
});

// ============================================
// Generic Transform Configuration
// ============================================

/**
 * Base transform configuration
 *
 * Supports single input or multiple inputs.
 */
export const TransformConfigSchema = z
  .object({
    /**
     * Transform name
     */
    name: z.string().min(1),

    /**
     * Single input source (mutually exclusive with inputs)
     */
    input: z.string().optional(),

    /**
     * Multiple input sources (mutually exclusive with input)
     */
    inputs: z.array(z.string()).optional(),

    /**
     * Transform-specific parameters
     */
    params: z.record(z.string(), z.unknown()),

    /**
     * Prefix for output column names
     *
     * e.g., "return" produces "return_1h", "return_5h", etc.
     */
    output_prefix: z.string().optional(),

    /**
     * Suffix for output column names
     *
     * e.g., "_zscore" produces "rsi_14_zscore", etc.
     */
    output_suffix: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Require exactly one of input or inputs
    if (data.input === undefined && data.inputs === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either input or inputs must be specified",
        path: ["input"],
      });
    }
    if (data.input !== undefined && data.inputs !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cannot specify both input and inputs",
        path: ["inputs"],
      });
    }
  });
export type TransformConfig = z.infer<typeof TransformConfigSchema>;

/**
 * Complete transforms configuration
 */
export const TransformsConfigSchema = z.array(TransformConfigSchema);
export type TransformsConfig = z.infer<typeof TransformsConfigSchema>;

// ============================================
// Normalization Configuration (Wrapper)
// ============================================

/**
 * Normalization configuration section
 *
 * Contains array of transforms.
 */
export const NormalizationConfigSchema = z.object({
  transforms: TransformsConfigSchema,
});
export type NormalizationConfig = z.infer<typeof NormalizationConfigSchema>;
