/**
 * Indicator Storage Service
 *
 * Persists calculated indicators to the features storage for historical analysis.
 *
 * @see docs/plans/03-market-snapshot.md
 * @see packages/storage/src/repositories/features.ts
 */

import type { FeatureInsert, FeaturesRepository } from "@cream/storage";
import type { IndicatorSnapshot, Timeframe } from "./types";

// ============================================
// Types
// ============================================

/**
 * Options for persisting indicators.
 */
export interface PersistIndicatorsOptions {
  /** Symbol for the indicators */
  symbol: string;
  /** Timeframe of the source data */
  timeframe: Timeframe;
  /** Optional quality score (0-1) */
  qualityScore?: number;
  /** Whether to normalize values using z-score */
  normalize?: boolean;
}

/**
 * Result of persistence operation.
 */
export interface PersistResult {
  /** Number of indicators persisted */
  count: number;
  /** Number of indicators skipped (null values) */
  skipped: number;
  /** Symbol processed */
  symbol: string;
  /** Timestamp of the snapshot */
  timestamp: string;
}

// ============================================
// Persistence Functions
// ============================================

/**
 * Persist a single indicator snapshot to storage.
 *
 * @param snapshot - Calculated indicator snapshot
 * @param repo - Features repository instance
 * @param options - Persistence options
 * @returns Result of the persistence operation
 *
 * @example
 * ```typescript
 * import { calculateIndicators } from "@cream/indicators";
 * import { FeaturesRepository } from "@cream/storage";
 *
 * const snapshot = calculateIndicators(candles, "1h");
 * const result = await persistIndicators(snapshot, repo, {
 *   symbol: "AAPL",
 *   timeframe: "1h",
 * });
 * console.log(`Persisted ${result.count} indicators`);
 * ```
 */
export async function persistIndicators(
  snapshot: IndicatorSnapshot,
  repo: FeaturesRepository,
  options: PersistIndicatorsOptions
): Promise<PersistResult> {
  const { symbol, timeframe, qualityScore } = options;
  const timestamp = new Date(snapshot.timestamp).toISOString();

  const features: FeatureInsert[] = [];
  let skipped = 0;

  for (const [name, value] of Object.entries(snapshot.values)) {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      skipped++;
      continue;
    }

    // Parse indicator name to extract parameters
    // Format: {indicator}_{param}_{timeframe} (e.g., "rsi_14_1h")
    const parameters = parseIndicatorName(name);

    features.push({
      symbol,
      timestamp,
      timeframe,
      indicatorName: name,
      rawValue: value,
      normalizedValue: null, // Set by normalization pass if enabled
      parameters,
      qualityScore: qualityScore ?? null,
    });
  }

  // Bulk insert all features
  if (features.length > 0) {
    await repo.bulkUpsert(features);
  }

  return {
    count: features.length,
    skipped,
    symbol,
    timestamp,
  };
}

/**
 * Persist indicators for multiple symbols in parallel.
 *
 * @param snapshots - Map of symbol to indicator snapshot
 * @param repo - Features repository instance
 * @param options - Base options (symbol will be overridden per snapshot)
 * @returns Array of persistence results
 */
export async function persistMultipleIndicators(
  snapshots: Map<string, IndicatorSnapshot>,
  repo: FeaturesRepository,
  options: Omit<PersistIndicatorsOptions, "symbol">
): Promise<PersistResult[]> {
  const promises: Promise<PersistResult>[] = [];

  for (const [symbol, snapshot] of snapshots) {
    promises.push(
      persistIndicators(snapshot, repo, {
        ...options,
        symbol,
      })
    );
  }

  return Promise.all(promises);
}

/**
 * Persist historical indicator snapshots (for backtesting data prep).
 *
 * @param snapshots - Array of indicator snapshots
 * @param repo - Features repository instance
 * @param options - Persistence options
 * @returns Total count of persisted indicators
 */
export async function persistHistoricalIndicators(
  snapshots: IndicatorSnapshot[],
  repo: FeaturesRepository,
  options: PersistIndicatorsOptions
): Promise<{ total: number; skipped: number }> {
  let total = 0;
  let skipped = 0;

  // Process in batches to avoid overwhelming the database
  const BATCH_SIZE = 100;

  for (let i = 0; i < snapshots.length; i += BATCH_SIZE) {
    const batch = snapshots.slice(i, i + BATCH_SIZE);
    const features: FeatureInsert[] = [];

    for (const snapshot of batch) {
      const timestamp = new Date(snapshot.timestamp).toISOString();

      for (const [name, value] of Object.entries(snapshot.values)) {
        if (value === null || value === undefined || !Number.isFinite(value)) {
          skipped++;
          continue;
        }

        const parameters = parseIndicatorName(name);

        features.push({
          symbol: options.symbol,
          timestamp,
          timeframe: options.timeframe,
          indicatorName: name,
          rawValue: value,
          normalizedValue: null,
          parameters,
          qualityScore: options.qualityScore ?? null,
        });
      }
    }

    if (features.length > 0) {
      await repo.bulkUpsert(features);
      total += features.length;
    }
  }

  return { total, skipped };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Parse indicator name to extract parameters.
 *
 * @param name - Indicator name (e.g., "rsi_14_1h", "sma_20_1d")
 * @returns Parameters object
 */
function parseIndicatorName(name: string): Record<string, unknown> | null {
  const parts = name.split("_");

  if (parts.length < 2) {
    return null;
  }

  const indicator = parts[0];
  const parameters: Record<string, unknown> = { indicator };

  // Handle different indicator formats
  if (indicator === "rsi" || indicator === "atr" || indicator === "sma" || indicator === "ema") {
    // Format: {indicator}_{period}_{timeframe}
    if (parts[1]) {
      parameters.period = parseInt(parts[1], 10);
    }
  } else if (indicator === "stochastic") {
    // Format: stochastic_{k|d}_{period}_{timeframe}
    if (parts[1]) {
      parameters.line = parts[1]; // k or d
    }
    if (parts[2]) {
      parameters.period = parseInt(parts[2], 10);
    }
  } else if (indicator === "bb") {
    // Format: bb_{upper|middle|lower|bandwidth|percentb}_{period}_{timeframe}
    if (parts[1]) {
      parameters.band = parts[1];
    }
    if (parts[2]) {
      parameters.period = parseInt(parts[2], 10);
    }
  } else if (indicator === "volume") {
    // Format: volume_{sma|ratio}_{period}_{timeframe}
    if (parts[1]) {
      parameters.type = parts[1];
    }
    if (parts[2]) {
      parameters.period = parseInt(parts[2], 10);
    }
  }

  return Object.keys(parameters).length > 1 ? parameters : null;
}

export default {
  persistIndicators,
  persistMultipleIndicators,
  persistHistoricalIndicators,
};
