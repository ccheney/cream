/**
 * Universe Configuration Schema
 *
 * Defines configuration for tradeable instrument selection.
 * Supports static lists, index constituents, ETF holdings, and screeners.
 *
 * @see docs/plans/11-configuration.md for full specification
 */

import { z } from "zod";

// ============================================
// Source Types
// ============================================

/**
 * Universe source type
 */
export const UniverseSourceType = z.enum(["static", "index", "etf_holdings", "screener"]);
export type UniverseSourceType = z.infer<typeof UniverseSourceType>;

/**
 * Composition mode for combining sources
 */
export const ComposeMode = z.enum(["union", "intersection"]);
export type ComposeMode = z.infer<typeof ComposeMode>;

/**
 * Data provider
 */
export const UniverseProvider = z.enum(["fmp", "eodhd", "polygon", "finnhub"]);
export type UniverseProvider = z.infer<typeof UniverseProvider>;

/**
 * Index identifiers
 */
export const IndexId = z.enum(["SP500", "NASDAQ100", "DOWJONES", "RUSSELL2000", "RUSSELL3000"]);
export type IndexId = z.infer<typeof IndexId>;

// ============================================
// Source-Specific Configuration
// ============================================

/**
 * Static ticker list source
 */
export const StaticSourceSchema = z.object({
  type: z.literal("static"),
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  tickers: z.array(z.string().min(1)).min(1),
});
export type StaticSource = z.infer<typeof StaticSourceSchema>;

/**
 * Index constituents source
 */
export const IndexSourceSchema = z.object({
  type: z.literal("index"),
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  index_id: IndexId,
  provider: UniverseProvider.default("fmp"),
  /**
   * Enable point-in-time data for survivorship-bias-free backtesting
   */
  point_in_time: z.boolean().default(false),
});
export type IndexSource = z.infer<typeof IndexSourceSchema>;

/**
 * ETF holdings source
 */
export const ETFHoldingsSourceSchema = z
  .object({
    type: z.literal("etf_holdings"),
    name: z.string().min(1),
    enabled: z.boolean().default(true),
    /**
     * Single ETF ticker (mutually exclusive with etf_symbols)
     */
    etf_symbol: z.string().optional(),
    /**
     * Multiple ETF tickers (mutually exclusive with etf_symbol)
     */
    etf_symbols: z.array(z.string()).optional(),
    provider: UniverseProvider.default("fmp"),
    /**
     * Minimum weight percentage to include holding
     */
    min_weight_pct: z.number().min(0).max(100).default(0.1),
    /**
     * Limit to top N holdings by weight
     */
    top_n: z.number().int().positive().nullable().default(null),
  })
  .superRefine((data, ctx) => {
    // Require exactly one of etf_symbol or etf_symbols
    if (data.etf_symbol === undefined && data.etf_symbols === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either etf_symbol or etf_symbols must be specified",
        path: ["etf_symbol"],
      });
    }
    if (data.etf_symbol !== undefined && data.etf_symbols !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cannot specify both etf_symbol and etf_symbols",
        path: ["etf_symbols"],
      });
    }
  });
export type ETFHoldingsSource = z.infer<typeof ETFHoldingsSourceSchema>;

/**
 * Screener sort order
 */
export const SortOrder = z.enum(["asc", "desc"]);
export type SortOrder = z.infer<typeof SortOrder>;

/**
 * Screener source (dynamic selection based on criteria)
 */
export const ScreenerSourceSchema = z.object({
  type: z.literal("screener"),
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  provider: UniverseProvider.default("fmp"),
  /**
   * Filter criteria (provider-specific)
   */
  filters: z.record(z.string(), z.unknown()).default({}),
  /**
   * Sort field
   */
  sort_by: z.string().optional(),
  /**
   * Sort order
   */
  sort_order: SortOrder.default("desc"),
  /**
   * Maximum results
   */
  limit: z.number().int().positive().default(100),
});
export type ScreenerSource = z.infer<typeof ScreenerSourceSchema>;

/**
 * Union of all source types
 */
export const UniverseSourceSchema = z.union([
  StaticSourceSchema,
  IndexSourceSchema,
  ETFHoldingsSourceSchema,
  ScreenerSourceSchema,
]);
export type UniverseSource = z.infer<typeof UniverseSourceSchema>;

// ============================================
// Universe Filters
// ============================================

/**
 * Universe-level filters applied after source composition
 */
export const UniverseFiltersSchema = z.object({
  /**
   * Minimum average daily volume
   */
  min_avg_volume: z.number().nonnegative().default(0),

  /**
   * Minimum market cap
   */
  min_market_cap: z.number().nonnegative().default(0),

  /**
   * Minimum price
   */
  min_price: z.number().nonnegative().default(0),

  /**
   * Maximum price
   */
  max_price: z.number().positive().optional(),

  /**
   * Exclude specific tickers
   */
  exclude_tickers: z.array(z.string()).default([]),

  /**
   * Include only specific sectors
   */
  include_sectors: z.array(z.string()).optional(),

  /**
   * Exclude specific sectors
   */
  exclude_sectors: z.array(z.string()).optional(),
});
export type UniverseFilters = z.infer<typeof UniverseFiltersSchema>;

// ============================================
// Options Universe Configuration
// ============================================

/**
 * Options-specific universe configuration
 */
export const OptionsUniverseConfigSchema = z.object({
  /**
   * Enable options trading for universe
   */
  enabled: z.boolean().default(false),

  /**
   * Minimum days to expiration
   */
  min_dte: z.number().int().nonnegative().default(7),

  /**
   * Maximum days to expiration
   */
  max_dte: z.number().int().positive().default(60),

  /**
   * Minimum open interest
   */
  min_open_interest: z.number().int().nonnegative().default(100),

  /**
   * Maximum bid-ask spread percentage
   */
  max_spread_pct: z.number().min(0).max(100).default(10),
});
export type OptionsUniverseConfig = z.infer<typeof OptionsUniverseConfigSchema>;

// ============================================
// Complete Universe Configuration
// ============================================

/**
 * Complete universe configuration
 */
export const UniverseConfigSchema = z.object({
  /**
   * How to combine multiple sources
   */
  compose_mode: ComposeMode.default("union"),

  /**
   * Universe sources
   */
  sources: z.array(UniverseSourceSchema).min(1),

  /**
   * Post-composition filters
   */
  filters: UniverseFiltersSchema.optional(),

  /**
   * Maximum universe size
   */
  max_instruments: z.number().int().positive().default(500),

  /**
   * Options trading configuration
   */
  options: OptionsUniverseConfigSchema.optional(),

  /**
   * Cache TTL for universe resolution (in seconds)
   */
  cache_ttl_seconds: z.number().int().positive().default(3600),
});
export type UniverseConfig = z.infer<typeof UniverseConfigSchema>;
