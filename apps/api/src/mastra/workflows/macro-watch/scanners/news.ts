/**
 * News Scanner
 *
 * Scans Alpaca news API for relevant news since last scan.
 *
 * @see docs/plans/42-overnight-macro-watch.md
 */

import { createAlpacaClientFromEnv, isAlpacaConfigured } from "@cream/marketdata";

import type { MacroWatchEntry, MacroWatchSession } from "../schemas.js";

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
 * Scan Alpaca news for universe symbols since the given time.
 *
 * @param symbols - Universe symbols to filter news for
 * @param since - ISO timestamp to fetch news since
 * @returns Array of MacroWatchEntry for news articles
 */
export async function scanNews(symbols: string[], since: string): Promise<MacroWatchEntry[]> {
	if (!isAlpacaConfigured()) {
		return [];
	}

	const entries: MacroWatchEntry[] = [];
	const session = getCurrentSession();

	try {
		const client = createAlpacaClientFromEnv();
		const now = new Date().toISOString();

		// Fetch news for universe symbols
		const news = await client.getNews(symbols, 50, since, now);

		for (const article of news) {
			entries.push({
				id: `news-${article.id}`,
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
				},
			});
		}

		// Also fetch general market news (no symbol filter) for broader context
		const generalNews = await client.getNews([], 20, since, now);
		for (const article of generalNews) {
			// Skip if already captured via symbol filter
			if (entries.some((e) => e.id === `news-${article.id}`)) {
				continue;
			}

			// Only include if it mentions any universe symbol
			const mentionsUniverse = article.symbols.some((s) =>
				symbols.map((u) => u.toUpperCase()).includes(s.toUpperCase())
			);

			if (mentionsUniverse) {
				entries.push({
					id: `news-${article.id}`,
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
					},
				});
			}
		}
	} catch {
		// Return empty on error - news scan is best-effort
	}

	return entries;
}
