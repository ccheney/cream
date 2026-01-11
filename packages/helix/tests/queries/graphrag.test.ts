/**
 * GraphRAG Query Tests
 *
 * Tests for the unified GraphRAG search functionality.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import type { HelixClient, QueryResult } from "../../src/client.js";
import {
  type CompanyResult,
  searchGraphContext,
  searchGraphContextByCompany,
} from "../../src/queries/graphrag.js";

// ============================================
// Mock Data
// ============================================

const mockSearchGraphContextResponse = {
  filing_chunks: [
    {
      id: "fc-001",
      label: "FilingChunk",
      data: [0.1, 0.2],
      score: 0.95,
      filing_id: { String: "10K-2024-AAPL" },
      company_symbol: { String: "AAPL" },
      filing_type: { String: "10-K" },
      filing_date: { String: "2024-01-15" },
      chunk_text: { String: "Supply chain risks include semiconductor shortages..." },
      chunk_index: { U32: 5 },
    },
  ],
  transcript_chunks: [
    {
      id: "tc-001",
      label: "TranscriptChunk",
      data: [0.3, 0.4],
      score: 0.88,
      transcript_id: { String: "Q4-2024-NVDA" },
      company_symbol: { String: "NVDA" },
      call_date: { String: "2024-02-20" },
      speaker: { String: "Jensen Huang" },
      chunk_text: { String: "We see continued strong demand for AI chips..." },
      chunk_index: { U32: 12 },
    },
  ],
  news_items: [
    {
      id: "ni-001",
      label: "NewsItem",
      data: [0.5, 0.6],
      score: 0.82,
      headline: { String: "Semiconductor Industry Faces Capacity Constraints" },
      body_text: { String: "Multiple chip manufacturers report supply issues..." },
      source: { String: "Reuters" },
      related_symbols: { String: "AAPL,NVDA,TSM" },
      sentiment_score: { F64: -0.3 },
    },
  ],
  external_events: [
    {
      id: "ee-001",
      label: "ExternalEvent",
      data: [0.7, 0.8],
      score: 0.75,
      event_id: { String: "evt-supply-001" },
      event_type: { String: "supply_chain" },
      text_summary: { String: "Major fab reports production delays" },
      related_instrument_ids: { String: "TSM,INTC" },
    },
  ],
  filing_companies: [
    {
      id: "comp-aapl",
      label: "Company",
      symbol: { String: "AAPL" },
      name: { String: "Apple Inc." },
      sector: { String: "Technology" },
      industry: { String: "Consumer Electronics" },
      market_cap_bucket: { String: "mega" },
    },
  ],
  transcript_companies: [
    {
      id: "comp-nvda",
      label: "Company",
      symbol: { String: "NVDA" },
      name: { String: "NVIDIA Corporation" },
      sector: { String: "Technology" },
      industry: { String: "Semiconductors" },
      market_cap_bucket: { String: "mega" },
    },
  ],
  news_companies: [
    {
      id: "comp-tsm",
      label: "Company",
      symbol: { String: "TSM" },
      name: { String: "Taiwan Semiconductor" },
      sector: { String: "Technology" },
      industry: { String: "Semiconductors" },
      market_cap_bucket: { String: "mega" },
    },
    // Duplicate AAPL to test deduplication
    {
      id: "comp-aapl-dup",
      label: "Company",
      symbol: { String: "AAPL" },
      name: { String: "Apple Inc." },
      sector: { String: "Technology" },
      industry: { String: "Consumer Electronics" },
      market_cap_bucket: { String: "mega" },
    },
  ],
};

const mockSearchByCompanyResponse = {
  filing_chunks: [
    {
      id: "fc-002",
      label: "FilingChunk",
      data: [0.1, 0.2],
      score: 0.92,
      filing_id: { String: "10K-2024-AAPL" },
      company_symbol: { String: "AAPL" },
      filing_type: { String: "10-K" },
      filing_date: { String: "2024-01-15" },
      chunk_text: { String: "iPhone revenue increased 15% year-over-year..." },
      chunk_index: { U32: 8 },
    },
  ],
  transcript_chunks: [],
  news_items: [
    {
      id: "ni-002",
      label: "NewsItem",
      data: [0.5, 0.6],
      score: 0.85,
      headline: { String: "Apple Reports Strong Q4 Results" },
      body_text: { String: "Apple exceeds analyst expectations..." },
      source: { String: "Bloomberg" },
      related_symbols: { String: "AAPL" },
      sentiment_score: { F64: 0.7 },
    },
  ],
  company: [
    {
      id: "comp-aapl",
      label: "Company",
      symbol: { String: "AAPL" },
      name: { String: "Apple Inc." },
      sector: { String: "Technology" },
      industry: { String: "Consumer Electronics" },
      market_cap_bucket: { String: "mega" },
    },
  ],
  news_companies: [],
  related_companies: [
    {
      id: "comp-msft",
      label: "Company",
      symbol: { String: "MSFT" },
      name: { String: "Microsoft Corporation" },
      sector: { String: "Technology" },
      industry: { String: "Software" },
      market_cap_bucket: { String: "mega" },
    },
  ],
  dependent_companies: [
    {
      id: "comp-foxconn",
      label: "Company",
      symbol: { String: "2317.TW" },
      name: { String: "Hon Hai Precision" },
      sector: { String: "Technology" },
      industry: { String: "Electronic Manufacturing" },
      market_cap_bucket: { String: "large" },
    },
  ],
};

// ============================================
// Mock Client
// ============================================

function createMockClient(responseOverrides: Record<string, unknown> = {}): HelixClient {
  return {
    query: async <T = unknown>(
      queryName: string,
      _params?: Record<string, unknown>
    ): Promise<QueryResult<T>> => {
      if (queryName === "SearchGraphContext") {
        return {
          data: { ...mockSearchGraphContextResponse, ...responseOverrides } as T,
          executionTimeMs: 15,
        };
      }
      if (queryName === "SearchGraphContextByCompany") {
        return {
          data: { ...mockSearchByCompanyResponse, ...responseOverrides } as T,
          executionTimeMs: 12,
        };
      }
      return { data: {} as T, executionTimeMs: 1 };
    },
    isConnected: () => true,
    healthCheck: async () => ({ healthy: true, latencyMs: 1 }),
    close: () => {},
    getConfig: () => ({
      host: "localhost",
      port: 6969,
      timeout: 5000,
      maxRetries: 3,
      retryDelay: 100,
    }),
  };
}

// ============================================
// Tests
// ============================================

describe("searchGraphContext", () => {
  let client: HelixClient;

  beforeEach(() => {
    client = createMockClient();
  });

  describe("unified search (no symbol filter)", () => {
    it("returns results from multiple types", async () => {
      const result = await searchGraphContext(client, {
        query: "semiconductor supply chain",
        limit: 10,
      });

      expect(result.filingChunks.length).toBe(1);
      expect(result.transcriptChunks.length).toBe(1);
      expect(result.newsItems.length).toBe(1);
      expect(result.externalEvents.length).toBe(1);
    });

    it("transforms filing chunks correctly", async () => {
      const result = await searchGraphContext(client, {
        query: "test",
      });

      const filing = result.filingChunks[0];
      expect(filing).toBeDefined();
      expect(filing?.id).toBe("fc-001");
      expect(filing?.filingId).toBe("10K-2024-AAPL");
      expect(filing?.companySymbol).toBe("AAPL");
      expect(filing?.filingType).toBe("10-K");
      expect(filing?.filingDate).toBe("2024-01-15");
      expect(filing?.chunkIndex).toBe(5);
      expect(filing?.score).toBe(0.95);
    });

    it("transforms transcript chunks correctly", async () => {
      const result = await searchGraphContext(client, {
        query: "test",
      });

      const transcript = result.transcriptChunks[0];
      expect(transcript).toBeDefined();
      expect(transcript?.id).toBe("tc-001");
      expect(transcript?.transcriptId).toBe("Q4-2024-NVDA");
      expect(transcript?.companySymbol).toBe("NVDA");
      expect(transcript?.speaker).toBe("Jensen Huang");
      expect(transcript?.score).toBe(0.88);
    });

    it("transforms news items correctly", async () => {
      const result = await searchGraphContext(client, {
        query: "test",
      });

      const news = result.newsItems[0];
      expect(news).toBeDefined();
      expect(news?.id).toBe("ni-001");
      expect(news?.headline).toBe("Semiconductor Industry Faces Capacity Constraints");
      expect(news?.source).toBe("Reuters");
      expect(news?.sentimentScore).toBe(-0.3);
      expect(news?.score).toBe(0.82);
    });

    it("transforms external events correctly", async () => {
      const result = await searchGraphContext(client, {
        query: "test",
      });

      const event = result.externalEvents[0];
      expect(event).toBeDefined();
      expect(event?.id).toBe("ee-001");
      expect(event?.eventId).toBe("evt-supply-001");
      expect(event?.eventType).toBe("supply_chain");
      expect(event?.score).toBe(0.75);
    });

    it("deduplicates company nodes", async () => {
      const result = await searchGraphContext(client, {
        query: "test",
      });

      // Should have 3 unique companies (AAPL appears twice in mock data)
      expect(result.companies.length).toBe(3);

      const symbols = result.companies.map((c) => c.symbol);
      expect(symbols).toContain("AAPL");
      expect(symbols).toContain("NVDA");
      expect(symbols).toContain("TSM");
    });

    it("assigns correct source to companies", async () => {
      const result = await searchGraphContext(client, {
        query: "test",
      });

      const aapl = result.companies.find((c) => c.symbol === "AAPL");
      const nvda = result.companies.find((c) => c.symbol === "NVDA");
      const tsm = result.companies.find((c) => c.symbol === "TSM");

      expect(aapl?.source).toBe("filing");
      expect(nvda?.source).toBe("transcript");
      expect(tsm?.source).toBe("news");
    });

    it("includes execution time", async () => {
      const result = await searchGraphContext(client, {
        query: "test",
      });

      expect(result.executionTimeMs).toBeGreaterThan(0);
    });
  });

  describe("company-filtered search", () => {
    it("uses SearchGraphContextByCompany when symbol provided", async () => {
      const result = await searchGraphContext(client, {
        query: "revenue growth",
        symbol: "AAPL",
        limit: 10,
      });

      // Results should come from company-specific mock
      expect(result.filingChunks.length).toBe(1);
      expect(result.filingChunks[0]?.chunkText).toContain("iPhone revenue");
    });

    it("includes related and dependent companies", async () => {
      const result = await searchGraphContext(client, {
        query: "test",
        symbol: "AAPL",
      });

      const sources = result.companies.map((c) => c.source);
      expect(sources).toContain("related");
      expect(sources).toContain("dependent");
    });

    it("does not include external events for company search", async () => {
      const result = await searchGraphContext(client, {
        query: "test",
        symbol: "AAPL",
      });

      expect(result.externalEvents.length).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("handles empty results gracefully", async () => {
      const emptyClient = createMockClient({
        filing_chunks: [],
        transcript_chunks: [],
        news_items: [],
        external_events: [],
        filing_companies: [],
        transcript_companies: [],
        news_companies: [],
      });

      const result = await searchGraphContext(emptyClient, {
        query: "nonexistent topic",
      });

      expect(result.filingChunks).toEqual([]);
      expect(result.transcriptChunks).toEqual([]);
      expect(result.newsItems).toEqual([]);
      expect(result.externalEvents).toEqual([]);
      expect(result.companies).toEqual([]);
    });

    it("handles null property values", async () => {
      const nullClient = createMockClient({
        filing_chunks: [
          {
            id: "fc-null",
            label: "FilingChunk",
            data: [0.1],
            score: 0.5,
            filing_id: null,
            company_symbol: null,
            filing_type: null,
            filing_date: null,
            chunk_text: null,
            chunk_index: null,
          },
        ],
        transcript_chunks: [],
        news_items: [],
        external_events: [],
        filing_companies: [],
        transcript_companies: [],
        news_companies: [],
      });

      const result = await searchGraphContext(nullClient, {
        query: "test",
      });

      const filing = result.filingChunks[0];
      expect(filing).toBeDefined();
      expect(filing?.filingId).toBe("");
      expect(filing?.companySymbol).toBe("");
      expect(filing?.chunkIndex).toBe(0);
    });

    it("uses default limit of 10", async () => {
      let capturedLimit: number | undefined;
      const trackingClient: HelixClient = {
        ...createMockClient(),
        query: async <T = unknown>(
          _queryName: string,
          params?: Record<string, unknown>
        ): Promise<QueryResult<T>> => {
          capturedLimit = params?.limit as number;
          return {
            data: mockSearchGraphContextResponse as T,
            executionTimeMs: 1,
          };
        },
      };

      await searchGraphContext(trackingClient, {
        query: "test",
      });

      expect(capturedLimit).toBe(10);
    });
  });
});

describe("searchGraphContextByCompany", () => {
  let client: HelixClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it("delegates to searchGraphContext with symbol", async () => {
    const result = await searchGraphContextByCompany(client, "AAPL", "revenue", 5);

    expect(result.filingChunks.length).toBeGreaterThanOrEqual(0);
    expect(result.companies.some((c: CompanyResult) => c.symbol === "AAPL")).toBe(true);
  });

  it("uses default limit of 10", async () => {
    let capturedLimit: number | undefined;
    const trackingClient: HelixClient = {
      ...createMockClient(),
      query: async <T = unknown>(
        _queryName: string,
        params?: Record<string, unknown>
      ): Promise<QueryResult<T>> => {
        capturedLimit = params?.limit as number;
        return {
          data: mockSearchByCompanyResponse as T,
          executionTimeMs: 1,
        };
      },
    };

    await searchGraphContextByCompany(trackingClient, "AAPL", "test");

    expect(capturedLimit).toBe(10);
  });
});
