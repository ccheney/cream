/**
 * News Parser
 *
 * Parses news articles into normalized format.
 */

import type { NewsArticle, ParsedNews } from "../types.js";

/**
 * News parser configuration
 */
export interface NewsParserConfig {
	/** Minimum content length to accept (default: 50) */
	minContentLength?: number;
	/** Maximum content length before truncation (default: 10000) */
	maxContentLength?: number;
}

const DEFAULT_CONFIG: Required<NewsParserConfig> = {
	minContentLength: 50,
	maxContentLength: 10000,
};

/**
 * Parse news articles into normalized format
 */
export function parseNewsArticles(
	articles: NewsArticle[],
	config: NewsParserConfig = {},
): ParsedNews[] {
	const cfg = { ...DEFAULT_CONFIG, ...config };
	const results: ParsedNews[] = [];

	for (const article of articles) {
		const parsed = parseNewsArticle(article, cfg);
		if (parsed) {
			results.push(parsed);
		}
	}

	return results;
}

/**
 * Parse a single news article
 */
export function parseNewsArticle(
	article: NewsArticle,
	config: Required<NewsParserConfig>,
): ParsedNews | null {
	// Validate required fields
	if (!article.title || !article.text) {
		return null;
	}

	// Check minimum content length
	const contentLength = article.text.length;
	if (contentLength < config.minContentLength) {
		return null;
	}

	// Truncate if needed
	let body = article.text;
	if (body.length > config.maxContentLength) {
		body = `${body.slice(0, config.maxContentLength)}...`;
	}

	// Parse published date
	const publishedAt = parseDate(article.publishedDate);
	if (!publishedAt) {
		return null;
	}

	// Extract symbols (may be comma-separated or single)
	const symbols = article.symbol
		? article.symbol.split(",").map((s) => s.trim().toUpperCase())
		: undefined;

	return {
		headline: cleanText(article.title),
		body: cleanText(body),
		publishedAt,
		source: article.site || "unknown",
		url: article.url,
		symbols,
	};
}

/**
 * Parse date string to Date object
 */
function parseDate(dateStr: string): Date | null {
	if (!dateStr) {
		return null;
	}

	const date = new Date(dateStr);
	if (Number.isNaN(date.getTime())) {
		return null;
	}

	return date;
}

/**
 * Clean text by removing extra whitespace and HTML entities
 */
function cleanText(text: string): string {
	return text
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/<[^>]*>/g, "") // Strip HTML tags
		.replace(/\s+/g, " ") // Normalize whitespace
		.trim();
}

/**
 * Filter news by recency
 */
export function filterRecentNews(articles: ParsedNews[], maxAgeHours = 24): ParsedNews[] {
	const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
	return articles.filter((a) => a.publishedAt >= cutoff);
}

/**
 * Filter news by symbols
 */
export function filterNewsBySymbols(articles: ParsedNews[], symbols: string[]): ParsedNews[] {
	const symbolSet = new Set(symbols.map((s) => s.toUpperCase()));
	return articles.filter((a) => a.symbols?.some((s) => symbolSet.has(s)) ?? false);
}
