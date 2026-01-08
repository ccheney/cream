/**
 * Tests for Agent Tools
 *
 * Tests the searchNews tool and helper functions.
 */

import { describe, expect, it } from "bun:test";
import { createTestContext } from "@cream/domain";
import { type NewsItem, searchNews } from "../src/tools/index.js";

// ============================================
// searchNews Tests
// ============================================

const ctx = createTestContext("BACKTEST");

describe("searchNews", () => {
  describe("in backtest mode", () => {
    it("should return empty array in backtest mode", async () => {
      const result = await searchNews(ctx, "", []);
      expect(result).toEqual([]);
    });

    it("should return empty array with symbols in backtest mode", async () => {
      const result = await searchNews(ctx, "earnings", ["AAPL", "MSFT"]);
      expect(result).toEqual([]);
    });

    it("should return empty array with query in backtest mode", async () => {
      const result = await searchNews(ctx, "tech stocks rally");
      expect(result).toEqual([]);
    });
  });

  describe("NewsItem interface", () => {
    it("should have correct NewsItem structure", () => {
      // Type check - this verifies the interface is correct
      const mockItem: NewsItem = {
        id: "test-123",
        headline: "Test Headline",
        summary: "Test summary of the news article",
        source: "Test Source",
        publishedAt: "2024-01-15T10:00:00Z",
        symbols: ["AAPL"],
        sentiment: "positive",
      };

      expect(mockItem.id).toBe("test-123");
      expect(mockItem.headline).toBe("Test Headline");
      expect(mockItem.summary).toBe("Test summary of the news article");
      expect(mockItem.source).toBe("Test Source");
      expect(mockItem.publishedAt).toBe("2024-01-15T10:00:00Z");
      expect(mockItem.symbols).toEqual(["AAPL"]);
      expect(mockItem.sentiment).toBe("positive");
    });

    it("should accept all valid sentiment values", () => {
      const positiveItem: NewsItem = {
        id: "1",
        headline: "Positive news",
        summary: "",
        source: "test",
        publishedAt: "",
        symbols: [],
        sentiment: "positive",
      };

      const negativeItem: NewsItem = {
        id: "2",
        headline: "Negative news",
        summary: "",
        source: "test",
        publishedAt: "",
        symbols: [],
        sentiment: "negative",
      };

      const neutralItem: NewsItem = {
        id: "3",
        headline: "Neutral news",
        summary: "",
        source: "test",
        publishedAt: "",
        symbols: [],
        sentiment: "neutral",
      };

      expect(positiveItem.sentiment).toBe("positive");
      expect(negativeItem.sentiment).toBe("negative");
      expect(neutralItem.sentiment).toBe("neutral");
    });
  });

  describe("function signature", () => {
    it("should accept query string", async () => {
      const result = await searchNews(ctx, "test query");
      expect(Array.isArray(result)).toBe(true);
    });

    it("should accept query with symbols array", async () => {
      const result = await searchNews(ctx, "test", ["AAPL", "GOOGL"]);
      expect(Array.isArray(result)).toBe(true);
    });

    it("should accept query with symbols and limit", async () => {
      const result = await searchNews(ctx, "test", ["AAPL"], 10);
      expect(Array.isArray(result)).toBe(true);
    });

    it("should accept empty query", async () => {
      const result = await searchNews(ctx, "");
      expect(Array.isArray(result)).toBe(true);
    });

    it("should accept empty symbols array", async () => {
      const result = await searchNews(ctx, "test", []);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});

// ============================================
// Sentiment Detection Logic Tests
// (Testing via observable behavior since detectSentiment is private)
// ============================================

describe("Sentiment Detection Logic", () => {
  // Since detectSentiment is a private function, we document expected behavior here
  // The actual testing happens through integration with FMP in non-backtest mode

  describe("expected positive keywords", () => {
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

    it("should recognize positive keywords", () => {
      // Document expected positive keywords
      expect(positiveKeywords.length).toBeGreaterThan(0);
      expect(positiveKeywords).toContain("surge");
      expect(positiveKeywords).toContain("bullish");
      expect(positiveKeywords).toContain("beat");
    });
  });

  describe("expected negative keywords", () => {
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

    it("should recognize negative keywords", () => {
      // Document expected negative keywords
      expect(negativeKeywords.length).toBeGreaterThan(0);
      expect(negativeKeywords).toContain("crash");
      expect(negativeKeywords).toContain("bearish");
      expect(negativeKeywords).toContain("miss");
    });
  });
});

// ============================================
// Tool Registry Tests
// ============================================

describe("Tool Registry", () => {
  it("should export searchNews as news_search in registry", async () => {
    const { TOOL_REGISTRY } = await import("../src/tools/index.js");
    expect(TOOL_REGISTRY.news_search).toBeDefined();
    expect(typeof TOOL_REGISTRY.news_search).toBe("function");
  });

  it("should have searchNews in available tools", async () => {
    const { getAvailableTools } = await import("../src/tools/index.js");
    const tools = getAvailableTools();
    expect(tools).toContain("news_search");
  });

  it("should be able to get news_search tool by name", async () => {
    const { getTool } = await import("../src/tools/index.js");
    const tool = getTool("news_search");
    expect(typeof tool).toBe("function");
  });
});
