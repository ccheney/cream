/**
 * Parser Tests: News
 */

import { expect, it } from "bun:test";
import type { NewsArticle } from "../src/index.js";
import { filterNewsBySymbols, filterRecentNews, parseNewsArticles } from "../src/index.js";

it("should parse valid news article", () => {
	const article: NewsArticle = {
		symbol: "AAPL",
		publishedDate: "2026-01-05T10:00:00Z",
		title: "Apple Reports Record Q1 Earnings",
		site: "reuters.com",
		text: "Apple Inc. announced record quarterly earnings today, beating analyst expectations. The company reported revenue of $120 billion, driven by strong iPhone sales.",
		url: "https://reuters.com/article/apple-earnings",
	};

	const results = parseNewsArticles([article]);
	expect(results).toHaveLength(1);
	const firstResult = results[0];
	if (firstResult) {
		expect(firstResult.headline).toBe("Apple Reports Record Q1 Earnings");
		expect(firstResult.symbols).toEqual(["AAPL"]);
		expect(firstResult.source).toBe("reuters.com");
	}
});

it("should filter articles below minimum length", () => {
	const article: NewsArticle = {
		publishedDate: "2026-01-05T10:00:00Z",
		title: "Short",
		site: "test",
		text: "Too short",
		url: "",
	};

	const results = parseNewsArticles([article], { minContentLength: 50 });
	expect(results).toHaveLength(0);
});

it("should filter recent news by age", () => {
	const now = new Date();
	const oldDate = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48 hours ago

	const articles = [
		{
			headline: "Recent",
			body: "test",
			publishedAt: now,
			source: "test",
		},
		{
			headline: "Old",
			body: "test",
			publishedAt: oldDate,
			source: "test",
		},
	];

	const filtered = filterRecentNews(articles, 24);
	expect(filtered).toHaveLength(1);
	const firstFiltered = filtered[0];
	if (firstFiltered) {
		expect(firstFiltered.headline).toBe("Recent");
	}
});

it("should filter news by symbols", () => {
	const articles = [
		{
			headline: "Apple News",
			body: "test",
			publishedAt: new Date(),
			source: "test",
			symbols: ["AAPL"],
		},
		{
			headline: "Microsoft News",
			body: "test",
			publishedAt: new Date(),
			source: "test",
			symbols: ["MSFT"],
		},
	];

	const filtered = filterNewsBySymbols(articles, ["AAPL"]);
	expect(filtered).toHaveLength(1);
	const firstFiltered = filtered[0];
	if (firstFiltered) {
		expect(firstFiltered.headline).toBe("Apple News");
	}
});
