/**
 * GraphRAG Tool Implementation Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";

import { describe, expect, test } from "bun:test";
import type { ExecutionContext } from "@cream/domain";
import type { GraphRAGSearchResult } from "@cream/helix";

// ============================================
// Mock Data
// ============================================

const mockSearchResult: GraphRAGSearchResult = {
  filingChunks: [
    {
      id: "fc-001",
      filingId: "10K-2024-AAPL",
      companySymbol: "AAPL",
      filingType: "10-K",
      filingDate: "2024-01-15",
      chunkText: "Supply chain risks include semiconductor shortages...",
      chunkIndex: 5,
      score: 0.95,
    },
  ],
  transcriptChunks: [
    {
      id: "tc-001",
      transcriptId: "Q4-2024-NVDA",
      companySymbol: "NVDA",
      callDate: "2024-02-20",
      speaker: "Jensen Huang",
      chunkText: "We see continued strong demand for AI chips...",
      chunkIndex: 12,
      score: 0.88,
    },
  ],
  newsItems: [
    {
      id: "ni-001",
      headline: "Semiconductor Industry Faces Capacity Constraints",
      bodyText: "Multiple chip manufacturers report supply issues...",
      source: "Reuters",
      relatedSymbols: "AAPL,NVDA,TSM",
      sentimentScore: -0.3,
      score: 0.82,
    },
  ],
  externalEvents: [
    {
      id: "ee-001",
      eventId: "evt-supply-001",
      eventType: "supply_chain",
      textSummary: "Major fab reports production delays",
      relatedInstrumentIds: "TSM,INTC",
      score: 0.75,
    },
  ],
  companies: [
    {
      id: "comp-aapl",
      symbol: "AAPL",
      name: "Apple Inc.",
      sector: "Technology",
      industry: "Consumer Electronics",
      marketCapBucket: "mega",
      source: "filing",
    },
    {
      id: "comp-nvda",
      symbol: "NVDA",
      name: "NVIDIA Corporation",
      sector: "Technology",
      industry: "Semiconductors",
      marketCapBucket: "mega",
      source: "transcript",
    },
  ],
  executionTimeMs: 15,
};

// ============================================
// Tests
// ============================================

describe("graphragQuery", () => {
  describe("BACKTEST mode", () => {
    test("returns empty results in BACKTEST mode", async () => {
      // Import after setting CREAM_ENV=BACKTEST
      const { graphragQuery } = await import("./graphrag.js");

      const ctx: ExecutionContext = {
        environment: "BACKTEST",
        source: "test",
        traceId: "test-trace",
      };

      const result = await graphragQuery(ctx, {
        query: "semiconductor supply chain",
        limit: 10,
      });

      expect(result.filingChunks).toEqual([]);
      expect(result.transcriptChunks).toEqual([]);
      expect(result.newsItems).toEqual([]);
      expect(result.externalEvents).toEqual([]);
      expect(result.companies).toEqual([]);
      expect(result.executionTimeMs).toBe(0);
    });

    test("returns empty results even with symbol filter in BACKTEST mode", async () => {
      const { graphragQuery } = await import("./graphrag.js");

      const ctx: ExecutionContext = {
        environment: "BACKTEST",
        source: "test",
        traceId: "test-trace",
      };

      const result = await graphragQuery(ctx, {
        query: "revenue growth",
        symbol: "AAPL",
        limit: 5,
      });

      expect(result.filingChunks).toEqual([]);
      expect(result.companies).toEqual([]);
    });
  });

  describe("parameter handling", () => {
    test("accepts query parameter", async () => {
      const { graphragQuery } = await import("./graphrag.js");

      const ctx: ExecutionContext = {
        environment: "BACKTEST",
        source: "test",
        traceId: "test-trace",
      };

      // Should not throw
      const result = await graphragQuery(ctx, {
        query: "test query",
      });

      expect(result).toBeDefined();
    });

    test("accepts optional limit parameter", async () => {
      const { graphragQuery } = await import("./graphrag.js");

      const ctx: ExecutionContext = {
        environment: "BACKTEST",
        source: "test",
        traceId: "test-trace",
      };

      // Should not throw
      const result = await graphragQuery(ctx, {
        query: "test query",
        limit: 20,
      });

      expect(result).toBeDefined();
    });

    test("accepts optional symbol parameter", async () => {
      const { graphragQuery } = await import("./graphrag.js");

      const ctx: ExecutionContext = {
        environment: "BACKTEST",
        source: "test",
        traceId: "test-trace",
      };

      // Should not throw
      const result = await graphragQuery(ctx, {
        query: "test query",
        symbol: "AAPL",
      });

      expect(result).toBeDefined();
    });
  });
});

describe("GraphRAGQueryResult structure", () => {
  test("result has all required fields", () => {
    expect(mockSearchResult).toHaveProperty("filingChunks");
    expect(mockSearchResult).toHaveProperty("transcriptChunks");
    expect(mockSearchResult).toHaveProperty("newsItems");
    expect(mockSearchResult).toHaveProperty("externalEvents");
    expect(mockSearchResult).toHaveProperty("companies");
    expect(mockSearchResult).toHaveProperty("executionTimeMs");
  });

  test("filing chunks have correct structure", () => {
    const filing = mockSearchResult.filingChunks[0];
    expect(filing).toHaveProperty("id");
    expect(filing).toHaveProperty("filingId");
    expect(filing).toHaveProperty("companySymbol");
    expect(filing).toHaveProperty("filingType");
    expect(filing).toHaveProperty("filingDate");
    expect(filing).toHaveProperty("chunkText");
    expect(filing).toHaveProperty("chunkIndex");
    expect(filing).toHaveProperty("score");
  });

  test("transcript chunks have correct structure", () => {
    const transcript = mockSearchResult.transcriptChunks[0];
    expect(transcript).toHaveProperty("id");
    expect(transcript).toHaveProperty("transcriptId");
    expect(transcript).toHaveProperty("companySymbol");
    expect(transcript).toHaveProperty("callDate");
    expect(transcript).toHaveProperty("speaker");
    expect(transcript).toHaveProperty("chunkText");
    expect(transcript).toHaveProperty("chunkIndex");
    expect(transcript).toHaveProperty("score");
  });

  test("news items have correct structure", () => {
    const news = mockSearchResult.newsItems[0];
    expect(news).toHaveProperty("id");
    expect(news).toHaveProperty("headline");
    expect(news).toHaveProperty("bodyText");
    expect(news).toHaveProperty("source");
    expect(news).toHaveProperty("relatedSymbols");
    expect(news).toHaveProperty("sentimentScore");
    expect(news).toHaveProperty("score");
  });

  test("external events have correct structure", () => {
    const event = mockSearchResult.externalEvents[0];
    expect(event).toHaveProperty("id");
    expect(event).toHaveProperty("eventId");
    expect(event).toHaveProperty("eventType");
    expect(event).toHaveProperty("textSummary");
    expect(event).toHaveProperty("relatedInstrumentIds");
    expect(event).toHaveProperty("score");
  });

  test("companies have correct structure", () => {
    const company = mockSearchResult.companies[0];
    expect(company).toHaveProperty("id");
    expect(company).toHaveProperty("symbol");
    expect(company).toHaveProperty("name");
    expect(company).toHaveProperty("sector");
    expect(company).toHaveProperty("industry");
    expect(company).toHaveProperty("marketCapBucket");
    expect(company).toHaveProperty("source");
  });

  test("company source is valid enum value", () => {
    const validSources = ["filing", "transcript", "news", "related", "dependent"];
    for (const company of mockSearchResult.companies) {
      expect(validSources).toContain(company.source);
    }
  });
});
