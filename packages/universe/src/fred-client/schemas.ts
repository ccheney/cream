import { z } from "zod";

/**
 * Single release date entry from /fred/releases/dates endpoint.
 * Used when fetching release dates across all releases.
 */
export const FREDReleaseDateSchema = z.object({
	release_id: z.coerce.number(),
	release_name: z.string().optional(),
	date: z.string(),
});
export type FREDReleaseDate = z.infer<typeof FREDReleaseDateSchema>;

/**
 * Response from /fred/releases/dates endpoint.
 * Returns upcoming release dates for all economic data releases.
 */
export const FREDReleaseDatesResponseSchema = z.object({
	realtime_start: z.string(),
	realtime_end: z.string(),
	order_by: z.string(),
	sort_order: z.string(),
	count: z.number(),
	offset: z.number(),
	limit: z.number(),
	release_dates: z.array(FREDReleaseDateSchema).optional(),
	release_date: z.array(FREDReleaseDateSchema).optional(),
});
export type FREDReleaseDatesResponse = z.infer<typeof FREDReleaseDatesResponseSchema>;

/**
 * Single observation data point.
 * Value can be '.' for missing data, which transforms to null.
 */
export const FREDObservationSchema = z.object({
	realtime_start: z.string(),
	realtime_end: z.string(),
	date: z.string(),
	value: z.string().transform((v: string) => (v === "." ? null : v)),
});
export type FREDObservation = z.infer<typeof FREDObservationSchema>;

/**
 * Response from /fred/series/observations endpoint.
 * Returns historical observations for a specific data series.
 */
export const FREDObservationsResponseSchema = z.object({
	realtime_start: z.string(),
	realtime_end: z.string(),
	observation_start: z.string(),
	observation_end: z.string(),
	units: z.string(),
	output_type: z.number(),
	file_type: z.string(),
	order_by: z.string(),
	sort_order: z.string(),
	count: z.number(),
	offset: z.number(),
	limit: z.number(),
	observations: z.array(FREDObservationSchema),
});
export type FREDObservationsResponse = z.infer<typeof FREDObservationsResponseSchema>;

/**
 * Single release entry from /fred/releases endpoint.
 */
export const FREDReleaseSchema = z.object({
	id: z.number(),
	realtime_start: z.string(),
	realtime_end: z.string(),
	name: z.string(),
	press_release: z.boolean(),
	link: z.string().optional(),
});
export type FREDRelease = z.infer<typeof FREDReleaseSchema>;

/**
 * Response from /fred/releases endpoint.
 * Returns list of all economic data releases.
 */
export const FREDReleasesResponseSchema = z.object({
	realtime_start: z.string(),
	realtime_end: z.string(),
	order_by: z.string(),
	sort_order: z.string(),
	count: z.number(),
	offset: z.number(),
	limit: z.number(),
	releases: z.array(FREDReleaseSchema),
});
export type FREDReleasesResponse = z.infer<typeof FREDReleasesResponseSchema>;

/**
 * Series metadata from /fred/series endpoint.
 */
export const FREDSeriesSchema = z.object({
	id: z.string(),
	realtime_start: z.string(),
	realtime_end: z.string(),
	title: z.string(),
	observation_start: z.string(),
	observation_end: z.string(),
	frequency: z.string(),
	frequency_short: z.string(),
	units: z.string(),
	units_short: z.string(),
	seasonal_adjustment: z.string(),
	seasonal_adjustment_short: z.string(),
	last_updated: z.string(),
	popularity: z.number(),
	notes: z.string().optional(),
});
export type FREDSeries = z.infer<typeof FREDSeriesSchema>;

/**
 * Response from /fred/release/series endpoint.
 * Returns series belonging to a specific release.
 */
export const FREDReleaseSeriesResponseSchema = z.object({
	realtime_start: z.string(),
	realtime_end: z.string(),
	order_by: z.string(),
	sort_order: z.string(),
	count: z.number(),
	offset: z.number(),
	limit: z.number(),
	seriess: z.array(FREDSeriesSchema),
});
export type FREDReleaseSeriesResponse = z.infer<typeof FREDReleaseSeriesResponseSchema>;
