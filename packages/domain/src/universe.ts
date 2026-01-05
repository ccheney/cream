/**
 * Universe Resolution Types
 *
 * Types for configuring and tracking the trading universe resolution pipeline.
 * The universe determines which instruments are candidates for trading each cycle.
 *
 * @see docs/plans/02-data-layer.md - Universe Selection
 */

import { z } from "zod";
import { Iso8601Schema } from "./time";

// ============================================
// Universe Source Types
// ============================================

/**
 * Type of universe source
 */
export const UniverseSourceType = z.enum([
  "static",
  "index",
  "etf_holdings",
  "screener",
]);
export type UniverseSourceType = z.infer<typeof UniverseSourceType>;

/**
 * Index type for index-based universe sources
 */
export const IndexType = z.enum([
  "SP500",
  "NASDAQ100",
  "DOW30",
  "RUSSELL2000",
  "SP400",
  "SP600",
]);
export type IndexType = z.infer<typeof IndexType>;

/**
 * Ranking metric for candidate selection
 */
export const RankingMetric = z.enum([
  "dollar_volume",
  "relative_volume",
  "volatility",
  "momentum",
  "none",
]);
export type RankingMetric = z.infer<typeof RankingMetric>;

/**
 * Composition mode for combining multiple universe sources
 */
export const ComposeMode = z.enum(["union", "intersection"]);
export type ComposeMode = z.infer<typeof ComposeMode>;

// ============================================
// Universe Source Schemas
// ============================================

/**
 * Base universe source with common fields
 */
const BaseUniverseSourceSchema = z.object({
  /** Unique name for this source */
  name: z.string().min(1),
  /** Whether this source is enabled */
  enabled: z.boolean().default(true),
});

/**
 * Static ticker list source
 */
export const StaticSourceSchema = BaseUniverseSourceSchema.extend({
  type: z.literal("static"),
  /** List of ticker symbols */
  tickers: z.array(z.string().min(1)).min(1),
});
export type StaticSource = z.infer<typeof StaticSourceSchema>;

/**
 * Index constituents source
 */
export const IndexSourceSchema = BaseUniverseSourceSchema.extend({
  type: z.literal("index"),
  /** Index to use */
  index: IndexType,
});
export type IndexSource = z.infer<typeof IndexSourceSchema>;

/**
 * ETF holdings source
 */
export const ETFHoldingsSourceSchema = BaseUniverseSourceSchema.extend({
  type: z.literal("etf_holdings"),
  /** ETF ticker symbol */
  etf: z.string().min(1),
  /** Minimum holding weight percentage (0-100) */
  minWeight: z.number().min(0).max(100).optional(),
});
export type ETFHoldingsSource = z.infer<typeof ETFHoldingsSourceSchema>;

/**
 * Dynamic screener source
 */
export const ScreenerSourceSchema = BaseUniverseSourceSchema.extend({
  type: z.literal("screener"),
  /** Minimum market cap in dollars */
  minMarketCap: z.number().positive().optional(),
  /** Maximum market cap in dollars */
  maxMarketCap: z.number().positive().optional(),
  /** Minimum average daily volume */
  minAvgVolume: z.number().positive().optional(),
  /** Minimum average daily dollar volume */
  minDollarVolume: z.number().positive().optional(),
  /** Sectors to include (empty = all) */
  sectors: z.array(z.string()).optional(),
  /** Sectors to exclude */
  excludeSectors: z.array(z.string()).optional(),
});
export type ScreenerSource = z.infer<typeof ScreenerSourceSchema>;

/**
 * Union of all universe source types
 */
export const UniverseSourceSchema = z.discriminatedUnion("type", [
  StaticSourceSchema,
  IndexSourceSchema,
  ETFHoldingsSourceSchema,
  ScreenerSourceSchema,
]);
export type UniverseSource = z.infer<typeof UniverseSourceSchema>;

// ============================================
// Filter Configuration
// ============================================

/**
 * Liquidity filter configuration
 */
export const LiquidityFilterSchema = z.object({
  /** Minimum 20-day average daily dollar volume */
  minDollarVolume: z.number().positive().optional(),
  /** Minimum 20-day average daily share volume */
  minShareVolume: z.number().positive().optional(),
  /** Minimum average spread percentage */
  maxSpreadPct: z.number().positive().optional(),
});
export type LiquidityFilter = z.infer<typeof LiquidityFilterSchema>;

/**
 * Volatility filter configuration
 */
export const VolatilityFilterSchema = z.object({
  /** Minimum 20-day historical volatility */
  minHistVol: z.number().min(0).max(10).optional(),
  /** Maximum 20-day historical volatility */
  maxHistVol: z.number().min(0).max(10).optional(),
  /** Minimum ATR as percentage of price */
  minAtrPct: z.number().positive().optional(),
  /** Maximum ATR as percentage of price */
  maxAtrPct: z.number().positive().optional(),
});
export type VolatilityFilter = z.infer<typeof VolatilityFilterSchema>;

/**
 * Diversification rules for sector/industry limits
 */
export const DiversificationRulesSchema = z.object({
  /** Maximum candidates per sector */
  maxPerSector: z.number().int().positive().optional(),
  /** Maximum candidates per industry */
  maxPerIndustry: z.number().int().positive().optional(),
  /** Minimum sectors represented */
  minSectors: z.number().int().positive().optional(),
});
export type DiversificationRules = z.infer<typeof DiversificationRulesSchema>;

/**
 * Combined filter configuration
 */
export const UniverseFiltersSchema = z.object({
  liquidity: LiquidityFilterSchema.optional(),
  volatility: VolatilityFilterSchema.optional(),
});
export type UniverseFilters = z.infer<typeof UniverseFiltersSchema>;

// ============================================
// Universe Configuration
// ============================================

/**
 * Limits for universe resolution
 */
export const UniverseLimitsSchema = z.object({
  /** Maximum candidates per cycle */
  maxCandidatesPerCycle: z.number().int().positive().default(50),
  /** Metric to rank candidates by */
  rankingMetric: RankingMetric.default("dollar_volume"),
});
export type UniverseLimits = z.infer<typeof UniverseLimitsSchema>;

/**
 * Complete universe configuration
 */
export const UniverseConfigSchema = z.object({
  /** Universe sources */
  sources: z.array(UniverseSourceSchema).min(1),
  /** How to combine multiple sources */
  composeMode: ComposeMode.default("union"),
  /** Filters to apply after resolution */
  filters: UniverseFiltersSchema.optional(),
  /** Diversification rules */
  diversification: DiversificationRulesSchema.optional(),
  /** Limits for final candidate selection */
  limits: UniverseLimitsSchema.default({
    maxCandidatesPerCycle: 50,
    rankingMetric: "dollar_volume",
  }),
});
export type UniverseConfig = z.infer<typeof UniverseConfigSchema>;

// ============================================
// Filter Stats
// ============================================

/**
 * Statistics from universe filter pipeline
 */
export const FilterStatsSchema = z.object({
  /** Candidates before any filters */
  beforeFilters: z.number().int().nonnegative(),
  /** Candidates after liquidity filters */
  afterLiquidity: z.number().int().nonnegative(),
  /** Candidates after volatility filters */
  afterVolatility: z.number().int().nonnegative(),
  /** Candidates after diversification rules */
  afterDiversification: z.number().int().nonnegative(),
  /** Final candidate count */
  final: z.number().int().nonnegative(),
});
export type FilterStats = z.infer<typeof FilterStatsSchema>;

// ============================================
// Resolved Universe
// ============================================

/**
 * Metadata about universe resolution
 */
export const UniverseMetadataSchema = z.object({
  /** Names of sources that contributed tickers */
  sources: z.array(z.string()),
  /** Timestamp of resolution */
  resolvedAt: Iso8601Schema,
  /** Filter statistics */
  filterStats: FilterStatsSchema,
});
export type UniverseMetadata = z.infer<typeof UniverseMetadataSchema>;

/**
 * Result of universe resolution
 */
export const ResolvedUniverseSchema = z.object({
  /** Final list of ticker symbols */
  tickers: z.array(z.string().min(1)),
  /** Resolution metadata */
  metadata: UniverseMetadataSchema,
});
export type ResolvedUniverse = z.infer<typeof ResolvedUniverseSchema>;

// ============================================
// Validation Helpers
// ============================================

/**
 * Validate universe configuration
 *
 * @param config - Configuration to validate
 * @returns Validated configuration or throws ZodError
 */
export function validateUniverseConfig(config: unknown): UniverseConfig {
  return UniverseConfigSchema.parse(config);
}

/**
 * Check if filter stats show reasonable attrition
 *
 * @param stats - Filter statistics
 * @returns true if attrition is within expected bounds
 */
export function isReasonableAttrition(stats: FilterStats): boolean {
  // Should have some candidates at each stage
  if (stats.beforeFilters === 0) return false;
  if (stats.final === 0) return false;

  // Attrition should not be extreme (>90% loss at any stage)
  const liquidity = stats.afterLiquidity / stats.beforeFilters;
  const volatility = stats.afterVolatility / Math.max(stats.afterLiquidity, 1);
  const diversification = stats.afterDiversification / Math.max(stats.afterVolatility, 1);

  return liquidity >= 0.1 && volatility >= 0.1 && diversification >= 0.1;
}

/**
 * Create empty filter stats (all zeros)
 */
export function createEmptyFilterStats(): FilterStats {
  return {
    beforeFilters: 0,
    afterLiquidity: 0,
    afterVolatility: 0,
    afterDiversification: 0,
    final: 0,
  };
}
