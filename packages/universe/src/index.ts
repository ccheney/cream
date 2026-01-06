/**
 * @cream/universe
 *
 * Universe resolution system for selecting tradeable instruments.
 * Supports static lists, index constituents, ETF holdings, and screeners.
 *
 * @see docs/plans/11-configuration.md lines 355-700
 */

// FMP Client
export {
  createFMPClient,
  FMPClient,
  type FMPClientConfig,
  type FMPConstituent,
  type FMPETFHolding,
  type FMPHistoricalConstituent,
  type FMPScreenerFilters,
  type FMPScreenerResult,
} from "./fmp-client.js";
// Point-in-Time Universe (survivorship bias prevention)
export {
  createPointInTimeResolver,
  type DataValidationResult,
  type PointInTimeResolverConfig,
  type PointInTimeResult,
  PointInTimeUniverseResolver,
} from "./point-in-time.js";
// Universe Resolver
export {
  type DiversificationConfig,
  resolveUniverse,
  resolveUniverseSymbols,
  type UniverseResolutionResult,
  type UniverseResolverOptions,
} from "./resolver.js";
// Source Resolvers
export {
  type ResolvedInstrument,
  resolveETFHoldingsSource,
  resolveIndexSource,
  resolveScreenerSource,
  resolveSource,
  resolveStaticSource,
  type SourceResolutionResult,
  type SourceResolverOptions,
} from "./sources.js";
