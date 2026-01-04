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
  FMPClient,
  createFMPClient,
  type FMPClientConfig,
  type FMPConstituent,
  type FMPHistoricalConstituent,
  type FMPETFHolding,
  type FMPScreenerFilters,
  type FMPScreenerResult,
} from "./fmp-client.js";

// Source Resolvers
export {
  resolveSource,
  resolveStaticSource,
  resolveIndexSource,
  resolveETFHoldingsSource,
  resolveScreenerSource,
  type ResolvedInstrument,
  type SourceResolutionResult,
  type SourceResolverOptions,
} from "./sources.js";

// Universe Resolver
export {
  resolveUniverse,
  resolveUniverseSymbols,
  type UniverseResolutionResult,
  type UniverseResolverOptions,
} from "./resolver.js";
