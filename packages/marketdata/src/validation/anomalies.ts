/**
 * Anomaly Detection
 *
 * Detect volume anomalies, price spikes, and flash crash patterns.
 *
 * @see docs/plans/02-data-layer.md
 */

import { z } from "zod";
import type { Candle } from "./gaps";

// ============================================
// Types
// ============================================

export const AnomalyTypeSchema = z.enum([
  "volume_spike",
  "price_spike",
  "flash_crash",
  "flash_rally",
  "gap_up",
  "gap_down",
]);

export type AnomalyType = z.infer<typeof AnomalyTypeSchema>;

export interface AnomalyDetectionConfig {
  /** Standard deviations for volume anomaly (default: 5) */
  volumeSigmaThreshold: number;
  /** Price change threshold for spike detection (default: 0.10 for 10%) */
  priceSpikePct: number;
  /** Flash crash threshold (default: 0.05 for 5%) */
  flashCrashPct: number;
  /** Lookback period for calculating mean/std (default: 20) */
  lookbackPeriod: number;
  /** Minimum samples required for valid statistics */
  minSamples: number;
}

export const DEFAULT_ANOMALY_CONFIG: AnomalyDetectionConfig = {
  volumeSigmaThreshold: 5,
  priceSpikePct: 0.1,
  flashCrashPct: 0.05,
  lookbackPeriod: 20,
  minSamples: 10,
};

export interface Anomaly {
  type: AnomalyType;
  timestamp: string;
  symbol: string;
  value: number;
  threshold: number;
  severity: "warning" | "critical";
  description: string;
}

export interface AnomalyDetectionResult {
  symbol: string;
  anomalies: Anomaly[];
  hasAnomalies: boolean;
  volumeAnomalies: number;
  priceAnomalies: number;
  flashCrashes: number;
}

// ============================================
// Statistical Utilities
// ============================================

function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calculateStdDev(values: number[], mean?: number): number {
  if (values.length < 2) return 0;
  const m = mean ?? calculateMean(values);
  const squaredDiffs = values.map((v) => (v - m) ** 2);
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(variance);
}

function zScore(value: number, mean: number, std: number): number {
  if (std === 0) return 0;
  return (value - mean) / std;
}

// ============================================
// Volume Anomaly Detection
// ============================================

/**
 * Detect volume anomalies (>5σ from rolling mean).
 *
 * @param candles - Array of candles (oldest first)
 * @param config - Detection configuration
 * @returns Array of volume anomalies
 */
export function detectVolumeAnomalies(
  candles: Candle[],
  config: AnomalyDetectionConfig = DEFAULT_ANOMALY_CONFIG
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  if (candles.length < config.minSamples) {
    return anomalies;
  }

  for (let i = config.lookbackPeriod; i < candles.length; i++) {
    const candle = candles[i]!;

    // Calculate rolling statistics for volume
    const windowStart = Math.max(0, i - config.lookbackPeriod);
    const volumeWindow = candles.slice(windowStart, i).map((c) => c.volume);

    const mean = calculateMean(volumeWindow);
    const std = calculateStdDev(volumeWindow, mean);
    const z = zScore(candle.volume, mean, std);

    if (Math.abs(z) >= config.volumeSigmaThreshold) {
      anomalies.push({
        type: "volume_spike",
        timestamp: candle.timestamp,
        symbol: candle.symbol,
        value: z,
        threshold: config.volumeSigmaThreshold,
        severity: Math.abs(z) >= config.volumeSigmaThreshold * 1.5 ? "critical" : "warning",
        description: `Volume ${z > 0 ? "spike" : "drop"}: ${z.toFixed(2)}σ (${candle.volume.toLocaleString()} vs avg ${mean.toFixed(0)})`,
      });
    }
  }

  return anomalies;
}

// ============================================
// Price Spike Detection
// ============================================

/**
 * Detect price spikes (>10% single-candle move).
 *
 * @param candles - Array of candles (oldest first)
 * @param config - Detection configuration
 * @returns Array of price anomalies
 */
export function detectPriceSpikes(
  candles: Candle[],
  config: AnomalyDetectionConfig = DEFAULT_ANOMALY_CONFIG
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]!;
    const curr = candles[i]!;

    // Calculate percentage change
    const pctChange = (curr.close - prev.close) / prev.close;
    const absChange = Math.abs(pctChange);

    if (absChange >= config.priceSpikePct) {
      anomalies.push({
        type: "price_spike",
        timestamp: curr.timestamp,
        symbol: curr.symbol,
        value: pctChange,
        threshold: config.priceSpikePct,
        severity: absChange >= config.priceSpikePct * 1.5 ? "critical" : "warning",
        description: `Price ${pctChange > 0 ? "spike up" : "spike down"}: ${(pctChange * 100).toFixed(2)}%`,
      });
    }

    // Check for gap up/down (open significantly different from prev close)
    const gapPct = (curr.open - prev.close) / prev.close;
    if (Math.abs(gapPct) >= config.priceSpikePct) {
      anomalies.push({
        type: gapPct > 0 ? "gap_up" : "gap_down",
        timestamp: curr.timestamp,
        symbol: curr.symbol,
        value: gapPct,
        threshold: config.priceSpikePct,
        severity: "warning",
        description: `Gap ${gapPct > 0 ? "up" : "down"}: ${(gapPct * 100).toFixed(2)}%`,
      });
    }
  }

  return anomalies;
}

// ============================================
// Flash Crash Detection
// ============================================

/**
 * Detect flash crash patterns (>5% drop recovered within window).
 *
 * @param candles - Array of candles (oldest first)
 * @param config - Detection configuration
 * @param recoveryCandles - Number of candles to check for recovery (default: 5)
 * @returns Array of flash crash anomalies
 */
export function detectFlashCrashes(
  candles: Candle[],
  config: AnomalyDetectionConfig = DEFAULT_ANOMALY_CONFIG,
  recoveryCandles = 5
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  for (let i = 1; i < candles.length - recoveryCandles; i++) {
    const prev = candles[i - 1]!;
    const curr = candles[i]!;

    // Check for significant drop
    const dropPct = (curr.low - prev.close) / prev.close;

    if (dropPct <= -config.flashCrashPct) {
      // Check for recovery within window
      let recovered = false;
      for (let j = 1; j <= recoveryCandles && i + j < candles.length; j++) {
        const recoveryCandle = candles[i + j]!;
        const recoveryPct = (recoveryCandle.close - prev.close) / prev.close;

        // Consider recovered if price returns within 2% of original
        if (recoveryPct >= -0.02) {
          recovered = true;
          break;
        }
      }

      if (recovered) {
        anomalies.push({
          type: "flash_crash",
          timestamp: curr.timestamp,
          symbol: curr.symbol,
          value: dropPct,
          threshold: config.flashCrashPct,
          severity: "critical",
          description: `Flash crash: ${(dropPct * 100).toFixed(2)}% drop with recovery`,
        });
      }
    }

    // Check for significant rally
    const rallyPct = (curr.high - prev.close) / prev.close;

    if (rallyPct >= config.flashCrashPct) {
      // Check for reversal within window
      let reversed = false;
      for (let j = 1; j <= recoveryCandles && i + j < candles.length; j++) {
        const reversalCandle = candles[i + j]!;
        const reversalPct = (reversalCandle.close - prev.close) / prev.close;

        // Consider reversed if price returns within 2% of original
        if (reversalPct <= 0.02) {
          reversed = true;
          break;
        }
      }

      if (reversed) {
        anomalies.push({
          type: "flash_rally",
          timestamp: curr.timestamp,
          symbol: curr.symbol,
          value: rallyPct,
          threshold: config.flashCrashPct,
          severity: "critical",
          description: `Flash rally: ${(rallyPct * 100).toFixed(2)}% spike with reversal`,
        });
      }
    }
  }

  return anomalies;
}

// ============================================
// Combined Detection
// ============================================

/**
 * Run all anomaly detection on candle data.
 *
 * @param candles - Array of candles (oldest first)
 * @param config - Detection configuration
 * @returns Combined anomaly detection result
 */
export function detectAllAnomalies(
  candles: Candle[],
  config: AnomalyDetectionConfig = DEFAULT_ANOMALY_CONFIG
): AnomalyDetectionResult {
  if (candles.length === 0) {
    return {
      symbol: "",
      anomalies: [],
      hasAnomalies: false,
      volumeAnomalies: 0,
      priceAnomalies: 0,
      flashCrashes: 0,
    };
  }

  const volumeAnomalies = detectVolumeAnomalies(candles, config);
  const priceAnomalies = detectPriceSpikes(candles, config);
  const flashAnomalies = detectFlashCrashes(candles, config);

  const allAnomalies = [...volumeAnomalies, ...priceAnomalies, ...flashAnomalies];

  // Sort by timestamp
  allAnomalies.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return {
    symbol: candles[0]!.symbol,
    anomalies: allAnomalies,
    hasAnomalies: allAnomalies.length > 0,
    volumeAnomalies: volumeAnomalies.length,
    priceAnomalies: priceAnomalies.length,
    flashCrashes: flashAnomalies.filter((a) => a.type === "flash_crash" || a.type === "flash_rally").length,
  };
}

/**
 * Filter candles by removing or flagging anomalous data.
 *
 * @param candles - Array of candles
 * @param anomalies - Detected anomalies
 * @returns Candles with anomalous entries removed
 */
export function filterAnomalousCandles(candles: Candle[], anomalies: Anomaly[]): Candle[] {
  const anomalousTimestamps = new Set(
    anomalies.filter((a) => a.severity === "critical").map((a) => a.timestamp)
  );

  return candles.filter((c) => !anomalousTimestamps.has(c.timestamp));
}

export default {
  detectVolumeAnomalies,
  detectPriceSpikes,
  detectFlashCrashes,
  detectAllAnomalies,
  filterAnomalousCandles,
  DEFAULT_ANOMALY_CONFIG,
};
