/**
 * Pipeline Tests
 */

import { describe, expect, it } from "bun:test";
import type { FMPNewsArticle } from "../src/index.js";
import { createExtractionPipeline, ExtractionPipeline } from "../src/index.js";

describe("ExtractionPipeline", () => {
  describe("Dry Run Mode", () => {
    const pipeline = createExtractionPipeline({ dryRun: true });

    it("should process content in dry run mode", async () => {
      const event = await pipeline.processContent(
        "Apple reported record earnings today, beating analyst expectations with revenue of $120 billion.",
        "news",
        new Date(),
        "reuters.com",
        ["AAPL"]
      );

      expect(event).not.toBeNull();
      expect(event!.eventId).toBeDefined();
      expect(event!.sourceType).toBe("news");
      expect(event!.scores).toBeDefined();
      expect(event!.scores.sentimentScore).toBeDefined();
      expect(event!.scores.importanceScore).toBeDefined();
      expect(event!.scores.surpriseScore).toBeDefined();
    });

    it("should process news articles", async () => {
      const articles: FMPNewsArticle[] = [
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
        ["TSLA"]
      );

      expect(event!.relatedInstrumentIds).toContain("TSLA");
    });

    it("should include processing timestamp", async () => {
      const before = new Date();
      const event = await pipeline.processContent("Test content for pipeline processing.", "news");
      const after = new Date();

      expect(event!.processedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(event!.processedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("Pipeline Configuration", () => {
    it("should create pipeline with target symbols", () => {
      const pipeline = createExtractionPipeline({
        targetSymbols: ["AAPL", "MSFT", "GOOGL"],
        dryRun: true,
      });

      expect(pipeline).toBeInstanceOf(ExtractionPipeline);
    });

    it("should create pipeline with expectations", () => {
      const pipeline = createExtractionPipeline({
        expectations: [
          { metric: "revenue", expectedValue: 100 },
          { metric: "eps", expectedValue: 2.5 },
        ],
        dryRun: true,
      });

      expect(pipeline).toBeInstanceOf(ExtractionPipeline);
    });

    it("should expose extraction client", () => {
      const pipeline = createExtractionPipeline({ dryRun: true });
      const client = pipeline.getExtractionClient();
      expect(client).toBeDefined();
    });

    it("should expose entity linker", () => {
      const pipeline = createExtractionPipeline({ dryRun: true });
      const linker = pipeline.getEntityLinker();
      expect(linker).toBeDefined();
    });
  });

  describe("Pipeline Results", () => {
    const pipeline = createExtractionPipeline({ dryRun: true });

    it("should track processing stats", async () => {
      const articles: FMPNewsArticle[] = [
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

      expect(event1!.eventId).not.toBe(event2!.eventId);
    });
  });

  describe("Source Type Handling", () => {
    const pipeline = createExtractionPipeline({ dryRun: true });

    it("should handle news source type", async () => {
      const event = await pipeline.processContent("Breaking news about tech stocks.", "news");
      expect(event!.sourceType).toBe("news");
    });

    it("should handle transcript source type", async () => {
      const event = await pipeline.processContent(
        "CEO: We are pleased with our quarterly results.",
        "transcript"
      );
      expect(event!.sourceType).toBe("transcript");
    });

    it("should handle macro source type", async () => {
      const event = await pipeline.processContent(
        "Federal Reserve raised interest rates by 25 basis points.",
        "macro"
      );
      expect(event!.sourceType).toBe("macro");
    });

    it("should handle press_release source type", async () => {
      const event = await pipeline.processContent(
        "FOR IMMEDIATE RELEASE: Company announces quarterly dividend.",
        "press_release"
      );
      expect(event!.sourceType).toBe("press_release");
    });
  });
});
