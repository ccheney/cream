/**
 * News Ingestion Service Tests
 *
 * Tests for the NewsIngestionService including:
 * - NewsItem conversion
 * - Embeddable text building
 */

import { describe, expect, test } from "bun:test";
import { _internal, type NewsItemInput } from "./news-ingestion.js";

const { toNewsItem, buildEmbeddableText } = _internal;

// ============================================
// Test Data Factories
// ============================================

function createMockNewsItemInput(overrides: Partial<NewsItemInput> = {}): NewsItemInput {
	return {
		itemId: "news-item-123",
		headline: "Apple announces record iPhone sales in Q4",
		bodyText:
			"Apple Inc. reported record iPhone sales in the fourth quarter, driven by strong demand for the new iPhone 15 Pro models. The company shipped over 80 million units globally, exceeding analyst expectations. CEO Tim Cook attributed the success to innovations in camera technology and the new titanium design.",
		publishedAt: new Date("2025-01-15T14:30:00Z"),
		source: "Reuters",
		relatedSymbols: ["AAPL"],
		sentimentScore: 0.75,
		...overrides,
	};
}

// ============================================
// NewsItem Conversion Tests
// ============================================

describe("toNewsItem", () => {
	test("converts itemId to item_id", () => {
		const input = createMockNewsItemInput();
		const newsItem = toNewsItem(input);
		expect(newsItem.item_id).toBe("news-item-123");
	});

	test("preserves headline", () => {
		const input = createMockNewsItemInput();
		const newsItem = toNewsItem(input);
		expect(newsItem.headline).toBe("Apple announces record iPhone sales in Q4");
	});

	test("converts bodyText to body_text", () => {
		const input = createMockNewsItemInput();
		const newsItem = toNewsItem(input);
		expect(newsItem.body_text).toContain("Apple Inc. reported record iPhone sales");
	});

	test("converts publishedAt to ISO string", () => {
		const input = createMockNewsItemInput();
		const newsItem = toNewsItem(input);
		expect(newsItem.published_at).toBe("2025-01-15T14:30:00.000Z");
	});

	test("preserves source", () => {
		const input = createMockNewsItemInput();
		const newsItem = toNewsItem(input);
		expect(newsItem.source).toBe("Reuters");
	});

	test("serializes relatedSymbols as JSON", () => {
		const input = createMockNewsItemInput({ relatedSymbols: ["AAPL", "MSFT", "GOOGL"] });
		const newsItem = toNewsItem(input);
		expect(newsItem.related_symbols).toBe(JSON.stringify(["AAPL", "MSFT", "GOOGL"]));
	});

	test("converts sentimentScore to sentiment_score", () => {
		const input = createMockNewsItemInput();
		const newsItem = toNewsItem(input);
		expect(newsItem.sentiment_score).toBe(0.75);
	});

	test("handles negative sentiment score", () => {
		const input = createMockNewsItemInput({ sentimentScore: -0.6 });
		const newsItem = toNewsItem(input);
		expect(newsItem.sentiment_score).toBe(-0.6);
	});

	test("handles empty relatedSymbols", () => {
		const input = createMockNewsItemInput({ relatedSymbols: [] });
		const newsItem = toNewsItem(input);
		expect(newsItem.related_symbols).toBe("[]");
	});
});

// ============================================
// Embeddable Text Building Tests
// ============================================

describe("buildEmbeddableText", () => {
	test("combines headline and body text", () => {
		const input = createMockNewsItemInput();
		const text = buildEmbeddableText(input);
		expect(text).toContain("Apple announces record iPhone sales in Q4");
		expect(text).toContain("Apple Inc. reported record iPhone sales");
	});

	test("separates headline and body with newlines", () => {
		const input = createMockNewsItemInput();
		const text = buildEmbeddableText(input);
		expect(text).toContain("\n\n");
	});

	test("truncates long body text to default 500 characters", () => {
		const longBody = "A".repeat(1000);
		const input = createMockNewsItemInput({ bodyText: longBody });
		const text = buildEmbeddableText(input);
		expect(text.length).toBeLessThan(input.headline.length + 500 + 20); // headline + body + separator + ellipsis
	});

	test("adds ellipsis when truncating", () => {
		const longBody = "A".repeat(1000);
		const input = createMockNewsItemInput({ bodyText: longBody });
		const text = buildEmbeddableText(input);
		expect(text).toContain("...");
	});

	test("does not truncate short body text", () => {
		const shortBody = "Short news body.";
		const input = createMockNewsItemInput({ bodyText: shortBody });
		const text = buildEmbeddableText(input);
		expect(text).not.toContain("...");
		expect(text).toContain(shortBody);
	});

	test("respects custom max body length", () => {
		const longBody = "A".repeat(1000);
		const input = createMockNewsItemInput({ bodyText: longBody });
		const text = buildEmbeddableText(input, 100);
		const bodyPart = text.split("\n\n")[1];
		expect(bodyPart?.length).toBeLessThanOrEqual(103); // 100 + "..."
	});

	test("handles empty body text", () => {
		const input = createMockNewsItemInput({ bodyText: "" });
		const text = buildEmbeddableText(input);
		expect(text).toContain(input.headline);
		expect(text).toContain("\n\n");
	});

	test("handles body text exactly at max length", () => {
		const exactBody = "A".repeat(500);
		const input = createMockNewsItemInput({ bodyText: exactBody });
		const text = buildEmbeddableText(input);
		expect(text).not.toContain("...");
		expect(text).toContain(exactBody);
	});

	test("handles body text one character over max length", () => {
		const overBody = "A".repeat(501);
		const input = createMockNewsItemInput({ bodyText: overBody });
		const text = buildEmbeddableText(input);
		expect(text).toContain("...");
	});
});

// ============================================
// NewsItemInput Validation Tests
// ============================================

describe("NewsItemInput structure", () => {
	test("accepts all valid fields", () => {
		const input = createMockNewsItemInput();
		expect(input.itemId).toBeDefined();
		expect(input.headline).toBeDefined();
		expect(input.bodyText).toBeDefined();
		expect(input.publishedAt).toBeInstanceOf(Date);
		expect(input.source).toBeDefined();
		expect(Array.isArray(input.relatedSymbols)).toBe(true);
		expect(typeof input.sentimentScore).toBe("number");
	});

	test("sentiment score is within valid range", () => {
		const input = createMockNewsItemInput();
		expect(input.sentimentScore).toBeGreaterThanOrEqual(-1);
		expect(input.sentimentScore).toBeLessThanOrEqual(1);
	});
});
