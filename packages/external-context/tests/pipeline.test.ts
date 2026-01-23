/**
 * Pipeline Tests
 */

import { describe, expect, it } from "bun:test";
import { requireValue } from "@cream/test-utils";
import type { IExtractionClient, NewsArticle } from "../src/index.js";
import { createExtractionPipeline, ExtractionPipeline } from "../src/index.js";

/**
 * Mock extraction client for testing
 */
const mockExtractionClient: IExtractionClient = {
	async extract() {
		return {
			sentiment: "neutral" as const,
			confidence: 0.5,
			entities: [],
			dataPoints: [],
			eventType: "other" as const,
			importance: 3,
			summary: "Test summary",
			keyInsights: [],
		};
	},
	async testConnection() {
		return true;
	},
};

describe("ExtractionPipeline", () => {
	describe("Dry Run Mode", () => {
		const pipeline = createExtractionPipeline({
			extractionClient: mockExtractionClient,
			dryRun: true,
		});

		it("should process content in dry run mode", async () => {
			const event = await pipeline.processContent(
				"Apple reported record earnings today, beating analyst expectations with revenue of $120 billion.",
				"news",
				new Date(),
				"reuters.com",
				["AAPL"],
			);

			const eventValue = requireValue(event, "Expected event to be returned");
			expect(eventValue.eventId).toBeDefined();
			expect(eventValue.sourceType).toBe("news");
			expect(eventValue.scores).toBeDefined();
			expect(eventValue.scores.sentimentScore).toBeDefined();
			expect(eventValue.scores.importanceScore).toBeDefined();
			expect(eventValue.scores.surpriseScore).toBeDefined();
		});

		it("should process news articles", async () => {
			const articles: NewsArticle[] = [
				{
					symbol: "AAPL",
					publishedDate: "2026-01-05T10:00:00Z",
					title: "Apple Reports Strong Q1 Results",
					site: "reuters.com",
					text: "Apple Inc. announced quarterly earnings that exceeded analyst expectations. Revenue came in at $120 billion, driven by strong iPhone and services growth.",
					url: "https://reuters.com/article/apple",
				},
			];

			const result = await pipeline.processNews(articles);
			expect(result.success).toBe(true);
			expect(result.events).toHaveLength(1);
			expect(result.stats.inputCount).toBe(1);
			expect(result.stats.successCount).toBe(1);
		});

		it("should include related instrument IDs", async () => {
			const event = await pipeline.processContent(
				"Tesla announced a new battery technology partnership with CATL.",
				"news",
				new Date(),
				"test",
				["TSLA"],
			);

			const eventValue = requireValue(event, "Expected event to be returned");
			expect(eventValue.relatedInstrumentIds).toContain("TSLA");
		});

		it("should include processing timestamp", async () => {
			const before = new Date();
			const event = await pipeline.processContent("Test content for pipeline processing.", "news");
			const after = new Date();

			const eventValue = requireValue(event, "Expected event to be returned");
			expect(eventValue.processedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
			expect(eventValue.processedAt.getTime()).toBeLessThanOrEqual(after.getTime());
		});
	});

	describe("Pipeline Configuration", () => {
		it("should create pipeline with target symbols", () => {
			const pipeline = createExtractionPipeline({
				extractionClient: mockExtractionClient,
				targetSymbols: ["AAPL", "MSFT", "GOOGL"],
				dryRun: true,
			});

			expect(pipeline).toBeInstanceOf(ExtractionPipeline);
		});

		it("should create pipeline with expectations", () => {
			const pipeline = createExtractionPipeline({
				extractionClient: mockExtractionClient,
				expectations: [
					{ metric: "revenue", expectedValue: 100 },
					{ metric: "eps", expectedValue: 2.5 },
				],
				dryRun: true,
			});

			expect(pipeline).toBeInstanceOf(ExtractionPipeline);
		});

		it("should expose extraction client", () => {
			const pipeline = createExtractionPipeline({
				extractionClient: mockExtractionClient,
				dryRun: true,
			});
			const client = pipeline.getExtractionClient();
			expect(client).toBeDefined();
		});

		it("should expose entity linker", () => {
			const pipeline = createExtractionPipeline({
				extractionClient: mockExtractionClient,
				dryRun: true,
			});
			const linker = pipeline.getEntityLinker();
			expect(linker).toBeDefined();
		});
	});

	describe("Pipeline Results", () => {
		const pipeline = createExtractionPipeline({
			extractionClient: mockExtractionClient,
			dryRun: true,
		});

		it("should track processing stats", async () => {
			const articles: NewsArticle[] = [
				{
					publishedDate: "2026-01-05T10:00:00Z",
					title: "Article 1",
					site: "test",
					text: "This is a test article about market conditions and economic outlook for the quarter.",
					url: "",
				},
				{
					publishedDate: "2026-01-05T11:00:00Z",
					title: "Article 2",
					site: "test",
					text: "Another test article discussing technology sector performance and growth expectations.",
					url: "",
				},
			];

			const result = await pipeline.processNews(articles);
			expect(result.stats.inputCount).toBe(2);
			expect(result.stats.successCount).toBe(2);
			expect(result.stats.errorCount).toBe(0);
			expect(result.stats.processingTimeMs).toBeGreaterThanOrEqual(0);
		});

		it("should generate unique event IDs", async () => {
			const event1 = await pipeline.processContent("Content 1", "news");
			const event2 = await pipeline.processContent("Content 2", "news");

			const firstEvent = requireValue(event1, "Expected first event to be returned");
			const secondEvent = requireValue(event2, "Expected second event to be returned");
			expect(firstEvent.eventId).not.toBe(secondEvent.eventId);
		});
	});

	describe("Source Type Handling", () => {
		const pipeline = createExtractionPipeline({
			extractionClient: mockExtractionClient,
			dryRun: true,
		});

		it("should handle news source type", async () => {
			const event = await pipeline.processContent("Breaking news about tech stocks.", "news");
			const eventValue = requireValue(event, "Expected event to be returned");
			expect(eventValue.sourceType).toBe("news");
		});

		it("should handle transcript source type", async () => {
			const event = await pipeline.processContent(
				"CEO: We are pleased with our quarterly results.",
				"transcript",
			);
			const eventValue = requireValue(event, "Expected event to be returned");
			expect(eventValue.sourceType).toBe("transcript");
		});

		it("should handle macro source type", async () => {
			const event = await pipeline.processContent(
				"Federal Reserve raised interest rates by 25 basis points.",
				"macro",
			);
			const eventValue = requireValue(event, "Expected event to be returned");
			expect(eventValue.sourceType).toBe("macro");
		});

		it("should handle press_release source type", async () => {
			const event = await pipeline.processContent(
				"FOR IMMEDIATE RELEASE: Company announces quarterly dividend.",
				"press_release",
			);
			const eventValue = requireValue(event, "Expected event to be returned");
			expect(eventValue.sourceType).toBe("press_release");
		});
	});
});
