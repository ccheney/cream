/**
 * News Scanner
 *
 * Scans Alpaca news API for relevant news since last scan.
 *
 * @see docs/plans/42-overnight-macro-watch.md
 */

import { createNodeLogger } from "@cream/logger";
import { createAlpacaClientFromEnv, isAlpacaConfigured } from "@cream/marketdata";

import type { MacroWatchEntry, MacroWatchSession } from "../entry-schemas.js";

const log = createNodeLogger({ service: "macro-watch-news", level: "info" });

interface NewsArticle {
	id: number;
	created_at: string;
	headline: string;
	symbols: string[];
	source: string;
	summary?: string;
	url?: string;
}

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

function toUniverseSet(symbols: string[]): Set<string> {
	return new Set(symbols.map((symbol) => symbol.toUpperCase()));
}

function createNewsEntry(
	article: NewsArticle,
	session: MacroWatchSession,
	isMacro: boolean,
): MacroWatchEntry {
	return {
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
			isMacro,
		},
	};
}

function addUniqueNewsEntries(
	entries: MacroWatchEntry[],
	seenArticleIds: Set<number>,
	articles: NewsArticle[],
	session: MacroWatchSession,
	isMacro: boolean,
): void {
	for (const article of articles) {
		if (seenArticleIds.has(article.id)) {
			continue;
		}
		seenArticleIds.add(article.id);
		entries.push(createNewsEntry(article, session, isMacro));
	}
}

function shouldIncludeGeneralArticle(
	article: NewsArticle,
	universeSet: Set<string>,
): {
	include: boolean;
	isMacro: boolean;
} {
	const mentionsUniverse = article.symbols.some((symbol) => universeSet.has(symbol.toUpperCase()));
	const mentionsMajor = article.symbols.some((symbol) => MAJOR_SYMBOLS.has(symbol.toUpperCase()));
	return {
		include: mentionsUniverse || mentionsMajor,
		isMacro: mentionsMajor && !mentionsUniverse,
	};
}

function addGeneralNewsEntries(
	entries: MacroWatchEntry[],
	seenArticleIds: Set<number>,
	articles: NewsArticle[],
	session: MacroWatchSession,
	universeSet: Set<string>,
): void {
	for (const article of articles) {
		if (seenArticleIds.has(article.id)) {
			continue;
		}

		const inclusion = shouldIncludeGeneralArticle(article, universeSet);
		if (!inclusion.include) {
			continue;
		}

		seenArticleIds.add(article.id);
		entries.push(createNewsEntry(article, session, inclusion.isMacro));
	}
}

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
	const universeSet = toUniverseSet(symbols);

	try {
		const client = createAlpacaClientFromEnv();
		const now = new Date().toISOString();

		const majorNews = await client.getNews(MAJOR_SYMBOLS_FOR_FETCH, 30, since, now);
		addUniqueNewsEntries(entries, seenArticleIds, majorNews, session, true);

		if (symbols.length > 0) {
			const universeNews = await client.getNews(symbols, 30, since, now);
			addUniqueNewsEntries(entries, seenArticleIds, universeNews, session, false);
		}

		const generalNews = await client.getNews([], 20, since, now);
		addGeneralNewsEntries(entries, seenArticleIds, generalNews, session, universeSet);
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"News scan failed",
		);
	}

	return entries;
}
