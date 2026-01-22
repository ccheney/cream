/**
 * MacroWatch Workflow
 *
 * Lightweight overnight scanning workflow that runs during market closed hours.
 * Accumulates macro developments for the morning newspaper compilation.
 *
 * Scanner Phases (run in parallel):
 * 1. News scan - Alpaca news API
 * 2. Prediction scan - Kalshi/Polymarket delta changes
 * 3. Economic scan - FRED economic calendar
 * 4. Movers scan - Alpaca screener pre-market movers
 *
 * @see docs/plans/42-overnight-macro-watch.md
 */

import { createNodeLogger } from "@cream/logger";

import {
	scanEconomicCalendar,
	scanMovers,
	scanNews,
	scanPredictionDeltas,
} from "./scanners/index.js";
import type { MacroWatchEntry } from "./schemas.js";

const log = createNodeLogger({ service: "macro-watch", level: "info" });

// ============================================
// Runner Function
// ============================================

/**
 * Run the MacroWatch workflow.
 *
 * Executes all scanners in parallel and aggregates results into a single output.
 * This is the primary entry point for the MacroWatch workflow.
 *
 * @param symbols - Universe symbols to scan for
 * @param since - ISO timestamp to scan from
 * @returns MacroWatch output with accumulated entries
 */
export async function runMacroWatch(
	symbols: string[],
	since: string,
): Promise<{ entries: MacroWatchEntry[]; totalCount: number; timestamp: string }> {
	// Run scanners in parallel for efficiency
	const [newsEntries, predictionEntries, economicEntries, moverEntries] = await Promise.all([
		scanNews(symbols, since),
		scanPredictionDeltas(),
		scanEconomicCalendar(),
		scanMovers(symbols),
	]);

	// Combine all entries
	const allEntries: MacroWatchEntry[] = [
		...newsEntries,
		...predictionEntries,
		...economicEntries,
		...moverEntries,
	];

	// Deduplicate by a composite key (headline + category + source) since IDs are generated at save time
	const uniqueEntries = Array.from(
		new Map(allEntries.map((e) => [`${e.headline}|${e.category}|${e.source}`, e])).values(),
	);

	// Sort by timestamp descending
	uniqueEntries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

	log.info(
		{
			news: newsEntries.length,
			prediction: predictionEntries.length,
			economic: economicEntries.length,
			movers: moverEntries.length,
			total: uniqueEntries.length,
		},
		"MacroWatch workflow complete",
	);

	return {
		entries: uniqueEntries,
		totalCount: uniqueEntries.length,
		timestamp: new Date().toISOString(),
	};
}
