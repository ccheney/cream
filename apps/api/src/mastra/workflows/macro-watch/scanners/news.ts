/**
 * News Scanner
 *
 * Scans Alpaca news API for relevant news since last scan.
 *
 * @see docs/plans/42-overnight-macro-watch.md
 */

import { createNodeLogger } from "@cream/logger";
import { createAlpacaClientFromEnv, isAlpacaConfigured } from "@cream/marketdata";

import type { MacroWatchEntry, MacroWatchSession } from "../schemas.js";

const log = createNodeLogger({ service: "macro-watch-news", level: "info" });

/**
 * Major indices and macro symbols to always include in news.
 */
const MAJOR_INDEX_ETFS = ["SPY", "QQQ", "DIA", "IWM", "RSP"];
const VOLATILITY_SYMBOLS = ["VIX", "UVXY", "VXX", "VIXY", "SVXY", "VIXM"];
const BOND_SYMBOLS = ["TLT", "TBT", "BND", "HYG", "LQD"];
const METAL_SYMBOLS = ["GLD", "SLV", "GDX", "GOLD"];
const ENERGY_SYMBOLS = ["USO", "XLE", "XOP", "OIL", "UCO"];
const SECTOR_ETFS = ["XLF", "XLK", "XLV", "XLI", "XLC"];
const CURRENCY_SYMBOLS = ["DXY", "UUP", "FXE", "FXY"];
const INTERNATIONAL_ETFS = ["EEM", "EFA", "VWO"];

const MAJOR_SYMBOLS = new Set([
	...MAJOR_INDEX_ETFS,
	...VOLATILITY_SYMBOLS,
	...BOND_SYMBOLS,
	...METAL_SYMBOLS,
	...ENERGY_SYMBOLS,
	...SECTOR_ETFS,
	...CURRENCY_SYMBOLS,
	...INTERNATIONAL_ETFS,
]);

/**
 * Determine the macro watch session based on current time.
 */
function getCurrentSession(): MacroWatchSession {
	const now = new Date();
	const etHour = (now.getUTCHours() - 5 + 24) % 24;

	// Pre-market: 4:00 AM - 9:30 AM ET
	if (etHour >= 4 && etHour < 10) {
		return "PRE_MARKET";
	}
	// After-hours: 4:00 PM - 8:00 PM ET
	if (etHour >= 16 && etHour < 20) {
		return "AFTER_HOURS";
	}
	// Overnight: 8:00 PM - 4:00 AM ET
	return "OVERNIGHT";
}

/**
 * Major symbols array for API calls (Alpaca limits symbols per request).
 * Prioritized subset of MAJOR_SYMBOLS for direct fetching.
 */
const MAJOR_SYMBOLS_FOR_FETCH = [...MAJOR_INDEX_ETFS, "VIX", "TLT", "GLD", "USO", "EEM"];

/**
 * Scan Alpaca news for universe symbols and major indices since the given time.
 *
 * Always fetches news for major indices regardless of universe - these are
 * macro-relevant for all trading decisions.
 *
 * @param symbols - Universe symbols to filter news for
 * @param since - ISO timestamp to fetch news since
 * @returns Array of MacroWatchEntry for news articles
 */
export async function scanNews(symbols: string[], since: string): Promise<MacroWatchEntry[]> {
	if (!isAlpacaConfigured()) {
		log.warn({}, "Alpaca not configured, skipping news scan");
		return [];
	}

	const entries: MacroWatchEntry[] = [];
	const session = getCurrentSession();
	const seenArticleIds = new Set<number>();
	const universeSet = new Set(symbols.map((u) => u.toUpperCase()));

	try {
		const client = createAlpacaClientFromEnv();
		const now = new Date().toISOString();

		// 1. Always fetch news for major indices (macro context for all users)
		const majorNews = await client.getNews(MAJOR_SYMBOLS_FOR_FETCH, 30, since, now);

		for (const article of majorNews) {
			seenArticleIds.add(article.id);
			entries.push({
				timestamp: article.created_at,
				session,
				category: "NEWS",
				headline: article.headline,
				symbols: article.symbols,
				source: article.source,
				metadata: {
					articleId: article.id,
					summary: article.summary,
					url: article.url,
					isMacro: true,
				},
			});
		}

		// 2. Fetch news for user's universe symbols (if any symbols provided)
		if (symbols.length > 0) {
			const universeNews = await client.getNews(symbols, 30, since, now);

			for (const article of universeNews) {
				if (seenArticleIds.has(article.id)) {
					continue;
				}
				seenArticleIds.add(article.id);
				entries.push({
					timestamp: article.created_at,
					session,
					category: "NEWS",
					headline: article.headline,
					symbols: article.symbols,
					source: article.source,
					metadata: {
						articleId: article.id,
						summary: article.summary,
						url: article.url,
						isMacro: false,
					},
				});
			}
		}

		// 3. Fetch general market news for broader context
		const generalNews = await client.getNews([], 20, since, now);

		for (const article of generalNews) {
			if (seenArticleIds.has(article.id)) {
				continue;
			}

			// Include if it mentions any universe symbol or major indices
			const mentionsUniverse = article.symbols.some((s) => universeSet.has(s.toUpperCase()));
			const mentionsMajor = article.symbols.some((s) => MAJOR_SYMBOLS.has(s.toUpperCase()));

			if (mentionsUniverse || mentionsMajor) {
				seenArticleIds.add(article.id);
				entries.push({
					timestamp: article.created_at,
					session,
					category: "NEWS",
					headline: article.headline,
					symbols: article.symbols,
					source: article.source,
					metadata: {
						articleId: article.id,
						summary: article.summary,
						url: article.url,
						isMacro: mentionsMajor && !mentionsUniverse,
					},
				});
			}
		}
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"News scan failed",
		);
	}

	return entries;
}
