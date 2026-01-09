/**
 * Feature/Transform Configuration Schema
 *
 * Defines normalization transforms for feature engineering.
 * Supports returns, z-score, percentile rank, and volatility scaling.
 *
 * @see docs/plans/11-configuration.md for full specification
 */

import { z } from "zod";

export const TransformName = z.enum(["returns", "zscore", "percentile_rank", "volatility_scale"]);
export type TransformName = z.infer<typeof TransformName>;

/** Price returns (percentage change) for momentum features */
export const ReturnsParamsSchema = z.object({
  /** e.g., [1, 5, 20] calculates 1h, 5h, 20h returns */
  periods: z.array(z.number().int().positive()).min(1),
});

/** (X - mean) / std_dev. Standardizes to mean=0, std=1 for cross-feature comparison */
export const ZScoreParamsSchema = z.object({
  lookback: z.number().int().positive().default(100),
});

/** Maps values to percentile rank (0-100) within lookback window. More robust to outliers than z-score */
export const PercentileRankParamsSchema = z.object({
  /** ~252 for ~1 year of hourly bars */
  lookback: z.number().int().positive().default(252),
});

/** Scales returns by recent volatility for risk-adjusted signals */
export const VolatilityScaleParamsSchema = z.object({
  vol_window: z.number().int().positive().default(20),
});

export const TransformConfigSchema = z
  .object({
    name: z.string().min(1),
    /** Mutually exclusive with inputs */
    input: z.string().optional(),
    /** Mutually exclusive with input */
    inputs: z.array(z.string()).optional(),
    params: z.record(z.string(), z.unknown()),
    /** e.g., "return" produces "return_1h", "return_5h", etc. */
    output_prefix: z.string().optional(),
    /** e.g., "_zscore" produces "rsi_14_zscore", etc. */
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

export const TransformsConfigSchema = z.array(TransformConfigSchema);
export type TransformsConfig = z.infer<typeof TransformsConfigSchema>;

export const NormalizationConfigSchema = z.object({
  transforms: TransformsConfigSchema,
});
export type NormalizationConfig = z.infer<typeof NormalizationConfigSchema>;
