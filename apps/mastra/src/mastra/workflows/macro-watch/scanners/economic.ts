/**
 * Economic Calendar Scanner
 *
 * Scans for upcoming economic releases using cached FRED data.
 * Generates MacroWatchEntry items for high-impact releases in the next 24 hours.
 *
 * @see docs/plans/42-overnight-macro-watch.md
 */

import { createNodeLogger } from "@cream/logger";

import type { MacroWatchEntry, MacroWatchSession } from "../entry-schemas.js";

const log = createNodeLogger({ service: "macro-watch-economic", level: "info" });

/**
 * Determine the macro watch session based on current time.
 */
function getCurrentSession(): MacroWatchSession {
	const now = new Date();
	const etHour = (now.getUTCHours() - 5 + 24) % 24;

	if (etHour >= 4 && etHour < 10) {
		return "PRE_MARKET";
	}
	if (etHour >= 16 && etHour < 20) {
		return "AFTER_HOURS";
	}
	return "OVERNIGHT";
}

/**
 * Symbols affected by different types of economic releases.
 */
const RELEASE_SYMBOLS: Record<string, string[]> = {
	"Consumer Price Index": ["SPY", "QQQ", "TLT", "GLD"],
	"Employment Situation": ["SPY", "QQQ", "IWM"],
	"Gross Domestic Product": ["SPY", "QQQ", "IWM"],
	"Federal Open Market Committee": ["SPY", "QQQ", "TLT", "GLD"],
	"Retail Sales": ["SPY", "XRT", "AMZN"],
	"Industrial Production and Capacity Utilization": ["SPY", "XLI"],
	"Personal Income and Outlays": ["SPY", "XLY"],
	"Treasury Constant Maturity Rates": ["TLT", "IEF", "BND"],
	"Housing Starts": ["XHB", "ITB"],
	"Manufacturers' Shipments, Inventories, and Orders": ["XLI", "CAT"],
	"Producer Price Index": ["SPY", "XLI"],
	"Job Openings and Labor Turnover Survey": ["SPY", "QQQ"],
};

/**
 * Get symbols for a given release name, with fallback to broad market.
 */
function getSymbolsForRelease(releaseName: string): string[] {
	return RELEASE_SYMBOLS[releaseName] ?? ["SPY", "QQQ"];
}

/**
 * Scan for upcoming economic releases in the next 24 hours.
 *
 * Uses the cached FRED economic calendar data to find high-impact
 * releases and generates MacroWatchEntry items.
 *
 * @returns Array of MacroWatchEntry for upcoming economic releases
 */
export async function scanEconomicCalendar(): Promise<MacroWatchEntry[]> {
	const entries: MacroWatchEntry[] = [];
	const session = getCurrentSession();
	const now = new Date();

	log.info({}, "Scanning economic calendar from database cache");

	try {
		const { EconomicCalendarRepository, getDb } = await import("@cream/storage");

		const db = getDb();
		const repo = new EconomicCalendarRepository(db);

		const upcomingEvents = await repo.getUpcomingHighImpactEvents(24);

		if (upcomingEvents.length === 0) {
			log.info({}, "No upcoming high-impact economic events in next 24 hours");
			return [];
		}

		for (const event of upcomingEvents) {
			const symbols = getSymbolsForRelease(event.releaseName);

			entries.push({
				timestamp: now.toISOString(),
				session,
				category: "ECONOMIC",
				headline: `Upcoming: ${event.releaseName} release at ${event.releaseTime} ET (HIGH impact)`,
				symbols,
				source: "FRED Economic Calendar",
				metadata: {
					releaseId: event.releaseId,
					releaseName: event.releaseName,
					releaseDate: event.releaseDate,
					releaseTime: event.releaseTime,
					impact: event.impact,
					previous: event.previous,
					forecast: event.forecast,
				},
			});
		}

		log.info({ entryCount: entries.length }, "Economic scan complete");
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"Economic scan failed",
		);
	}

	return entries;
}
