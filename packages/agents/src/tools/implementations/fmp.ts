/**
 * FMP Tools
 *
 * Economic calendar and news search using FMP API.
 */

import { type ExecutionContext, isBacktest } from "@cream/domain";
import type { FMPStockNews } from "@cream/universe";
import { log } from "../../logger.js";
import { getFMPClient } from "../clients.js";
import type { EconomicEvent, NewsItem } from "../types.js";

/**
 * Map FMP impact levels to our impact enum
 */
function mapFMPImpact(impact?: "Low" | "Medium" | "High"): "low" | "medium" | "high" | undefined {
	switch (impact) {
		case "Low":
			return "low";
		case "Medium":
			return "medium";
		case "High":
			return "high";
		default:
			return undefined;
	}
}

/**
 * Simple sentiment detection based on keywords
 * Used as a quick heuristic; for more sophisticated analysis,
 * use the external-context package extraction pipeline.
 */
function detectSentiment(text: string): "positive" | "negative" | "neutral" {
	const lowerText = text.toLowerCase();

	// Positive keywords
	const positiveKeywords = [
		"surge",
		"soar",
		"jump",
		"rally",
		"gain",
		"rise",
		"beat",
		"exceed",
		"strong",
		"bullish",
		"upgrade",
		"outperform",
		"profit",
		"growth",
		"record",
		"breakthrough",
		"positive",
		"success",
	];

	// Negative keywords
	const negativeKeywords = [
		"drop",
		"fall",
		"plunge",
		"crash",
		"decline",
		"loss",
		"miss",
		"weak",
		"bearish",
		"downgrade",
		"underperform",
		"cut",
		"warning",
		"concern",
		"risk",
		"negative",
		"failure",
		"layoff",
	];

	let positiveCount = 0;
	let negativeCount = 0;

	for (const keyword of positiveKeywords) {
		if (lowerText.includes(keyword)) {
			positiveCount++;
		}
	}

	for (const keyword of negativeKeywords) {
		if (lowerText.includes(keyword)) {
			negativeCount++;
		}
	}

	if (positiveCount > negativeCount) {
		return "positive";
	}
	if (negativeCount > positiveCount) {
		return "negative";
	}
	return "neutral";
}

/**
 * Transform FMP news to NewsItem format
 */
function transformFMPNews(news: FMPStockNews): NewsItem {
	const combinedText = `${news.title} ${news.text}`;

	return {
		id: `fmp-${news.symbol}-${new Date(news.publishedDate).getTime()}`,
		headline: news.title,
		summary: news.text.substring(0, 500), // Limit summary length
		source: news.site,
		publishedAt: news.publishedDate,
		symbols: news.symbol ? [news.symbol] : [],
		sentiment: detectSentiment(combinedText),
	};
}

/**
 * Get economic calendar events
 *
 * Fetches upcoming and recent economic data releases from FMP API.
 * Returns empty array in backtest mode or if FMP API is unavailable.
 *
 * @param ctx - ExecutionContext
 * @param startDate - Start date (YYYY-MM-DD format)
 * @param endDate - End date (YYYY-MM-DD format)
 * @returns Array of economic events
 */
export async function getEconomicCalendar(
	ctx: ExecutionContext,
	startDate: string,
	endDate: string
): Promise<EconomicEvent[]> {
	// In backtest mode, return empty array for consistent/fast execution
	if (isBacktest(ctx)) {
		return [];
	}

	const client = getFMPClient();
	if (!client) {
		// FMP_KEY not set - return empty array
		return [];
	}

	try {
		// Convert ISO dates to YYYY-MM-DD format
		const from = startDate.split("T")[0] ?? startDate;
		const to = endDate.split("T")[0] ?? endDate;

		const events = await client.getEconomicCalendar(from, to);

		// Transform FMP events to our EconomicEvent format
		return events.map((event) => {
			// Extract time from date if it includes time, otherwise use midnight
			const [datePart, timePart] = event.date.includes(" ")
				? event.date.split(" ")
				: [event.date, "00:00:00"];

			// Generate a stable ID from date and event name
			const id = `${datePart}-${event.event.replace(/\s+/g, "-").toLowerCase()}`;

			return {
				id,
				name: event.event,
				date: datePart ?? event.date,
				time: timePart ?? "00:00:00",
				impact: mapFMPImpact(event.impact) ?? "medium",
				forecast: event.estimate != null ? String(event.estimate) : null,
				previous: event.previous != null ? String(event.previous) : null,
				actual: event.actual != null ? String(event.actual) : null,
			};
		});
	} catch (error) {
		log.warn(
			{ error: error instanceof Error ? error.message : String(error) },
			"Failed to fetch economic calendar"
		);
		return [];
	}
}

/**
 * Search news for symbols or keywords
 *
 * Fetches news from FMP API for the given symbols.
 * If no symbols provided, fetches general market news.
 * Uses simple keyword-based sentiment detection.
 *
 * For more sophisticated sentiment analysis with entity extraction,
 * use the @cream/external-context extraction pipeline.
 *
 * @param ctx - ExecutionContext
 * @param query - Search query (used for filtering results)
 * @param symbols - Optional symbol filter (fetches news for these symbols)
 * @param limit - Maximum number of results (default: 20)
 * @returns Array of news items with sentiment
 */
export async function searchNews(
	ctx: ExecutionContext,
	query: string,
	symbols: string[] = [],
	limit = 20
): Promise<NewsItem[]> {
	// In backtest mode, return empty array for consistent/fast execution
	if (isBacktest(ctx)) {
		return [];
	}

	const client = getFMPClient();
	if (!client) {
		// FMP_KEY not set - return empty array
		return [];
	}

	try {
		let newsItems: FMPStockNews[];

		if (symbols.length > 0) {
			// Fetch news for specific symbols
			newsItems = await client.getStockNews(symbols, limit);
		} else {
			// Fetch general market news
			newsItems = await client.getGeneralNews(limit);
		}

		// Transform to NewsItem format
		let results = newsItems.map(transformFMPNews);

		// Filter by query if provided
		if (query && query.trim() !== "") {
			const queryLower = query.toLowerCase();
			results = results.filter(
				(item) =>
					item.headline.toLowerCase().includes(queryLower) ||
					item.summary.toLowerCase().includes(queryLower)
			);
		}

		return results;
	} catch (error) {
		log.warn(
			{ error: error instanceof Error ? error.message : String(error) },
			"Failed to fetch news"
		);
		return [];
	}
}
