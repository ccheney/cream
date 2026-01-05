/**
 * Indicator Pipeline Orchestrator
 *
 * Coordinates calculation of multiple indicators across multiple timeframes.
 * Produces named output in format: {indicator}_{param}_{timeframe}
 */

import type {
  Candle,
  Timeframe,
  NamedIndicatorOutput,
  IndicatorSnapshot,
} from "./types";

import { calculateRSI, RSI_DEFAULTS } from "./momentum/rsi";
import { calculateStochastic, STOCHASTIC_DEFAULTS } from "./momentum/stochastic";
import { calculateSMA, SMA_PERIODS } from "./trend/sma";
import { calculateEMA, EMA_PERIODS } from "./trend/ema";
import { calculateATR, ATR_DEFAULTS } from "./volatility/atr";
import { calculateBollingerBands, BOLLINGER_DEFAULTS } from "./volatility/bollinger";
import { calculateVolumeSMA, VOLUME_SMA_DEFAULTS } from "./volume/volumeSma";

// ============================================
// Configuration Types
// ============================================

/**
 * Indicator configuration for pipeline.
 */
export interface IndicatorPipelineConfig {
  rsi?: {
    enabled: boolean;
    period?: number;
  };
  stochastic?: {
    enabled: boolean;
    kPeriod?: number;
    dPeriod?: number;
    slow?: boolean;
  };
  sma?: {
    enabled: boolean;
    periods?: number[];
  };
  ema?: {
    enabled: boolean;
    periods?: number[];
  };
  atr?: {
    enabled: boolean;
    period?: number;
  };
  bollinger?: {
    enabled: boolean;
    period?: number;
    stdDev?: number;
  };
  volumeSma?: {
    enabled: boolean;
    period?: number;
  };
}

/**
 * Default pipeline configuration.
 */
export const DEFAULT_PIPELINE_CONFIG: IndicatorPipelineConfig = {
  rsi: { enabled: true, period: RSI_DEFAULTS.period },
  stochastic: {
    enabled: true,
    kPeriod: STOCHASTIC_DEFAULTS.kPeriod,
    dPeriod: STOCHASTIC_DEFAULTS.dPeriod,
    slow: STOCHASTIC_DEFAULTS.slow,
  },
  sma: {
    enabled: true,
    periods: [SMA_PERIODS.SHORT, SMA_PERIODS.MEDIUM, SMA_PERIODS.LONG],
  },
  ema: { enabled: true, periods: [EMA_PERIODS.SCALP, EMA_PERIODS.SHORT] },
  atr: { enabled: true, period: ATR_DEFAULTS.period },
  bollinger: {
    enabled: true,
    period: BOLLINGER_DEFAULTS.period,
    stdDev: BOLLINGER_DEFAULTS.stdDev,
  },
  volumeSma: { enabled: true, period: VOLUME_SMA_DEFAULTS.period },
};

// ============================================
// Pipeline Implementation
// ============================================

/**
 * Calculate all enabled indicators for a single timeframe.
 *
 * @param candles - OHLCV data for this timeframe
 * @param timeframe - Timeframe identifier (e.g., "1h", "4h", "1d")
 * @param config - Indicator configuration
 * @returns Named indicator outputs
 */
export function calculateIndicators(
  candles: Candle[],
  timeframe: Timeframe,
  config: IndicatorPipelineConfig = DEFAULT_PIPELINE_CONFIG
): IndicatorSnapshot | null {
  if (candles.length === 0) {
    return null;
  }

  const output: NamedIndicatorOutput = {};
  const latestCandle = candles[candles.length - 1];

  // RSI
  if (config.rsi?.enabled) {
    const period = config.rsi.period ?? RSI_DEFAULTS.period;
    try {
      const results = calculateRSI(candles, { period });
      if (results.length > 0) {
        const latest = results[results.length - 1];
        output[`rsi_${period}_${timeframe}`] = latest.rsi;
      }
    } catch {
      output[`rsi_${period}_${timeframe}`] = null;
    }
  }

  // Stochastic
  if (config.stochastic?.enabled) {
    const kPeriod = config.stochastic.kPeriod ?? STOCHASTIC_DEFAULTS.kPeriod;
    const dPeriod = config.stochastic.dPeriod ?? STOCHASTIC_DEFAULTS.dPeriod;
    const slow = config.stochastic.slow ?? STOCHASTIC_DEFAULTS.slow;
    try {
      const results = calculateStochastic(candles, { kPeriod, dPeriod, slow });
      if (results.length > 0) {
        const latest = results[results.length - 1];
        output[`stochastic_k_${kPeriod}_${timeframe}`] = latest.k;
        output[`stochastic_d_${dPeriod}_${timeframe}`] = latest.d;
      }
    } catch {
      output[`stochastic_k_${kPeriod}_${timeframe}`] = null;
      output[`stochastic_d_${dPeriod}_${timeframe}`] = null;
    }
  }

  // SMA
  if (config.sma?.enabled) {
    const periods = config.sma.periods ?? [
      SMA_PERIODS.SHORT,
      SMA_PERIODS.MEDIUM,
      SMA_PERIODS.LONG,
    ];
    for (const period of periods) {
      try {
        const results = calculateSMA(candles, { period });
        if (results.length > 0) {
          const latest = results[results.length - 1];
          output[`sma_${period}_${timeframe}`] = latest.ma;
        }
      } catch {
        output[`sma_${period}_${timeframe}`] = null;
      }
    }
  }

  // EMA
  if (config.ema?.enabled) {
    const periods = config.ema.periods ?? [EMA_PERIODS.SCALP, EMA_PERIODS.SHORT];
    for (const period of periods) {
      try {
        const results = calculateEMA(candles, { period });
        if (results.length > 0) {
          const latest = results[results.length - 1];
          output[`ema_${period}_${timeframe}`] = latest.ma;
        }
      } catch {
        output[`ema_${period}_${timeframe}`] = null;
      }
    }
  }

  // ATR
  if (config.atr?.enabled) {
    const period = config.atr.period ?? ATR_DEFAULTS.period;
    try {
      const results = calculateATR(candles, { period });
      if (results.length > 0) {
        const latest = results[results.length - 1];
        output[`atr_${period}_${timeframe}`] = latest.atr;
      }
    } catch {
      output[`atr_${period}_${timeframe}`] = null;
    }
  }

  // Bollinger Bands
  if (config.bollinger?.enabled) {
    const period = config.bollinger.period ?? BOLLINGER_DEFAULTS.period;
    const stdDev = config.bollinger.stdDev ?? BOLLINGER_DEFAULTS.stdDev;
    try {
      const results = calculateBollingerBands(candles, { period, stdDev });
      if (results.length > 0) {
        const latest = results[results.length - 1];
        output[`bb_upper_${period}_${timeframe}`] = latest.upper;
        output[`bb_middle_${period}_${timeframe}`] = latest.middle;
        output[`bb_lower_${period}_${timeframe}`] = latest.lower;
        output[`bb_bandwidth_${period}_${timeframe}`] = latest.bandwidth;
        output[`bb_percentb_${period}_${timeframe}`] = latest.percentB;
      }
    } catch {
      output[`bb_upper_${period}_${timeframe}`] = null;
      output[`bb_middle_${period}_${timeframe}`] = null;
      output[`bb_lower_${period}_${timeframe}`] = null;
      output[`bb_bandwidth_${period}_${timeframe}`] = null;
      output[`bb_percentb_${period}_${timeframe}`] = null;
    }
  }

  // Volume SMA
  if (config.volumeSma?.enabled) {
    const period = config.volumeSma.period ?? VOLUME_SMA_DEFAULTS.period;
    try {
      const results = calculateVolumeSMA(candles, { period });
      if (results.length > 0) {
        const latest = results[results.length - 1];
        output[`volume_sma_${period}_${timeframe}`] = latest.volumeSma;
        output[`volume_ratio_${period}_${timeframe}`] = latest.volumeRatio;
      }
    } catch {
      output[`volume_sma_${period}_${timeframe}`] = null;
      output[`volume_ratio_${period}_${timeframe}`] = null;
    }
  }

  return {
    timestamp: latestCandle.timestamp,
    values: output,
  };
}

/**
 * Multi-timeframe indicator calculation.
 *
 * @param candlesByTimeframe - Map of timeframe to candles
 * @param config - Indicator configuration
 * @returns Combined indicator snapshot
 */
export function calculateMultiTimeframeIndicators(
  candlesByTimeframe: Map<Timeframe, Candle[]>,
  config: IndicatorPipelineConfig = DEFAULT_PIPELINE_CONFIG
): IndicatorSnapshot | null {
  const combinedOutput: NamedIndicatorOutput = {};
  let latestTimestamp = 0;

  for (const [timeframe, candles] of candlesByTimeframe) {
    const snapshot = calculateIndicators(candles, timeframe, config);
    if (snapshot) {
      // Merge outputs
      Object.assign(combinedOutput, snapshot.values);
      // Track latest timestamp
      if (snapshot.timestamp > latestTimestamp) {
        latestTimestamp = snapshot.timestamp;
      }
    }
  }

  if (Object.keys(combinedOutput).length === 0) {
    return null;
  }

  return {
    timestamp: latestTimestamp,
    values: combinedOutput,
  };
}

/**
 * Calculate historical indicator snapshots (for backtesting).
 *
 * @param candles - OHLCV data (oldest first)
 * @param timeframe - Timeframe identifier
 * @param config - Indicator configuration
 * @param startIndex - Index to start calculating from
 * @returns Array of indicator snapshots
 */
export function calculateHistoricalIndicators(
  candles: Candle[],
  timeframe: Timeframe,
  config: IndicatorPipelineConfig = DEFAULT_PIPELINE_CONFIG,
  startIndex = 200 // Start after enough data for longest indicator
): IndicatorSnapshot[] {
  const snapshots: IndicatorSnapshot[] = [];

  for (let i = startIndex; i < candles.length; i++) {
    // Use candles up to current index (simulating real-time)
    const candlesUpToNow = candles.slice(0, i + 1);
    const snapshot = calculateIndicators(candlesUpToNow, timeframe, config);
    if (snapshot) {
      snapshots.push(snapshot);
    }
  }

  return snapshots;
}

/**
 * Get required warmup period for all enabled indicators.
 *
 * @param config - Indicator configuration
 * @returns Minimum number of candles needed
 */
export function getRequiredWarmupPeriod(
  config: IndicatorPipelineConfig = DEFAULT_PIPELINE_CONFIG
): number {
  let maxPeriod = 0;

  if (config.rsi?.enabled) {
    maxPeriod = Math.max(maxPeriod, (config.rsi.period ?? RSI_DEFAULTS.period) + 1);
  }

  if (config.stochastic?.enabled) {
    const kPeriod = config.stochastic.kPeriod ?? STOCHASTIC_DEFAULTS.kPeriod;
    const dPeriod = config.stochastic.dPeriod ?? STOCHASTIC_DEFAULTS.dPeriod;
    // Slow stochastic needs extra periods
    maxPeriod = Math.max(maxPeriod, kPeriod + dPeriod * 2 - 2);
  }

  if (config.sma?.enabled) {
    const periods = config.sma.periods ?? [
      SMA_PERIODS.SHORT,
      SMA_PERIODS.MEDIUM,
      SMA_PERIODS.LONG,
    ];
    maxPeriod = Math.max(maxPeriod, ...periods);
  }

  if (config.ema?.enabled) {
    const periods = config.ema.periods ?? [EMA_PERIODS.SCALP, EMA_PERIODS.SHORT];
    maxPeriod = Math.max(maxPeriod, ...periods);
  }

  if (config.atr?.enabled) {
    maxPeriod = Math.max(maxPeriod, (config.atr.period ?? ATR_DEFAULTS.period) + 1);
  }

  if (config.bollinger?.enabled) {
    maxPeriod = Math.max(maxPeriod, config.bollinger.period ?? BOLLINGER_DEFAULTS.period);
  }

  if (config.volumeSma?.enabled) {
    maxPeriod = Math.max(maxPeriod, config.volumeSma.period ?? VOLUME_SMA_DEFAULTS.period);
  }

  return maxPeriod;
}

export default {
  calculateIndicators,
  calculateMultiTimeframeIndicators,
  calculateHistoricalIndicators,
  getRequiredWarmupPeriod,
  DEFAULT_PIPELINE_CONFIG,
};
