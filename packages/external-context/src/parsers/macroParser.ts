/**
 * Macro Release Parser
 *
 * Parses FRED macro data sources into normalized format.
 */

import {
	classifyReleaseImpact,
	FRED_SERIES,
	type FREDReleaseDate,
	type FREDSeriesId,
	getReleaseById,
	type ReleaseImpact,
} from "@cream/universe";
import type { ParsedMacroRelease } from "../types.js";

/**
 * Known macro indicators with metadata
 */
export const MACRO_INDICATORS = {
	// Growth indicators
	REAL_GDP: { name: "Real GDP", unit: "billions USD", frequency: "quarterly" },
	REAL_GDP_PER_CAPITA: { name: "Real GDP per Capita", unit: "USD", frequency: "quarterly" },

	// Inflation indicators
	CPI: { name: "Consumer Price Index", unit: "index", frequency: "monthly" },
	INFLATION: { name: "Inflation Rate", unit: "percent", frequency: "monthly" },

	// Employment indicators
	UNEMPLOYMENT: { name: "Unemployment Rate", unit: "percent", frequency: "monthly" },
	NONFARM_PAYROLL: { name: "Nonfarm Payrolls", unit: "thousands", frequency: "monthly" },

	// Interest rate indicators
	FEDERAL_FUNDS_RATE: { name: "Federal Funds Rate", unit: "percent", frequency: "daily" },
	TREASURY_YIELD: { name: "Treasury Yield", unit: "percent", frequency: "daily" },

	// Retail and consumer
	RETAIL_SALES: { name: "Retail Sales", unit: "millions USD", frequency: "monthly" },
	CONSUMER_SENTIMENT: { name: "Consumer Sentiment", unit: "index", frequency: "monthly" },

	// Trade
	DURABLES: { name: "Durable Goods Orders", unit: "millions USD", frequency: "monthly" },
} as const;

export type MacroIndicatorType = keyof typeof MACRO_INDICATORS;

/**
 * Economic calendar event structure
 */
export interface EconomicCalendarEvent {
	date: string;
	country: string;
	event: string;
	actual?: number | null;
	previous?: number | null;
	estimate?: number | null;
	change?: number | null;
	changePercentage?: number | null;
	unit?: string;
	impact?: "Low" | "Medium" | "High";
}

/**
 * Parse economic calendar events into macro releases
 */
export function parseEconomicCalendarEvents(events: EconomicCalendarEvent[]): ParsedMacroRelease[] {
	const results: ParsedMacroRelease[] = [];

	for (const event of events) {
		// Only process events with actual values
		if (event.actual === null || event.actual === undefined) {
			continue;
		}

		const date = parseDate(event.date);
		if (!date) {
			continue;
		}

		results.push({
			indicator: event.event,
			value: event.actual,
			previousValue: event.previous ?? undefined,
			date,
			unit: event.unit,
			source: event.country,
		});
	}

	return results;
}

// ============================================
// FRED Observations Parser
// ============================================

/**
 * Metadata for FRED observations parsing.
 */
export interface FREDObservationMetadata {
	/** Display name for the indicator */
	name: string;
	/** Unit of measurement */
	unit: string;
}

/**
 * FRED observation entry (from FREDClient.getObservations).
 */
export interface FREDObservationEntry {
	/** Date in YYYY-MM-DD format */
	date: string;
	/** Value as string (can be '.' for missing data) */
	value: string;
}

/**
 * Parse FRED observations into normalized macro releases.
 *
 * Converts raw FRED API observations into ParsedMacroRelease format
 * compatible with the macro release analysis pipeline.
 *
 * @param seriesId - FRED series ID (e.g., "CPIAUCSL", "UNRATE")
 * @param observations - Array of date/value pairs from FRED API
 * @param metadata - Optional name/unit override (defaults to FRED_SERIES lookup)
 * @returns Array of parsed macro releases
 *
 * @example
 * ```typescript
 * const client = createFREDClientFromEnv();
 * const response = await client.getObservations("CPIAUCSL", {
 *   observation_start: "2024-01-01",
 *   sort_order: "desc",
 *   limit: 12,
 * });
 *
 * const releases = parseFREDObservations("CPIAUCSL", response.observations);
 * // => [
 * //   { indicator: "CPI All Urban Consumers", value: 315.605, ... },
 * //   { indicator: "CPI All Urban Consumers", value: 314.123, ... },
 * // ]
 * ```
 */
export function parseFREDObservations(
	seriesId: string,
	observations: FREDObservationEntry[],
	metadata?: FREDObservationMetadata,
): ParsedMacroRelease[] {
	const results: ParsedMacroRelease[] = [];

	if (!observations || observations.length === 0) {
		return results;
	}

	// Look up series metadata from registry if not provided
	const registryMeta = FRED_SERIES[seriesId as FREDSeriesId] as
		| { name: string; unit: string }
		| undefined;
	const name = metadata?.name ?? registryMeta?.name ?? seriesId;
	const unit = metadata?.unit ?? registryMeta?.unit ?? undefined;

	for (let i = 0; i < observations.length; i++) {
		const item = observations[i];
		if (!item || !item.date) {
			continue;
		}

		// Skip missing data (FRED uses '.' for unavailable values)
		if (item.value === "." || item.value === "" || item.value == null) {
			continue;
		}

		const value = Number.parseFloat(item.value);
		if (Number.isNaN(value)) {
			continue;
		}

		const date = parseDate(item.date);
		if (!date) {
			continue;
		}

		// Get previous value from next item (observations typically newest-first)
		// Scan for next valid observation
		let previousValue: number | undefined;
		for (let j = i + 1; j < observations.length; j++) {
			const nextItem = observations[j];
			if (nextItem && nextItem.value !== "." && nextItem.value !== "" && nextItem.value != null) {
				const parsed = Number.parseFloat(nextItem.value);
				if (!Number.isNaN(parsed)) {
					previousValue = parsed;
					break;
				}
			}
		}

		results.push({
			indicator: name,
			value,
			previousValue,
			date,
			unit,
			source: `FRED:${seriesId}`,
		});
	}

	return results;
}

/**
 * Parse date string
 */
function parseDate(dateStr: string): Date | null {
	if (!dateStr) {
		return null;
	}
	const date = new Date(dateStr);
	return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Calculate surprise score for macro release
 *
 * @param actual - Actual released value
 * @param estimate - Consensus estimate
 * @param previous - Previous release value
 * @returns Surprise score from -1 (big miss) to 1 (big beat)
 */
export function calculateMacroSurprise(
	actual: number,
	estimate?: number,
	previous?: number,
): number {
	// If we have an estimate, use it for surprise calculation
	if (estimate !== undefined && estimate !== 0) {
		const surprise = (actual - estimate) / Math.abs(estimate);
		// Clamp to [-1, 1] range
		return Math.max(-1, Math.min(1, surprise));
	}

	// If no estimate but have previous, use previous as baseline
	if (previous !== undefined && previous !== 0) {
		const change = (actual - previous) / Math.abs(previous);
		// Use half the weight for previous-based surprise
		return Math.max(-1, Math.min(1, change * 0.5));
	}

	// No baseline available
	return 0;
}

/**
 * Determine if macro release is significant
 */
export function isMacroReleaseSignificant(
	release: ParsedMacroRelease,
	thresholdPercent = 0.5,
): boolean {
	if (release.previousValue === undefined) {
		return true; // Assume significant if unknown
	}

	const changePercent =
		Math.abs((release.value - release.previousValue) / release.previousValue) * 100;

	return changePercent >= thresholdPercent;
}

/**
 * Filter macro releases by recency
 */
export function filterRecentMacroReleases(
	releases: ParsedMacroRelease[],
	maxAgeDays = 7,
): ParsedMacroRelease[] {
	const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
	return releases.filter((r) => r.date >= cutoff);
}

/**
 * Group macro releases by indicator
 */
export function groupByIndicator(
	releases: ParsedMacroRelease[],
): Map<string, ParsedMacroRelease[]> {
	const groups = Map.groupBy(releases, (r) => r.indicator);

	// Sort each group by date descending
	const sortedGroups = new Map<string, ParsedMacroRelease[]>();
	for (const [key, groupReleases] of groups) {
		sortedGroups.set(
			key,
			groupReleases.toSorted((a, b) => b.date.getTime() - a.date.getTime()),
		);
	}

	return sortedGroups;
}

// ============================================
// FRED Economic Events
// ============================================

/**
 * Standard release times in ET for common FRED releases.
 * Most economic data releases occur at 8:30 AM ET.
 * FOMC announcements are at 2:00 PM ET.
 */
const FRED_RELEASE_TIMES: Record<number, string> = {
	101: "14:00:00", // FOMC - 2:00 PM ET
	// All others default to 8:30 AM ET
};

const DEFAULT_FRED_RELEASE_TIME = "08:30:00";

/**
 * FRED Economic Event - structured for calendar display.
 *
 * Represents an upcoming or historical economic release from FRED.
 */
export interface FREDEconomicEvent {
	/** Unique event ID (e.g., 'fred-10-2025-01-15') */
	id: string;
	/** Release name (e.g., 'Consumer Price Index') */
	name: string;
	/** Release date in YYYY-MM-DD format */
	date: string;
	/** Release time in HH:MM:SS format (ET) - defaults to '08:30:00' */
	time: string;
	/** Market impact level based on release importance */
	impact: ReleaseImpact;
	/** Forecast value (FRED doesn't provide forecasts, always null) */
	forecast: string | null;
	/** Previous release value */
	previous: string | null;
	/** Actual released value (null if not yet released) */
	actual: string | null;
	/** FRED release ID for reference */
	releaseId: number;
}

/**
 * Latest value data for a FRED release.
 * Used to populate previous/actual fields in economic events.
 */
export interface FREDLatestValues {
	previous: number | null;
	actual: number | null;
}

/**
 * Parse FRED release dates into structured economic events.
 *
 * @param releaseDates - Release dates from FREDClient.getReleaseDates()
 * @param latestValues - Optional map of release ID to latest values
 * @returns Array of structured economic events
 *
 * @example
 * ```typescript
 * const client = createFREDClientFromEnv();
 * const response = await client.getReleaseDates({ limit: 50 });
 * const releaseDates = response.release_dates ?? response.release_date ?? [];
 *
 * // Optionally fetch latest values for each release
 * const latestValues = new Map<number, FREDLatestValues>();
 * for (const rd of releaseDates) {
 *   const value = await fetchLatestValue(rd.release_id);
 *   if (value) latestValues.set(rd.release_id, value);
 * }
 *
 * const events = parseFREDReleaseDates(releaseDates, latestValues);
 * ```
 */
export function parseFREDReleaseDates(
	releaseDates: FREDReleaseDate[],
	latestValues?: Map<number, FREDLatestValues>,
): FREDEconomicEvent[] {
	const events: FREDEconomicEvent[] = [];

	for (const rd of releaseDates) {
		const releaseId = typeof rd.release_id === "string" ? Number(rd.release_id) : rd.release_id;

		// Generate stable ID from release_id + date
		const id = `fred-${releaseId}-${rd.date}`;

		// Get release name from registry or API response
		const releaseInfo = getReleaseById(releaseId);
		const name = releaseInfo?.name ?? rd.release_name ?? `FRED Release ${releaseId}`;

		// Determine release time (FOMC at 2pm, others at 8:30am ET)
		const time = FRED_RELEASE_TIMES[releaseId] ?? DEFAULT_FRED_RELEASE_TIME;

		// Classify impact level
		const impact = classifyReleaseImpact(releaseId);

		// Get latest values if provided
		const values = latestValues?.get(releaseId);
		const previous = values?.previous != null ? String(values.previous) : null;
		const actual = values?.actual != null ? String(values.actual) : null;

		events.push({
			id,
			name,
			date: rd.date,
			time,
			impact,
			forecast: null, // FRED doesn't provide forecasts
			previous,
			actual,
			releaseId,
		});
	}

	return events;
}

/**
 * Filter FRED events to only include high and medium impact releases.
 *
 * @param events - Array of FRED economic events
 * @returns Filtered array with only significant releases
 */
export function filterSignificantFREDEvents(events: FREDEconomicEvent[]): FREDEconomicEvent[] {
	return events.filter((e) => e.impact === "high" || e.impact === "medium");
}

/**
 * Sort FRED events by date and impact.
 * High impact events appear first within the same date.
 *
 * @param events - Array of FRED economic events
 * @returns Sorted array
 */
export function sortFREDEventsByDateAndImpact(events: FREDEconomicEvent[]): FREDEconomicEvent[] {
	const impactOrder: Record<ReleaseImpact, number> = {
		high: 0,
		medium: 1,
		low: 2,
	};

	return events.toSorted((a, b) => {
		// Primary sort by date
		const dateCompare = a.date.localeCompare(b.date);
		if (dateCompare !== 0) {
			return dateCompare;
		}

		// Secondary sort by impact (high first)
		return impactOrder[a.impact] - impactOrder[b.impact];
	});
}
