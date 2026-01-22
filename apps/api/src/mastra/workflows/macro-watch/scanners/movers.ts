/**
 * Market Movers Scanner
 *
 * Scans Alpaca screener for pre-market movers and most active stocks.
 *
 * @see docs/plans/42-overnight-macro-watch.md
 */

import { createNodeLogger } from "@cream/logger";
import { createAlpacaScreenerFromEnv, isAlpacaScreenerConfigured } from "@cream/marketdata";

import type { MacroWatchEntry, MacroWatchSession } from "../schemas.js";

const log = createNodeLogger({ service: "macro-watch-movers", level: "info" });

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
 * Minimum price to filter out penny stocks/microcaps.
 */
const MIN_PRICE = 25.0;

/**
 * Allowed exchanges (filter out OTC).
 */
const ALLOWED_EXCHANGES = new Set(["NYSE", "NASDAQ", "ARCA", "AMEX", "BATS", "NYE"]);

/**
 * Excluded symbol suffixes (warrants, units, rights).
 * W = Warrants, U = Units, R = Rights
 */
const EXCLUDED_SUFFIXES = ["W", "U", "R", "WS"];

/**
 * Check if a symbol is a common stock (not warrant/unit/rights).
 */
function isCommonStock(symbol: string): boolean {
	const upper = symbol.toUpperCase();
	return !EXCLUDED_SUFFIXES.some((suffix) => upper.endsWith(suffix));
}

/**
 * Check if a symbol passes exchange filter.
 */
function isAllowedExchange(exchange: string | undefined): boolean {
	if (!exchange) {
		return false;
	}
	return ALLOWED_EXCHANGES.has(exchange.toUpperCase());
}

/**
 * Scan for significant market movers and most active stocks.
 *
 * @param universeSymbols - Universe symbols to prioritize
 * @returns Array of MacroWatchEntry for significant movers
 */
export async function scanMovers(universeSymbols: string[]): Promise<MacroWatchEntry[]> {
	if (!isAlpacaScreenerConfigured()) {
		log.warn({}, "Alpaca Screener not configured, skipping movers scan");
		return [];
	}

	const entries: MacroWatchEntry[] = [];
	const session = getCurrentSession();
	const now = new Date().toISOString();

	try {
		const screener = createAlpacaScreenerFromEnv();

		// Get market movers
		const movers = await screener.getPreMarketMovers(universeSymbols, 10);

		// Filter movers by price and symbol type (exclude warrants/units)
		const priceFilteredGainers = movers.gainers.filter(
			(m) =>
				Math.abs(m.percent_change) >= SIGNIFICANT_MOVE_PCT &&
				m.price >= MIN_PRICE &&
				isCommonStock(m.symbol),
		);
		const priceFilteredLosers = movers.losers.filter(
			(m) =>
				Math.abs(m.percent_change) >= SIGNIFICANT_MOVE_PCT &&
				m.price >= MIN_PRICE &&
				isCommonStock(m.symbol),
		);

		// Get unique symbols that passed price filter for exchange lookup
		const symbolsToCheck = [
			...new Set([
				...priceFilteredGainers.map((m) => m.symbol),
				...priceFilteredLosers.map((m) => m.symbol),
			]),
		];

		// Batch lookup asset info for exchange filtering
		const assetInfoMap = await screener.getAssetsInfo(symbolsToCheck);

		// Process gainers (filter by exchange)
		for (const gainer of priceFilteredGainers) {
			const assetInfo = assetInfoMap.get(gainer.symbol.toUpperCase());
			if (!isAllowedExchange(assetInfo?.exchange)) {
				continue;
			}

			const isUniverse = universeSymbols
				.map((s) => s.toUpperCase())
				.includes(gainer.symbol.toUpperCase());

			entries.push({
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
					exchange: assetInfo?.exchange,
					isUniverse,
				},
			});
		}

		// Process losers (filter by exchange)
		for (const loser of priceFilteredLosers) {
			const assetInfo = assetInfoMap.get(loser.symbol.toUpperCase());
			if (!isAllowedExchange(assetInfo?.exchange)) {
				continue;
			}

			const isUniverse = universeSymbols
				.map((s) => s.toUpperCase())
				.includes(loser.symbol.toUpperCase());

			entries.push({
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
					exchange: assetInfo?.exchange,
					isUniverse,
				},
			});
		}

		// Get most active stocks
		const mostActives = await screener.getMostActives("volume", 20);

		// Filter to universe symbols with high activity
		const universeSet = new Set(universeSymbols.map((s) => s.toUpperCase()));
		const universeActives = mostActives.filter((a) => universeSet.has(a.symbol.toUpperCase()));

		// Report unusually active universe symbols
		for (const active of universeActives.slice(0, 5)) {
			entries.push({
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
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"Movers scan failed",
		);
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
