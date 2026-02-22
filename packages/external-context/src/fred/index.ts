/**
 * FRED (Federal Reserve Economic Data) API exports.
 */

export {
	classifyReleaseImpact,
	FRED_RELEASES,
	FRED_SERIES,
	type FREDReleaseId,
	type FREDSeriesId,
	getReleaseById,
	type ReleaseImpact,
} from "./catalog.js";
export {
	createFREDClient,
	createFREDClientFromEnv,
	FRED_BASE_URL,
	FRED_RATE_LIMITS,
	FREDClient,
	type FREDClientConfig,
} from "./client.js";
export { FREDClientError, type FREDErrorCode } from "./error.js";
export {
	type FREDObservation,
	FREDObservationSchema,
	type FREDObservationsResponse,
	FREDObservationsResponseSchema,
	type FREDRelease,
	type FREDReleaseDate,
	FREDReleaseDateSchema,
	type FREDReleaseDatesResponse,
	FREDReleaseDatesResponseSchema,
	FREDReleaseSchema,
	type FREDReleaseSeriesResponse,
	FREDReleaseSeriesResponseSchema,
	type FREDReleasesResponse,
	FREDReleasesResponseSchema,
	type FREDSeries,
	FREDSeriesSchema,
} from "./schemas.js";
