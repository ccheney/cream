/**
 * Transform Pipeline
 *
 * Orchestrates application of multiple transforms to feature data.
 * Produces named outputs following configurable naming conventions.
 */

import type { Candle, NamedIndicatorOutput, Timeframe } from "../types";
import {
  calculatePercentileRank,
  PERCENTILE_RANK_DEFAULTS,
  type PercentileRankParams,
} from "./percentileRank";
import {
  calculateReturnsFromCandles,
  RETURNS_DEFAULTS,
  type ReturnsParams,
  simpleReturn,
} from "./returns";
import {
  calculateVolatilityScale,
  VOLATILITY_SCALE_DEFAULTS,
  type VolatilityScaleParams,
} from "./volatilityScale";
import { calculateZScore, ZSCORE_DEFAULTS, type ZScoreParams } from "./zscore";

// ============================================
// Configuration Types
// ============================================

/**
 * Transform pipeline configuration.
 */
export interface TransformPipelineConfig {
  returns?: {
    enabled: boolean;
    params?: Partial<ReturnsParams>;
  };
  zscore?: {
    enabled: boolean;
    params?: Partial<ZScoreParams>;
    /** Apply to these indicator outputs */
    applyTo?: string[];
  };
  percentileRank?: {
    enabled: boolean;
    params?: Partial<PercentileRankParams>;
    /** Apply to these indicator outputs */
    applyTo?: string[];
  };
  volatilityScale?: {
    enabled: boolean;
    params?: Partial<VolatilityScaleParams>;
    /** Apply to these indicator outputs */
    applyTo?: string[];
  };
}

/**
 * Default transform pipeline configuration.
 */
export const DEFAULT_TRANSFORM_CONFIG: TransformPipelineConfig = {
  returns: {
    enabled: true,
    params: RETURNS_DEFAULTS,
  },
  zscore: {
    enabled: true,
    params: ZSCORE_DEFAULTS,
    applyTo: ["rsi", "stochastic_k", "volume_ratio"],
  },
  percentileRank: {
    enabled: false,
    params: PERCENTILE_RANK_DEFAULTS,
  },
  volatilityScale: {
    enabled: false,
    params: VOLATILITY_SCALE_DEFAULTS,
  },
};

// ============================================
// Transform Snapshot
// ============================================

/**
 * Transform output snapshot.
 */
export interface TransformSnapshot {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Named transform outputs */
  values: NamedIndicatorOutput;
}

// ============================================
// Pipeline Implementation
// ============================================

/**
 * Apply transforms to candle data.
 *
 * @param candles - OHLCV candle data
 * @param timeframe - Timeframe identifier
 * @param config - Transform configuration
 * @returns Transform snapshot
 */
export function applyTransforms(
  candles: Candle[],
  timeframe: Timeframe,
  config: TransformPipelineConfig = DEFAULT_TRANSFORM_CONFIG
): TransformSnapshot | null {
  if (candles.length === 0) {
    return null;
  }

  const output: NamedIndicatorOutput = {};
  const latestCandle = candles[candles.length - 1];

  // Extract price and volume series
  const closes = candles.map((c) => c.close);
  const timestamps = candles.map((c) => c.timestamp);

  // Calculate returns
  if (config.returns?.enabled) {
    const periods = config.returns.params?.periods ?? RETURNS_DEFAULTS.periods;
    const logReturns = config.returns.params?.logReturns ?? false;

    try {
      const results = calculateReturnsFromCandles(candles, { periods, logReturns });

      if (results.length > 0) {
        const latest = results[results.length - 1]!;

        for (const period of periods) {
          const value = latest.returns[period];
          if (value !== null && value !== undefined) {
            output[`return_${period}_${timeframe}`] = value;
          }
        }
      }
    } catch {
      // Insufficient data
    }
  }

  // Calculate z-scores for specified indicators
  if (config.zscore?.enabled && config.zscore.applyTo) {
    const lookback = config.zscore.params?.lookback ?? ZSCORE_DEFAULTS.lookback;
    const minSamples = config.zscore.params?.minSamples ?? ZSCORE_DEFAULTS.minSamples;

    // For now, apply to close prices as a demo
    // In production, this would apply to indicator outputs
    try {
      const results = calculateZScore(closes, timestamps, { lookback, minSamples });

      if (results.length > 0) {
        const latest = results[results.length - 1]!;
        output[`close_zscore_${timeframe}`] = latest.zscore;
      }
    } catch {
      // Insufficient data
    }
  }

  // Calculate percentile ranks
  if (config.percentileRank?.enabled) {
    const lookback = config.percentileRank.params?.lookback ?? PERCENTILE_RANK_DEFAULTS.lookback;
    const minSamples =
      config.percentileRank.params?.minSamples ?? PERCENTILE_RANK_DEFAULTS.minSamples;

    try {
      const results = calculatePercentileRank(closes, timestamps, { lookback, minSamples });

      if (results.length > 0) {
        const latest = results[results.length - 1]!;
        output[`close_pct_${timeframe}`] = latest.percentile;
      }
    } catch {
      // Insufficient data
    }
  }

  // Calculate volatility-scaled values
  if (config.volatilityScale?.enabled) {
    const volPeriod =
      config.volatilityScale.params?.volatilityPeriod ?? VOLATILITY_SCALE_DEFAULTS.volatilityPeriod;
    const targetVol =
      config.volatilityScale.params?.targetVolatility ?? VOLATILITY_SCALE_DEFAULTS.targetVolatility;
    const minVol =
      config.volatilityScale.params?.minVolatility ?? VOLATILITY_SCALE_DEFAULTS.minVolatility;
    const maxScale =
      config.volatilityScale.params?.maxScaleFactor ?? VOLATILITY_SCALE_DEFAULTS.maxScaleFactor;

    // Calculate returns for volatility
    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push(simpleReturn(closes[i]!, closes[i - 1]!));
    }

    try {
      const results = calculateVolatilityScale(
        closes.slice(1), // Align with returns
        returns,
        timestamps.slice(1),
        {
          volatilityPeriod: volPeriod,
          targetVolatility: targetVol,
          minVolatility: minVol,
          maxScaleFactor: maxScale,
        }
      );

      if (results.length > 0) {
        const latest = results[results.length - 1]!;
        output[`close_volscale_${timeframe}`] = latest.scaledValue;
        output[`volatility_${timeframe}`] = latest.volatility;
        output[`scale_factor_${timeframe}`] = latest.scaleFactor;
      }
    } catch {
      // Insufficient data
    }
  }

  if (!latestCandle) {
    return null;
  }

  return {
    timestamp: latestCandle.timestamp,
    values: output,
  };
}

/**
 * Apply transforms to indicator outputs.
 *
 * @param indicatorValues - Map of indicator name to historical values
 * @param timestamps - Timestamps for the values
 * @param timeframe - Timeframe identifier
 * @param config - Transform configuration
 * @returns Named transform outputs
 */
export function applyTransformsToIndicators(
  indicatorValues: Map<string, number[]>,
  timestamps: number[],
  _timeframe: Timeframe,
  config: TransformPipelineConfig = DEFAULT_TRANSFORM_CONFIG
): NamedIndicatorOutput {
  const output: NamedIndicatorOutput = {};

  // Apply z-scores to specified indicators
  if (config.zscore?.enabled && config.zscore.applyTo) {
    const lookback = config.zscore.params?.lookback ?? ZSCORE_DEFAULTS.lookback;
    const minSamples = config.zscore.params?.minSamples ?? ZSCORE_DEFAULTS.minSamples;

    for (const indicatorName of config.zscore.applyTo) {
      // Find matching indicator values
      for (const [key, values] of indicatorValues) {
        if (key.startsWith(indicatorName)) {
          try {
            const results = calculateZScore(values, timestamps, { lookback, minSamples });

            if (results.length > 0) {
              const latest = results[results.length - 1]!;
              output[`${key}_zscore`] = latest.zscore;
            }
          } catch {
            output[`${key}_zscore`] = null;
          }
        }
      }
    }
  }

  // Apply percentile ranks to specified indicators
  if (config.percentileRank?.enabled && config.percentileRank.applyTo) {
    const lookback = config.percentileRank.params?.lookback ?? PERCENTILE_RANK_DEFAULTS.lookback;
    const minSamples =
      config.percentileRank.params?.minSamples ?? PERCENTILE_RANK_DEFAULTS.minSamples;

    for (const indicatorName of config.percentileRank.applyTo) {
      for (const [key, values] of indicatorValues) {
        if (key.startsWith(indicatorName)) {
          try {
            const results = calculatePercentileRank(values, timestamps, { lookback, minSamples });

            if (results.length > 0) {
              const latest = results[results.length - 1]!;
              output[`${key}_pct`] = latest.percentile;
            }
          } catch {
            output[`${key}_pct`] = null;
          }
        }
      }
    }
  }

  return output;
}

/**
 * Get required warmup period for transforms.
 */
export function getTransformWarmupPeriod(
  config: TransformPipelineConfig = DEFAULT_TRANSFORM_CONFIG
): number {
  let maxPeriod = 0;

  if (config.returns?.enabled) {
    const periods = config.returns.params?.periods ?? RETURNS_DEFAULTS.periods;
    maxPeriod = Math.max(maxPeriod, ...periods);
  }

  if (config.zscore?.enabled) {
    maxPeriod = Math.max(maxPeriod, config.zscore.params?.lookback ?? ZSCORE_DEFAULTS.lookback);
  }

  if (config.percentileRank?.enabled) {
    maxPeriod = Math.max(
      maxPeriod,
      config.percentileRank.params?.lookback ?? PERCENTILE_RANK_DEFAULTS.lookback
    );
  }

  if (config.volatilityScale?.enabled) {
    maxPeriod = Math.max(
      maxPeriod,
      config.volatilityScale.params?.volatilityPeriod ?? VOLATILITY_SCALE_DEFAULTS.volatilityPeriod
    );
  }

  return maxPeriod;
}

// ============================================
// Exports
// ============================================

export default {
  applyTransforms,
  applyTransformsToIndicators,
  getTransformWarmupPeriod,
  DEFAULT_TRANSFORM_CONFIG,
};
