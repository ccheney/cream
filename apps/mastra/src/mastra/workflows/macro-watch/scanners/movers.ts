/**
 * Market Movers Scanner
 *
 * Scans Alpaca screener for pre-market movers and most active stocks.
 *
 * @see docs/plans/42-overnight-macro-watch.md
 */

import { createNodeLogger } from "@cream/logger";
import { createAlpacaScreenerFromEnv, isAlpacaScreenerConfigured } from "@cream/marketdata";

import type { MacroWatchEntry, MacroWatchSession } from "../entry-schemas.js";

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

interface ScreenerMover {
	symbol: string;
	percent_change: number;
	price: number;
	change: number;
}

interface ScreenerActive {
	symbol: string;
	volume: number;
	trade_count: number;
}

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
	return typeof exchange === "string" && ALLOWED_EXCHANGES.has(exchange.toUpperCase());
}

function toUniverseSet(universeSymbols: string[]): Set<string> {
	return new Set(universeSymbols.map((symbol) => symbol.toUpperCase()));
}

function isSignificantMover(mover: ScreenerMover): boolean {
	return (
		Math.abs(mover.percent_change) >= SIGNIFICANT_MOVE_PCT &&
		mover.price >= MIN_PRICE &&
		isCommonStock(mover.symbol)
	);
}

function filterSignificantMovers(movers: { gainers: ScreenerMover[]; losers: ScreenerMover[] }): {
	gainers: ScreenerMover[];
	losers: ScreenerMover[];
	symbolsToCheck: string[];
} {
	const gainers = movers.gainers.filter(isSignificantMover);
	const losers = movers.losers.filter(isSignificantMover);
	const symbolsToCheck = [
		...new Set([...gainers.map((m) => m.symbol), ...losers.map((m) => m.symbol)]),
	];
	return { gainers, losers, symbolsToCheck };
}

function buildMoverHeadline(
	mover: ScreenerMover,
	direction: "up" | "down",
	isUniverse: boolean,
): string {
	const prefix = direction === "up" ? "+" : "";
	const scope = isUniverse ? "UNIVERSE" : "market";
	return `${mover.symbol} ${prefix}${mover.percent_change.toFixed(1)}% (${scope})`;
}

function buildMoverEntries(
	movers: ScreenerMover[],
	direction: "up" | "down",
	universeSet: Set<string>,
	assetInfoMap: Map<string, { exchange?: string }>,
	timestamp: string,
	session: MacroWatchSession,
): MacroWatchEntry[] {
	const entries: MacroWatchEntry[] = [];
	for (const mover of movers) {
		const symbolUpper = mover.symbol.toUpperCase();
		const assetInfo = assetInfoMap.get(symbolUpper);
		if (!isAllowedExchange(assetInfo?.exchange)) {
			continue;
		}

		const isUniverse = universeSet.has(symbolUpper);
		entries.push({
			timestamp,
			session,
			category: "MOVER",
			headline: buildMoverHeadline(mover, direction, isUniverse),
			symbols: [mover.symbol],
			source: "Alpaca Screener",
			metadata: {
				direction,
				percentChange: mover.percent_change,
				priceChange: mover.change,
				currentPrice: mover.price,
				exchange: assetInfo?.exchange,
				isUniverse,
			},
		});
	}
	return entries;
}

function buildUniverseActiveEntries(
	mostActives: ScreenerActive[],
	universeSet: Set<string>,
	timestamp: string,
	session: MacroWatchSession,
): MacroWatchEntry[] {
	return mostActives
		.filter((active) => universeSet.has(active.symbol.toUpperCase()))
		.slice(0, 5)
		.map((active) => ({
			timestamp,
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
		}));
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

	const now = new Date().toISOString();
	const session = getCurrentSession();
	const universeSet = toUniverseSet(universeSymbols);
	const entries: MacroWatchEntry[] = [];

	try {
		const screener = createAlpacaScreenerFromEnv();
		const movers = await screener.getPreMarketMovers(universeSymbols, 10);
		const filtered = filterSignificantMovers(movers);
		const assetInfoMap = await screener.getAssetsInfo(filtered.symbolsToCheck);

		entries.push(
			...buildMoverEntries(filtered.gainers, "up", universeSet, assetInfoMap, now, session),
			...buildMoverEntries(filtered.losers, "down", universeSet, assetInfoMap, now, session),
		);

		const mostActives = await screener.getMostActives("volume", 20);
		entries.push(...buildUniverseActiveEntries(mostActives, universeSet, now, session));
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
