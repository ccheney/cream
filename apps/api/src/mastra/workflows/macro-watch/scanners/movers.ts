/**
 * Market Movers Scanner
 *
 * Scans Alpaca screener for pre-market movers and most active stocks.
 *
 * @see docs/plans/42-overnight-macro-watch.md
 */

import { createAlpacaScreenerFromEnv, isAlpacaScreenerConfigured } from "@cream/marketdata";

import type { MacroWatchEntry, MacroWatchSession } from "../schemas.js";

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
 * Threshold for significant price moves (percent change).
 */
const SIGNIFICANT_MOVE_PCT = 3.0;

/**
 * Scan for significant market movers and most active stocks.
 *
 * @param universeSymbols - Universe symbols to prioritize
 * @returns Array of MacroWatchEntry for significant movers
 */
export async function scanMovers(universeSymbols: string[]): Promise<MacroWatchEntry[]> {
	if (!isAlpacaScreenerConfigured()) {
		return [];
	}

	const entries: MacroWatchEntry[] = [];
	const session = getCurrentSession();
	const now = new Date().toISOString();

	try {
		const screener = createAlpacaScreenerFromEnv();

		// Get market movers
		const movers = await screener.getPreMarketMovers(universeSymbols, 10);

		// Process gainers
		for (const gainer of movers.gainers) {
			if (Math.abs(gainer.percent_change) >= SIGNIFICANT_MOVE_PCT) {
				const isUniverse = universeSymbols
					.map((s) => s.toUpperCase())
					.includes(gainer.symbol.toUpperCase());

				entries.push({
					id: `mover-gainer-${gainer.symbol}-${Date.now()}`,
					timestamp: now,
					session,
					category: "MOVER",
					headline: `${gainer.symbol} +${gainer.percent_change.toFixed(1)}% (${isUniverse ? "UNIVERSE" : "market"})`,
					symbols: [gainer.symbol],
					source: "Alpaca Screener",
					metadata: {
						direction: "up",
						percentChange: gainer.percent_change,
						priceChange: gainer.change,
						currentPrice: gainer.price,
						isUniverse,
					},
				});
			}
		}

		// Process losers
		for (const loser of movers.losers) {
			if (Math.abs(loser.percent_change) >= SIGNIFICANT_MOVE_PCT) {
				const isUniverse = universeSymbols
					.map((s) => s.toUpperCase())
					.includes(loser.symbol.toUpperCase());

				entries.push({
					id: `mover-loser-${loser.symbol}-${Date.now()}`,
					timestamp: now,
					session,
					category: "MOVER",
					headline: `${loser.symbol} ${loser.percent_change.toFixed(1)}% (${isUniverse ? "UNIVERSE" : "market"})`,
					symbols: [loser.symbol],
					source: "Alpaca Screener",
					metadata: {
						direction: "down",
						percentChange: loser.percent_change,
						priceChange: loser.change,
						currentPrice: loser.price,
						isUniverse,
					},
				});
			}
		}

		// Get most active stocks
		const mostActives = await screener.getMostActives("volume", 20);

		// Filter to universe symbols with high activity
		const universeSet = new Set(universeSymbols.map((s) => s.toUpperCase()));
		const universeActives = mostActives.filter((a) => universeSet.has(a.symbol.toUpperCase()));

		// Report unusually active universe symbols
		for (const active of universeActives.slice(0, 5)) {
			entries.push({
				id: `mover-active-${active.symbol}-${Date.now()}`,
				timestamp: now,
				session,
				category: "MOVER",
				headline: `${active.symbol} high volume: ${formatVolume(active.volume)} (${active.trade_count.toLocaleString()} trades)`,
				symbols: [active.symbol],
				source: "Alpaca Screener",
				metadata: {
					type: "most_active",
					volume: active.volume,
					tradeCount: active.trade_count,
					isUniverse: true,
				},
			});
		}
	} catch {
		// Return empty on error - movers scan is best-effort
	}

	return entries;
}

/**
 * Format volume with K/M/B suffixes.
 */
function formatVolume(volume: number): string {
	if (volume >= 1_000_000_000) {
		return `${(volume / 1_000_000_000).toFixed(1)}B`;
	}
	if (volume >= 1_000_000) {
		return `${(volume / 1_000_000).toFixed(1)}M`;
	}
	if (volume >= 1_000) {
		return `${(volume / 1_000).toFixed(1)}K`;
	}
	return String(volume);
}
