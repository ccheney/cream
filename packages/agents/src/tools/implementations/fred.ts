/**
 * FRED Economic Calendar Tool
 *
 * Fetches upcoming economic data releases from the Federal Reserve.
 * Uses FRED_RELEASES registry to filter to key market-moving events.
 */

import { type ExecutionContext, isTest } from "@cream/domain";
import { FRED_RELEASES, getReleaseById, type ReleaseImpact } from "@cream/external-context";
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

interface FREDObservationLike {
	date: string;
	value: string | null;
}

interface MacroSeriesFetchResult {
	seriesId: string;
	value: number;
	date: string;
	change?: number;
}

function toObservationValue(value: string | null): number | null {
	if (value === null) {
		return null;
	}
	const parsed = Number.parseFloat(value);
	return Number.isNaN(parsed) ? null : parsed;
}

function getReleaseTime(releaseId: number): string {
	return releaseId === FOMC_RELEASE_ID ? "14:00:00" : "08:30:00";
}

function toEconomicEvent(release: {
	release_id: number | string;
	date: string;
}): EconomicEvent | null {
	const releaseId = Number(release.release_id);
	if (!TRACKED_RELEASE_IDS.has(releaseId)) {
		return null;
	}

	const releaseMeta = getReleaseById(releaseId);
	if (!releaseMeta) {
		return null;
	}

	return {
		id: `fred-${releaseId}-${release.date}`,
		name: releaseMeta.name,
		date: release.date,
		time: getReleaseTime(releaseId),
		impact: getImpact(releaseId),
		forecast: null,
		previous: null,
		actual: null,
	};
}

function toEconomicEvents(
	releaseDates: { release_id: number | string; date: string }[],
): EconomicEvent[] {
	return releaseDates.flatMap((release) => {
		const event = toEconomicEvent(release);
		return event ? [event] : [];
	});
}

function calculatePercentChange(
	latestValue: number,
	previousObservation: FREDObservationLike | undefined,
): number | undefined {
	if (!previousObservation) {
		return undefined;
	}

	const previousValue = toObservationValue(previousObservation.value);
	if (previousValue === null || previousValue === 0) {
		return undefined;
	}

	return ((latestValue - previousValue) / Math.abs(previousValue)) * 100;
}

function toMacroSeriesResult(
	seriesId: string,
	observations: FREDObservationLike[],
): MacroSeriesFetchResult | null {
	const latest = observations[0];
	if (!latest) {
		return null;
	}

	const latestValue = toObservationValue(latest.value);
	if (latestValue === null) {
		return null;
	}

	return {
		seriesId,
		value: latestValue,
		date: latest.date,
		change: calculatePercentChange(latestValue, observations[1]),
	};
}

async function fetchMacroSeries(
	client: NonNullable<ReturnType<typeof getFREDClient>>,
	seriesId: string,
): Promise<MacroSeriesFetchResult | null> {
	try {
		const response = await client.getObservations(seriesId, {
			limit: 2,
			sort_order: "desc",
		});
		return toMacroSeriesResult(seriesId, response.observations);
	} catch (error) {
		log.warn(
			{ seriesId, error: error instanceof Error ? error.message : String(error) },
			"Failed to fetch FRED series",
		);
		return null;
	}
}

function toMacroIndicatorRecord(
	fetchResults: Array<MacroSeriesFetchResult | null>,
): Record<string, MacroIndicatorValue> {
	const results: Record<string, MacroIndicatorValue> = {};
	for (const result of fetchResults) {
		if (!result) {
			continue;
		}
		results[result.seriesId] = {
			value: result.value,
			date: result.date,
			change: result.change,
		};
	}
	return results;
}

/**
 * Get economic calendar events from FRED.
 *
 * Fetches upcoming and recent economic data releases from the FRED API.
 * Returns empty array in test mode or if FRED API is unavailable.
 *
 * @param ctx - ExecutionContext
 * @param startDate - Start date (YYYY-MM-DD format)
 * @param endDate - End date (YYYY-MM-DD format)
 * @returns Array of economic events
 */
export async function getEconomicCalendar(
	ctx: ExecutionContext,
	startDate: string,
	endDate: string,
): Promise<EconomicEvent[]> {
	// In test mode, return empty array for consistent/fast execution
	if (isTest(ctx)) {
		return [];
	}

	const client = getFREDClient();
	if (!client) {
		// FRED_API_KEY not set - return empty array
		return [];
	}

	try {
		const response = await client.getReleaseDates({
			realtime_start: startDate,
			realtime_end: endDate,
			include_release_dates_with_no_data: true,
			limit: 1000,
			order_by: "release_date",
			sort_order: "asc",
		});

		const releaseDates = response.release_dates ?? response.release_date ?? [];
		return toEconomicEvents(releaseDates);
	} catch (error) {
		log.warn(
			{ error: error instanceof Error ? error.message : String(error) },
			"Failed to fetch FRED economic calendar",
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
 * Returns empty object in test mode or if FRED API is unavailable.
 *
 * @param ctx - ExecutionContext
 * @param seriesIds - Optional list of FRED series IDs (defaults to key indicators)
 * @returns Record of series ID to latest value with date and change
 */
export async function getMacroIndicators(
	ctx: ExecutionContext,
	seriesIds?: string[],
): Promise<Record<string, MacroIndicatorValue>> {
	// In test mode, return empty object for consistent/fast execution
	if (isTest(ctx)) {
		return {};
	}

	const client = getFREDClient();
	if (!client) {
		// FRED_API_KEY not set - return empty object
		return {};
	}

	const series = seriesIds ?? DEFAULT_MACRO_SERIES;

	// FRED rate limit allows this parallel fan-out.
	const fetchPromises = series.map((seriesId) => fetchMacroSeries(client, seriesId));

	const fetchResults = await Promise.all(fetchPromises);
	return toMacroIndicatorRecord(fetchResults);
}
