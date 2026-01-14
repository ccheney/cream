/**
 * FRED Economic Calendar Tool
 *
 * Fetches upcoming economic data releases from the Federal Reserve.
 * Uses FRED_RELEASES registry to filter to key market-moving events.
 */

import { type ExecutionContext, isBacktest } from "@cream/domain";
import { FRED_RELEASES, getReleaseById, type ReleaseImpact } from "@cream/universe";
import { log } from "../../logger.js";
import { getFREDClient } from "../clients.js";
import type { EconomicEvent } from "../types.js";

/**
 * Set of tracked release IDs from FRED_RELEASES.
 */
const TRACKED_RELEASE_IDS = new Set<number>(Object.values(FRED_RELEASES).map((r) => r.id));

/**
 * High impact release IDs.
 */
const HIGH_IMPACT_IDS = new Set<number>([
	FRED_RELEASES.CPI.id,
	FRED_RELEASES.EMPLOYMENT.id,
	FRED_RELEASES.GDP.id,
	FRED_RELEASES.FOMC.id,
	FRED_RELEASES.RETAIL_SALES.id,
]);

/**
 * Medium impact release IDs.
 */
const MEDIUM_IMPACT_IDS = new Set<number>([
	FRED_RELEASES.INDUSTRIAL_PRODUCTION.id,
	FRED_RELEASES.PERSONAL_INCOME.id,
	FRED_RELEASES.TREASURY_RATES.id,
	FRED_RELEASES.HOUSING_STARTS.id,
	FRED_RELEASES.DURABLE_GOODS.id,
	FRED_RELEASES.PPI.id,
	FRED_RELEASES.JOLTS.id,
]);

/**
 * Classify impact locally to avoid type issues with universe package.
 */
function getImpact(releaseId: number): ReleaseImpact {
	if (HIGH_IMPACT_IDS.has(releaseId)) {
		return "high";
	}
	if (MEDIUM_IMPACT_IDS.has(releaseId)) {
		return "medium";
	}
	return "low";
}

/**
 * FOMC release ID for special time handling.
 */
const FOMC_RELEASE_ID = FRED_RELEASES.FOMC.id;

/**
 * Get economic calendar events from FRED.
 *
 * Fetches upcoming and recent economic data releases from the FRED API.
 * Returns empty array in backtest mode or if FRED API is unavailable.
 *
 * @param ctx - ExecutionContext
 * @param startDate - Start date (YYYY-MM-DD format)
 * @param endDate - End date (YYYY-MM-DD format)
 * @returns Array of economic events
 */
export async function getEconomicCalendar(
	ctx: ExecutionContext,
	startDate: string,
	endDate: string
): Promise<EconomicEvent[]> {
	// In backtest mode, return empty array for consistent/fast execution
	if (isBacktest(ctx)) {
		return [];
	}

	const client = getFREDClient();
	if (!client) {
		// FRED_API_KEY not set - return empty array
		return [];
	}

	try {
		// Fetch release dates for the specified range
		const response = await client.getReleaseDates({
			realtime_start: startDate,
			realtime_end: endDate,
			include_release_dates_with_no_data: true,
			limit: 1000,
			order_by: "release_date",
			sort_order: "asc",
		});

		// Get release dates from response (API uses both field names)
		const releaseDates = response.release_dates ?? response.release_date ?? [];

		// Filter to only tracked releases and transform to EconomicEvent format
		const events: EconomicEvent[] = [];

		for (const release of releaseDates) {
			const releaseId = Number(release.release_id);

			// Skip releases we don't track
			if (!TRACKED_RELEASE_IDS.has(releaseId)) {
				continue;
			}

			// Get release metadata
			const releaseMeta = getReleaseById(releaseId);
			if (!releaseMeta) {
				continue;
			}

			// Determine release time
			// FOMC releases are at 2:00 PM ET, most others at 8:30 AM ET
			const time = releaseId === FOMC_RELEASE_ID ? "14:00:00" : "08:30:00";

			// Generate stable ID from release_id and date
			const id = `fred-${releaseId}-${release.date}`;

			events.push({
				id,
				name: releaseMeta.name,
				date: release.date,
				time,
				impact: getImpact(releaseId),
				forecast: null,
				previous: null,
				actual: null,
			});
		}

		return events;
	} catch (error) {
		log.warn(
			{ error: error instanceof Error ? error.message : String(error) },
			"Failed to fetch FRED economic calendar"
		);
		return [];
	}
}

// ============================================
// Macro Indicators Tool
// ============================================

/**
 * Default series to fetch for macro indicators.
 * Key economic indicators covering inflation, employment, growth, and rates.
 */
const DEFAULT_MACRO_SERIES = [
	"CPIAUCSL", // CPI - Consumer Price Index
	"UNRATE", // Unemployment Rate
	"FEDFUNDS", // Federal Funds Rate
	"DGS10", // 10-Year Treasury
	"DGS2", // 2-Year Treasury
	"T10Y2Y", // 10Y-2Y Spread (yield curve)
	"GDPC1", // Real GDP
	"PCE", // Personal Consumption Expenditures
	"UMCSENT", // Consumer Sentiment
	"INDPRO", // Industrial Production
];

/**
 * Macro indicator value with date and optional change.
 */
export interface MacroIndicatorValue {
	value: number;
	date: string;
	change?: number;
}

/**
 * Get latest macro economic indicators from FRED.
 *
 * Fetches the most recent values for key economic indicators.
 * Returns empty object in backtest mode or if FRED API is unavailable.
 *
 * @param ctx - ExecutionContext
 * @param seriesIds - Optional list of FRED series IDs (defaults to key indicators)
 * @returns Record of series ID to latest value with date and change
 */
export async function getMacroIndicators(
	ctx: ExecutionContext,
	seriesIds?: string[]
): Promise<Record<string, MacroIndicatorValue>> {
	// In backtest mode, return empty object for consistent/fast execution
	if (isBacktest(ctx)) {
		return {};
	}

	const client = getFREDClient();
	if (!client) {
		// FRED_API_KEY not set - return empty object
		return {};
	}

	const series = seriesIds ?? DEFAULT_MACRO_SERIES;
	const results: Record<string, MacroIndicatorValue> = {};

	// Fetch series in parallel with limited concurrency
	// FRED rate limit: 120 req/min, so we can safely do parallel requests
	const fetchPromises = series.map(async (seriesId) => {
		try {
			const response = await client.getObservations(seriesId, {
				limit: 2,
				sort_order: "desc",
			});

			const observations = response.observations;
			if (observations.length === 0) {
				return null;
			}

			const latest = observations[0];
			if (!latest || latest.value === null) {
				return null;
			}

			const latestValue = Number.parseFloat(latest.value);
			if (Number.isNaN(latestValue)) {
				return null;
			}

			// Calculate percent change if we have previous value
			let change: number | undefined;
			if (observations.length > 1) {
				const previous = observations[1];
				if (previous && previous.value !== null) {
					const prevValue = Number.parseFloat(previous.value);
					if (!Number.isNaN(prevValue) && prevValue !== 0) {
						change = ((latestValue - prevValue) / Math.abs(prevValue)) * 100;
					}
				}
			}

			return {
				seriesId,
				value: latestValue,
				date: latest.date,
				change,
			};
		} catch (error) {
			log.warn(
				{ seriesId, error: error instanceof Error ? error.message : String(error) },
				"Failed to fetch FRED series"
			);
			return null;
		}
	});

	const fetchResults = await Promise.all(fetchPromises);

	// Collect successful results
	for (const result of fetchResults) {
		if (result) {
			results[result.seriesId] = {
				value: result.value,
				date: result.date,
				change: result.change,
			};
		}
	}

	return results;
}
