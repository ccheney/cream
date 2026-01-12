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
  type FMPEarningsTranscript,
  type FMPEconomicEvent,
  type FMPETFHolding,
  type FMPHistoricalConstituent,
  type FMPScreenerFilters,
  type FMPScreenerResult,
  type FMPStockNews,
} from "./fmp-client.js";
// FRED Client (Federal Reserve Economic Data)
export {
  classifyReleaseImpact,
  createFREDClient,
  createFREDClientFromEnv,
  FRED_BASE_URL,
  FRED_RATE_LIMITS,
  FRED_RELEASES,
  FRED_SERIES,
  FREDClient,
  type FREDClientConfig,
  FREDClientError,
  type FREDErrorCode,
  type FREDObservation,
  FREDObservationSchema,
  type FREDObservationsResponse,
  FREDObservationsResponseSchema,
  type FREDRelease,
  type FREDReleaseDate,
  FREDReleaseDateSchema,
  type FREDReleaseDatesResponse,
  FREDReleaseDatesResponseSchema,
  type FREDReleaseId,
  FREDReleaseSchema,
  type FREDReleaseSeriesResponse,
  FREDReleaseSeriesResponseSchema,
  type FREDReleasesResponse,
  FREDReleasesResponseSchema,
  type FREDSeries,
  type FREDSeriesId,
  FREDSeriesSchema,
  getReleaseById,
  type ReleaseImpact,
} from "./fred-client.js";
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
