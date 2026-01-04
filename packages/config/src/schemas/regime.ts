/**
 * Regime Classifier Configuration Schema
 *
 * Defines configuration for market regime classification.
 * Supports rule-based, HMM, and ML-based classifiers.
 *
 * @see docs/plans/11-configuration.md for full specification
 */

import { z } from "zod";

// ============================================
// Classifier Types
// ============================================

/**
 * Classifier type
 */
export const ClassifierType = z.enum(["rule_based", "hmm", "ml_model"]);
export type ClassifierType = z.infer<typeof ClassifierType>;

/**
 * Regime labels (fixed taxonomy)
 */
export const RegimeLabel = z.enum([
  "BULL_TREND",
  "BEAR_TREND",
  "RANGE",
  "HIGH_VOL",
  "LOW_VOL",
]);
export type RegimeLabel = z.infer<typeof RegimeLabel>;

// ============================================
// Classifier-Specific Configuration
// ============================================

/**
 * Rule-based classifier configuration
 *
 * Simple, interpretable, no training required.
 * Uses MA crossovers and volatility percentiles.
 */
export const RuleBasedConfigSchema = z.object({
  /**
   * Fast moving average period for trend detection
   */
  trend_ma_fast: z.number().int().positive().default(20),

  /**
   * Slow moving average period for trend detection
   */
  trend_ma_slow: z.number().int().positive().default(50),

  /**
   * Volatility percentile threshold for HIGH_VOL
   */
  volatility_percentile_high: z.number().min(0).max(100).default(80),

  /**
   * Volatility percentile threshold for LOW_VOL
   */
  volatility_percentile_low: z.number().min(0).max(100).default(20),
});
export type RuleBasedConfig = z.infer<typeof RuleBasedConfigSchema>;

/**
 * HMM covariance types
 */
export const CovarianceType = z.enum(["full", "diag", "tied", "spherical"]);
export type CovarianceType = z.infer<typeof CovarianceType>;

/**
 * Retrain frequency
 */
export const RetrainFrequency = z.enum(["daily", "weekly", "monthly"]);
export type RetrainFrequency = z.infer<typeof RetrainFrequency>;

/**
 * HMM (Hidden Markov Model) classifier configuration
 *
 * Probabilistic state transitions, unsupervised learning.
 * Captures market regimes from data patterns.
 */
export const HMMConfigSchema = z.object({
  /**
   * Number of hidden states
   *
   * Typically 3-5 (bull/bear/neutral or with vol states)
   */
  n_states: z.number().int().min(2).max(10).default(5),

  /**
   * Features used for training
   */
  features: z.array(z.string()).min(1).default(["return_5h", "atr_14_zscore"]),

  /**
   * How often to retrain the model
   */
  retrain_frequency: RetrainFrequency.default("weekly"),

  /**
   * Covariance matrix type
   */
  covariance_type: CovarianceType.default("full"),

  /**
   * EM algorithm iterations
   */
  n_iter: z.number().int().positive().default(100),
});
export type HMMConfig = z.infer<typeof HMMConfigSchema>;

/**
 * ML model classifier configuration
 *
 * Custom ML model for regime classification.
 */
export const MLModelConfigSchema = z.object({
  /**
   * Model path or identifier
   */
  model_path: z.string().min(1),

  /**
   * Features used for inference
   */
  features: z.array(z.string()).min(1),

  /**
   * Model version for tracking
   */
  version: z.string().optional(),
});
export type MLModelConfig = z.infer<typeof MLModelConfigSchema>;

// ============================================
// Regime Configuration
// ============================================

/**
 * Complete regime classifier configuration
 *
 * Uses discriminated union based on classifier_type.
 */
export const RegimeConfigSchema = z
  .object({
    /**
     * Type of classifier to use
     */
    classifier_type: ClassifierType,

    /**
     * Regime labels (fixed taxonomy)
     */
    labels: z.array(RegimeLabel).default([
      "BULL_TREND",
      "BEAR_TREND",
      "RANGE",
      "HIGH_VOL",
      "LOW_VOL",
    ]),

    /**
     * Rule-based classifier settings
     */
    rule_based: RuleBasedConfigSchema.optional(),

    /**
     * HMM classifier settings
     */
    hmm: HMMConfigSchema.optional(),

    /**
     * ML model classifier settings
     */
    ml_model: MLModelConfigSchema.optional(),
  })
  .superRefine((data, ctx) => {
    // Validate that the appropriate config is provided for the classifier type
    if (data.classifier_type === "rule_based" && !data.rule_based) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rule_based config required when classifier_type is 'rule_based'",
        path: ["rule_based"],
      });
    }
    if (data.classifier_type === "hmm" && !data.hmm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "hmm config required when classifier_type is 'hmm'",
        path: ["hmm"],
      });
    }
    if (data.classifier_type === "ml_model" && !data.ml_model) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ml_model config required when classifier_type is 'ml_model'",
        path: ["ml_model"],
      });
    }
  });
export type RegimeConfig = z.infer<typeof RegimeConfigSchema>;
