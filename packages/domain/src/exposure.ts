/**
 * Portfolio Exposure Calculations
 *
 * Implements gross and net exposure calculations for portfolio risk statistics.
 * Reference: docs/plans/06-decision-contract.md (Position Sizing)
 *
 * Formulas:
 * - Gross Exposure = abs(long) + abs(short) = sum of absolute exposures
 * - Net Exposure = long - short = directional bias
 *
 * Example: 70% long + 30% short = 100% gross, 40% net
 */

import { z } from "zod";
import type { Position } from "./execution";
import type { InstrumentType } from "./decision";

// ============================================
// Types
// ============================================

/** Bucket key for aggregating exposures */
export type ExposureBucket =
  | "total"
  | "instrument_type"
  | "sector"
  | "strategy"
  | "asset_class";

/** Position with optional metadata for bucketing */
export interface PositionWithMetadata {
  /** The base position data */
  position: Position;
  /** Optional sector classification (e.g., "Technology", "Healthcare") */
  sector?: string;
  /** Optional strategy identifier (e.g., "momentum", "mean_reversion") */
  strategy?: string;
  /** Optional asset class (e.g., "equity", "fixed_income") */
  assetClass?: string;
}

/** Exposure values in different units */
export interface ExposureValues {
  /** Exposure in number of units (shares/contracts) */
  units: number;
  /** Exposure in notional value (dollars) */
  notional: number;
  /** Exposure as percentage of equity (0-1, e.g., 0.70 = 70%) */
  pctEquity: number;
}

/** Gross and net exposure pair */
export interface ExposurePair {
  /** Gross exposure (sum of absolute values) */
  gross: ExposureValues;
  /** Net exposure (long - short) */
  net: ExposureValues;
  /** Long exposure */
  long: ExposureValues;
  /** Short exposure */
  short: ExposureValues;
}

/** Bucketed exposure results */
export interface BucketedExposure {
  /** Bucket type used for grouping */
  bucketType: ExposureBucket;
  /** Total exposure across all positions */
  total: ExposurePair;
  /** Breakdown by bucket key */
  breakdown: Map<string, ExposurePair>;
}

/** Simple exposure stats without bucketing */
export interface ExposureStats {
  /** Total gross exposure (notional) */
  grossExposureNotional: number;
  /** Total net exposure (notional) */
  netExposureNotional: number;
  /** Gross exposure as % of equity */
  grossExposurePctEquity: number;
  /** Net exposure as % of equity */
  netExposurePctEquity: number;
  /** Long exposure (notional) */
  longExposureNotional: number;
  /** Short exposure (notional) */
  shortExposureNotional: number;
  /** Number of long positions */
  longPositionCount: number;
  /** Number of short positions */
  shortPositionCount: number;
  /** Total position count */
  totalPositionCount: number;
}

// ============================================
// Zod Schemas
// ============================================

export const ExposureValuesSchema = z.object({
  units: z.number(),
  notional: z.number(),
  pctEquity: z.number(),
});

export const ExposurePairSchema = z.object({
  gross: ExposureValuesSchema,
  net: ExposureValuesSchema,
  long: ExposureValuesSchema,
  short: ExposureValuesSchema,
});

export const ExposureStatsSchema = z.object({
  grossExposureNotional: z.number().nonnegative(),
  netExposureNotional: z.number(),
  grossExposurePctEquity: z.number().nonnegative(),
  netExposurePctEquity: z.number(),
  longExposureNotional: z.number().nonnegative(),
  shortExposureNotional: z.number().nonnegative(),
  longPositionCount: z.number().int().nonnegative(),
  shortPositionCount: z.number().int().nonnegative(),
  totalPositionCount: z.number().int().nonnegative(),
});

// ============================================
// Core Calculation Functions
// ============================================

/**
 * Calculate exposure statistics for a portfolio.
 *
 * This is the main entry point for simple exposure calculation.
 *
 * @param positions - Array of positions
 * @param accountEquity - Total account equity for percentage calculation
 * @returns ExposureStats with gross/net exposure in different units
 *
 * @example
 * ```typescript
 * const positions = [
 *   { quantity: 100, marketValue: 70000, ... },   // Long 70%
 *   { quantity: -50, marketValue: -30000, ... },  // Short 30%
 * ];
 * const stats = calculateExposureStats(positions, 100000);
 * // stats.grossExposurePctEquity = 1.0 (100%)
 * // stats.netExposurePctEquity = 0.4 (40%)
 * ```
 */
export function calculateExposureStats(
  positions: Position[],
  accountEquity: number
): ExposureStats {
  if (accountEquity <= 0) {
    throw new Error("accountEquity must be positive");
  }

  let longNotional = 0;
  let shortNotional = 0;
  let longCount = 0;
  let shortCount = 0;

  for (const pos of positions) {
    // Use absolute market value for notional calculation
    const notional = Math.abs(pos.marketValue);

    if (pos.quantity > 0) {
      longNotional += notional;
      longCount++;
    } else if (pos.quantity < 0) {
      shortNotional += notional;
      shortCount++;
    }
    // Zero quantity positions are ignored
  }

  const grossNotional = longNotional + shortNotional;
  const netNotional = longNotional - shortNotional;

  return {
    grossExposureNotional: grossNotional,
    netExposureNotional: netNotional,
    grossExposurePctEquity: grossNotional / accountEquity,
    netExposurePctEquity: netNotional / accountEquity,
    longExposureNotional: longNotional,
    shortExposureNotional: shortNotional,
    longPositionCount: longCount,
    shortPositionCount: shortCount,
    totalPositionCount: longCount + shortCount,
  };
}

/**
 * Calculate exposure pair (gross/net/long/short) from positions.
 *
 * @param positions - Array of positions
 * @param accountEquity - Total account equity
 * @returns ExposurePair with all exposure metrics
 */
export function calculateExposurePair(
  positions: Position[],
  accountEquity: number
): ExposurePair {
  if (accountEquity <= 0) {
    throw new Error("accountEquity must be positive");
  }

  let longUnits = 0;
  let shortUnits = 0;
  let longNotional = 0;
  let shortNotional = 0;

  for (const pos of positions) {
    const notional = Math.abs(pos.marketValue);
    const units = Math.abs(pos.quantity);

    if (pos.quantity > 0) {
      longUnits += units;
      longNotional += notional;
    } else if (pos.quantity < 0) {
      shortUnits += units;
      shortNotional += notional;
    }
  }

  const grossUnits = longUnits + shortUnits;
  const grossNotional = longNotional + shortNotional;
  const netUnits = longUnits - shortUnits;
  const netNotional = longNotional - shortNotional;

  return {
    gross: {
      units: grossUnits,
      notional: grossNotional,
      pctEquity: grossNotional / accountEquity,
    },
    net: {
      units: netUnits,
      notional: netNotional,
      pctEquity: netNotional / accountEquity,
    },
    long: {
      units: longUnits,
      notional: longNotional,
      pctEquity: longNotional / accountEquity,
    },
    short: {
      units: shortUnits,
      notional: shortNotional,
      pctEquity: shortNotional / accountEquity,
    },
  };
}

// ============================================
// Bucketed Exposure Functions
// ============================================

/**
 * Calculate exposure bucketed by instrument type.
 *
 * Groups positions by their instrument type (EQUITY, OPTION).
 *
 * @param positions - Array of positions
 * @param accountEquity - Total account equity
 * @returns BucketedExposure with breakdown by instrument type
 */
export function calculateExposureByInstrumentType(
  positions: Position[],
  accountEquity: number
): BucketedExposure {
  if (accountEquity <= 0) {
    throw new Error("accountEquity must be positive");
  }

  const buckets = new Map<string, Position[]>();

  for (const pos of positions) {
    const key = pos.instrument.type;
    const existing = buckets.get(key) ?? [];
    existing.push(pos);
    buckets.set(key, existing);
  }

  const breakdown = new Map<string, ExposurePair>();
  for (const [key, bucketPositions] of buckets) {
    breakdown.set(key, calculateExposurePair(bucketPositions, accountEquity));
  }

  return {
    bucketType: "instrument_type",
    total: calculateExposurePair(positions, accountEquity),
    breakdown,
  };
}

/**
 * Calculate exposure bucketed by a custom field.
 *
 * Groups positions by sector, strategy, or asset class.
 *
 * @param positions - Array of positions with metadata
 * @param accountEquity - Total account equity
 * @param bucketType - The field to bucket by
 * @returns BucketedExposure with breakdown by the specified bucket
 */
export function calculateExposureByBucket(
  positions: PositionWithMetadata[],
  accountEquity: number,
  bucketType: "sector" | "strategy" | "asset_class"
): BucketedExposure {
  if (accountEquity <= 0) {
    throw new Error("accountEquity must be positive");
  }

  const buckets = new Map<string, Position[]>();

  for (const { position, sector, strategy, assetClass } of positions) {
    let key: string;
    switch (bucketType) {
      case "sector":
        key = sector ?? "Unknown";
        break;
      case "strategy":
        key = strategy ?? "Unknown";
        break;
      case "asset_class":
        key = assetClass ?? "Unknown";
        break;
    }

    const existing = buckets.get(key) ?? [];
    existing.push(position);
    buckets.set(key, existing);
  }

  const allPositions = positions.map((p) => p.position);
  const breakdown = new Map<string, ExposurePair>();
  for (const [key, bucketPositions] of buckets) {
    breakdown.set(key, calculateExposurePair(bucketPositions, accountEquity));
  }

  return {
    bucketType,
    total: calculateExposurePair(allPositions, accountEquity),
    breakdown,
  };
}

/**
 * Calculate exposure by sector.
 *
 * Convenience function for sector-based exposure bucketing.
 *
 * @param positions - Array of positions with sector metadata
 * @param accountEquity - Total account equity
 * @returns BucketedExposure with sector breakdown
 */
export function calculateExposureBySector(
  positions: PositionWithMetadata[],
  accountEquity: number
): BucketedExposure {
  return calculateExposureByBucket(positions, accountEquity, "sector");
}

/**
 * Calculate exposure by strategy.
 *
 * Convenience function for strategy-based exposure bucketing.
 *
 * @param positions - Array of positions with strategy metadata
 * @param accountEquity - Total account equity
 * @returns BucketedExposure with strategy breakdown
 */
export function calculateExposureByStrategy(
  positions: PositionWithMetadata[],
  accountEquity: number
): BucketedExposure {
  return calculateExposureByBucket(positions, accountEquity, "strategy");
}

/**
 * Calculate exposure by asset class.
 *
 * Convenience function for asset class-based exposure bucketing.
 *
 * @param positions - Array of positions with asset class metadata
 * @param accountEquity - Total account equity
 * @returns BucketedExposure with asset class breakdown
 */
export function calculateExposureByAssetClass(
  positions: PositionWithMetadata[],
  accountEquity: number
): BucketedExposure {
  return calculateExposureByBucket(positions, accountEquity, "asset_class");
}

// ============================================
// Exposure Limits and Validation
// ============================================

/** Exposure limit configuration */
export interface ExposureLimits {
  /** Maximum gross exposure as % of equity (default: 2.0 = 200%) */
  maxGrossExposure?: number;
  /** Maximum net exposure as % of equity (default: 1.0 = 100%) */
  maxNetExposure?: number;
  /** Maximum single-position exposure as % of equity (default: 0.20 = 20%) */
  maxSinglePositionExposure?: number;
  /** Maximum sector exposure as % of equity (default: 0.40 = 40%) */
  maxSectorExposure?: number;
}

/** Default exposure limits */
export const DEFAULT_EXPOSURE_LIMITS: Required<ExposureLimits> = {
  maxGrossExposure: 2.0, // 200%
  maxNetExposure: 1.0, // 100%
  maxSinglePositionExposure: 0.2, // 20%
  maxSectorExposure: 0.4, // 40%
};

/** Exposure limit violation */
export interface ExposureViolation {
  /** Type of limit violated */
  limitType: "gross" | "net" | "single_position" | "sector";
  /** Current value */
  currentValue: number;
  /** Limit value */
  limit: number;
  /** Human-readable message */
  message: string;
  /** Additional context (e.g., symbol or sector name) */
  context?: string;
}

/** Result of exposure validation */
export interface ExposureValidationResult {
  /** Whether all limits are satisfied */
  valid: boolean;
  /** List of violations (empty if valid) */
  violations: ExposureViolation[];
  /** Current exposure stats */
  stats: ExposureStats;
}

/**
 * Validate portfolio exposure against limits.
 *
 * Checks gross, net, and single-position exposure limits.
 *
 * @param positions - Array of positions
 * @param accountEquity - Total account equity
 * @param limits - Optional custom limits (defaults applied if not specified)
 * @returns ExposureValidationResult with validation status and violations
 */
export function validateExposure(
  positions: Position[],
  accountEquity: number,
  limits: ExposureLimits = {}
): ExposureValidationResult {
  const effectiveLimits = { ...DEFAULT_EXPOSURE_LIMITS, ...limits };
  const stats = calculateExposureStats(positions, accountEquity);
  const violations: ExposureViolation[] = [];

  // Check gross exposure
  if (stats.grossExposurePctEquity > effectiveLimits.maxGrossExposure) {
    violations.push({
      limitType: "gross",
      currentValue: stats.grossExposurePctEquity,
      limit: effectiveLimits.maxGrossExposure,
      message: `Gross exposure ${(stats.grossExposurePctEquity * 100).toFixed(1)}% exceeds limit of ${(effectiveLimits.maxGrossExposure * 100).toFixed(1)}%`,
    });
  }

  // Check net exposure (absolute value)
  if (Math.abs(stats.netExposurePctEquity) > effectiveLimits.maxNetExposure) {
    violations.push({
      limitType: "net",
      currentValue: stats.netExposurePctEquity,
      limit: effectiveLimits.maxNetExposure,
      message: `Net exposure ${(stats.netExposurePctEquity * 100).toFixed(1)}% exceeds limit of ${(effectiveLimits.maxNetExposure * 100).toFixed(1)}%`,
    });
  }

  // Check single-position exposure
  for (const pos of positions) {
    const posExposure = Math.abs(pos.marketValue) / accountEquity;
    if (posExposure > effectiveLimits.maxSinglePositionExposure) {
      violations.push({
        limitType: "single_position",
        currentValue: posExposure,
        limit: effectiveLimits.maxSinglePositionExposure,
        message: `Position ${pos.instrument.symbol} exposure ${(posExposure * 100).toFixed(1)}% exceeds limit of ${(effectiveLimits.maxSinglePositionExposure * 100).toFixed(1)}%`,
        context: pos.instrument.symbol,
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    stats,
  };
}

/**
 * Validate sector exposure against limits.
 *
 * @param positions - Array of positions with sector metadata
 * @param accountEquity - Total account equity
 * @param maxSectorExposure - Maximum sector exposure (default: 40%)
 * @returns Array of sector violations (empty if all valid)
 */
export function validateSectorExposure(
  positions: PositionWithMetadata[],
  accountEquity: number,
  maxSectorExposure: number = DEFAULT_EXPOSURE_LIMITS.maxSectorExposure
): ExposureViolation[] {
  const violations: ExposureViolation[] = [];
  const sectorExposure = calculateExposureBySector(positions, accountEquity);

  for (const [sector, exposure] of sectorExposure.breakdown) {
    if (exposure.gross.pctEquity > maxSectorExposure) {
      violations.push({
        limitType: "sector",
        currentValue: exposure.gross.pctEquity,
        limit: maxSectorExposure,
        message: `Sector ${sector} exposure ${(exposure.gross.pctEquity * 100).toFixed(1)}% exceeds limit of ${(maxSectorExposure * 100).toFixed(1)}%`,
        context: sector,
      });
    }
  }

  return violations;
}

// ============================================
// Delta-Adjusted Exposure (for Options)
// ============================================

/** Position with delta for options exposure calculation */
export interface PositionWithDelta extends Position {
  /** Delta for options (0-1 for calls, -1-0 for puts). Undefined for equity. */
  delta?: number;
  /** Underlying price for options (required if delta is provided) */
  underlyingPrice?: number;
}

/**
 * Calculate delta-adjusted exposure for a portfolio with options.
 *
 * For options, uses delta-adjusted notional: |delta| × underlying price × quantity × multiplier
 * For equities, uses standard notional (delta = 1).
 *
 * @param positions - Array of positions with optional delta
 * @param accountEquity - Total account equity
 * @returns ExposureStats with delta-adjusted exposure
 */
export function calculateDeltaAdjustedExposure(
  positions: PositionWithDelta[],
  accountEquity: number
): ExposureStats {
  if (accountEquity <= 0) {
    throw new Error("accountEquity must be positive");
  }

  let longNotional = 0;
  let shortNotional = 0;
  let longCount = 0;
  let shortCount = 0;

  for (const pos of positions) {
    let notional: number;

    if (pos.delta !== undefined && pos.underlyingPrice !== undefined) {
      // Options: use delta-adjusted exposure
      // Delta exposure = |delta| × underlying × |qty| × multiplier(100)
      const multiplier = pos.instrument.type === "OPTION" ? 100 : 1;
      notional = Math.abs(pos.delta) * pos.underlyingPrice * Math.abs(pos.quantity) * multiplier;
    } else {
      // Equities: use market value
      notional = Math.abs(pos.marketValue);
    }

    // Determine direction from signed quantity
    if (pos.quantity > 0) {
      longNotional += notional;
      longCount++;
    } else if (pos.quantity < 0) {
      shortNotional += notional;
      shortCount++;
    }
  }

  const grossNotional = longNotional + shortNotional;
  const netNotional = longNotional - shortNotional;

  return {
    grossExposureNotional: grossNotional,
    netExposureNotional: netNotional,
    grossExposurePctEquity: grossNotional / accountEquity,
    netExposurePctEquity: netNotional / accountEquity,
    longExposureNotional: longNotional,
    shortExposureNotional: shortNotional,
    longPositionCount: longCount,
    shortPositionCount: shortCount,
    totalPositionCount: longCount + shortCount,
  };
}

// ============================================
// Formatting Utilities
// ============================================

/**
 * Format exposure stats as a human-readable string.
 *
 * @param stats - Exposure statistics
 * @returns Formatted string summary
 */
export function formatExposureStats(stats: ExposureStats): string {
  const lines = [
    `Gross Exposure: ${(stats.grossExposurePctEquity * 100).toFixed(1)}% ($${stats.grossExposureNotional.toLocaleString()})`,
    `Net Exposure: ${(stats.netExposurePctEquity * 100).toFixed(1)}% ($${stats.netExposureNotional.toLocaleString()})`,
    `Long: ${(stats.longExposureNotional / stats.grossExposureNotional * 100 || 0).toFixed(1)}% ($${stats.longExposureNotional.toLocaleString()}) - ${stats.longPositionCount} positions`,
    `Short: ${(stats.shortExposureNotional / stats.grossExposureNotional * 100 || 0).toFixed(1)}% ($${stats.shortExposureNotional.toLocaleString()}) - ${stats.shortPositionCount} positions`,
  ];
  return lines.join("\n");
}

/**
 * Create empty exposure stats.
 *
 * @returns ExposureStats with all zero values
 */
export function createEmptyExposureStats(): ExposureStats {
  return {
    grossExposureNotional: 0,
    netExposureNotional: 0,
    grossExposurePctEquity: 0,
    netExposurePctEquity: 0,
    longExposureNotional: 0,
    shortExposureNotional: 0,
    longPositionCount: 0,
    shortPositionCount: 0,
    totalPositionCount: 0,
  };
}
