/**
 * Web Search Integration Tests
 *
 * Tests for the main webSearch and batchSearch functions,
 * including schema validation, API integration, and error handling.
 */

process.env.CREAM_ENV = "PAPER";
process.env.TAVILY_API_KEY = "test-api-key";

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as domain from "@cream/domain";
import { createTestContext } from "@cream/domain";
import {
  batchSearch,
  clearWebSearchCache,
  metricsCollector,
  rateLimiter,
  resetTavilyClient,
  WebSearchParamsSchema,
  webSearch,
} from "./index.js";

const paperCtx = createTestContext("PAPER");

function createMockFetch<T extends (...args: Parameters<typeof fetch>) => Promise<Response>>(
  implementation: T
): typeof fetch {
  const mockFn = mock(implementation);
  const typedMock = mockFn as unknown as typeof fetch;
  (typedMock as typeof fetch & { preconnect: () => void }).preconnect = () => {};
  return typedMock;
}

describe("WebSearchParamsSchema", () => {
  test("parses minimal params", () => {
    const result = WebSearchParamsSchema.safeParse({ query: "test" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe("test");
      expect(result.data.maxAgeHours).toBe(24);
      expect(result.data.sources).toEqual(["all"]);
      expect(result.data.topic).toBe("general");
      expect(result.data.maxResults).toBe(10);
    }
  });

  test("parses full params", () => {
    const result = WebSearchParamsSchema.safeParse({
      query: "market news",
      maxAgeHours: 48,
      sources: ["news", "financial"],
      topic: "finance",
      maxResults: 15,
      symbols: ["AAPL", "MSFT"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxAgeHours).toBe(48);
      expect(result.data.sources).toEqual(["news", "financial"]);
      expect(result.data.topic).toBe("finance");
      expect(result.data.maxResults).toBe(15);
      expect(result.data.symbols).toEqual(["AAPL", "MSFT"]);
    }
  });

  test("rejects empty query", () => {
    const result = WebSearchParamsSchema.safeParse({ query: "" });
    expect(result.success).toBe(false);
  });

  test("clamps maxAgeHours to 168", () => {
    const result = WebSearchParamsSchema.safeParse({
      query: "test",
      maxAgeHours: 200,
    });
    expect(result.success).toBe(false);
  });

  test("clamps maxResults to 20", () => {
    const result = WebSearchParamsSchema.safeParse({
      query: "test",
      maxResults: 50,
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid topic", () => {
    const result = WebSearchParamsSchema.safeParse({
      query: "test",
      topic: "invalid",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid source", () => {
    const result = WebSearchParamsSchema.safeParse({
      query: "test",
      sources: ["invalid"],
    });
    expect(result.success).toBe(false);
  });
});

describe("webSearch in backtest mode", () => {
  test("returns empty results in backtest mode", async () => {
    const isBacktestSpy = spyOn(domain, "isBacktest").mockReturnValue(true);

    try {
      const result = await webSearch(paperCtx, { query: "test query" });

      expect(result.results).toHaveLength(0);
      expect(result.metadata.query).toBe("test query");
      expect(result.metadata.provider).toBe("tavily");
      expect(result.metadata.resultsFiltered).toBe(0);
      expect(result.metadata.executionTimeMs).toBeGreaterThanOrEqual(0);
    } finally {
      isBacktestSpy.mockRestore();
    }
  });
});

describe("webSearch without API key", () => {
  const originalApiKey = process.env.TAVILY_API_KEY;
  let isBacktestSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    isBacktestSpy = spyOn(domain, "isBacktest").mockReturnValue(false);
    delete process.env.TAVILY_API_KEY;
    resetTavilyClient();
  });

  afterEach(() => {
    isBacktestSpy.mockRestore();
    if (originalApiKey) {
      process.env.TAVILY_API_KEY = originalApiKey;
    }
    resetTavilyClient();
  });

  test("returns empty results without API key", async () => {
    const result = await webSearch(paperCtx, { query: "test query" });

    expect(result.results).toHaveLength(0);
    expect(result.metadata.query).toBe("test query");
  });
});

describe("webSearch with mocked API", () => {
  const originalApiKey = process.env.TAVILY_API_KEY;
  const originalFetch = globalThis.fetch;
  let isBacktestSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    isBacktestSpy = spyOn(domain, "isBacktest").mockReturnValue(false);
    process.env.TAVILY_API_KEY = "test-api-key";
    clearWebSearchCache();
  });

  afterEach(() => {
    isBacktestSpy.mockRestore();
    if (originalApiKey) {
      process.env.TAVILY_API_KEY = originalApiKey;
    } else {
      delete process.env.TAVILY_API_KEY;
    }
    globalThis.fetch = originalFetch;
    resetTavilyClient();
    clearWebSearchCache();
  });

  test("returns normalized results from API", async () => {
    const now = new Date();
    const mockResponse = {
      query: "test query",
      results: [
        {
          title: "Test Result 1",
          url: "https://www.example.com/article1",
          content: "This is the first test result snippet",
          score: 0.95,
          published_date: now.toISOString(),
          raw_content: "Full content here",
        },
        {
          title: "Test Result 2",
          url: "https://news.example.com/article2",
          content: "This is the second test result snippet",
          score: 0.85,
          published_date: now.toISOString(),
        },
      ],
      response_time: 1.2,
    };

    globalThis.fetch = createMockFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    resetTavilyClient();

    const result = await webSearch(paperCtx, { query: "test query" });

    expect(result.results).toHaveLength(2);
    expect(result.results[0]?.title).toBe("Test Result 1");
    expect(result.results[0]?.source).toBe("example.com");
    expect(result.results[0]?.snippet).toBe("This is the first test result snippet");
    expect(result.results[0]?.relevanceScore).toBe(0.95);
    expect(result.results[0]?.rawContent).toBe("Full content here");

    expect(result.results[1]?.title).toBe("Test Result 2");
    expect(result.results[1]?.source).toBe("news.example.com");
    expect(result.results[1]?.rawContent).toBeUndefined();

    expect(result.metadata.provider).toBe("tavily");
    expect(result.metadata.query).toBe("test query");
  });

  test("filters results older than maxAgeHours", async () => {
    const now = new Date();
    const oldDate = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48 hours ago

    const mockResponse = {
      query: "test query",
      results: [
        {
          title: "Recent Result",
          url: "https://example.com/recent",
          content: "Recent content",
          score: 0.9,
          published_date: now.toISOString(),
        },
        {
          title: "Old Result",
          url: "https://example.com/old",
          content: "Old content",
          score: 0.8,
          published_date: oldDate.toISOString(),
        },
      ],
      response_time: 1.0,
    };

    globalThis.fetch = createMockFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    resetTavilyClient();

    const result = await webSearch(paperCtx, { query: "test query", maxAgeHours: 24 });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.title).toBe("Recent Result");
    expect(result.metadata.resultsFiltered).toBe(1);
  });

  test("respects maxResults limit", async () => {
    const now = new Date();
    const mockResponse = {
      query: "test query",
      results: Array.from({ length: 10 }, (_, i) => ({
        title: `Result ${i + 1}`,
        url: `https://example.com/article${i}`,
        content: `Content ${i + 1}`,
        score: 0.9 - i * 0.05,
        published_date: now.toISOString(),
      })),
      response_time: 1.0,
    };

    globalThis.fetch = createMockFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    resetTavilyClient();

    const result = await webSearch(paperCtx, { query: "test query", maxResults: 5 });

    expect(result.results).toHaveLength(5);
    expect(result.results[0]?.title).toBe("Result 1");
    expect(result.results[4]?.title).toBe("Result 5");
  });

  test("handles API errors gracefully", async () => {
    globalThis.fetch = createMockFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          statusText: "Too Many Requests",
        })
      )
    );
    resetTavilyClient();

    const result = await webSearch(paperCtx, { query: "test query" });

    expect(result.results).toHaveLength(0);
    expect(result.metadata.query).toBe("test query");
  });

  test("handles network errors gracefully", async () => {
    globalThis.fetch = createMockFetch(() => Promise.reject(new Error("Network error")));
    resetTavilyClient();

    const result = await webSearch(paperCtx, { query: "test query" });

    expect(result.results).toHaveLength(0);
    expect(result.metadata.query).toBe("test query");
  });

  test("handles invalid params gracefully", async () => {
    const result = await webSearch(paperCtx, { query: "" });

    expect(result.results).toHaveLength(0);
  });
});

describe("batchSearch", () => {
  let originalFetch: typeof globalThis.fetch;
  let isBacktestSpy: ReturnType<typeof spyOn>;
  const now = new Date();

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    isBacktestSpy = spyOn(domain, "isBacktest").mockReturnValue(false);
    metricsCollector.reset();
    rateLimiter.reset();
    clearWebSearchCache();
    resetTavilyClient();

    globalThis.fetch = createMockFetch((_url, options) => {
      const body = options?.body ? JSON.parse(options.body as string) : {};
      const query = body.query || "";

      const symbol = query.includes("NVDA")
        ? "NVDA"
        : query.includes("AAPL")
          ? "AAPL"
          : query.includes("MSFT")
            ? "MSFT"
            : "UNKNOWN";

      return Promise.resolve(
        new Response(
          JSON.stringify({
            query,
            results: [
              {
                title: `${symbol} News Article`,
                url: `https://example.com/${symbol.toLowerCase()}-news`,
                content: `News about ${symbol}`,
                score: 0.9,
                published_date: now.toISOString(),
              },
            ],
            response_time: 1.0,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });
  });

  afterEach(() => {
    isBacktestSpy.mockRestore();
    globalThis.fetch = originalFetch;
    resetTavilyClient();
    clearWebSearchCache();
    rateLimiter.reset();
    metricsCollector.reset();
  });

  test("returns empty results for empty symbols array", async () => {
    const result = await batchSearch(paperCtx, {
      queryTemplate: "{SYMBOL} stock news",
      symbols: [],
    });

    expect(result.results).toEqual({});
    expect(result.metadata.symbolsSearched).toBe(0);
    expect(result.metadata.totalResults).toBe(0);
    expect(result.metadata.queriesExecuted).toBe(0);
  });

  test("searches single symbol correctly", async () => {
    const result = await batchSearch(paperCtx, {
      queryTemplate: "{SYMBOL} stock news",
      symbols: ["NVDA"],
    });

    expect(result.results.NVDA).toBeDefined();
    expect(result.results.NVDA!.length).toBeGreaterThan(0);
    expect(result.metadata.symbolsSearched).toBe(1);
    expect(result.metadata.totalResults).toBe(1);
  });

  test("searches multiple symbols with correct mapping", async () => {
    const result = await batchSearch(paperCtx, {
      queryTemplate: "{SYMBOL} stock sentiment",
      symbols: ["NVDA", "AAPL", "MSFT"],
    });

    expect(result.results.NVDA).toBeDefined();
    expect(result.results.AAPL).toBeDefined();
    expect(result.results.MSFT).toBeDefined();
    expect(result.metadata.symbolsSearched).toBe(3);
    expect(result.metadata.totalResults).toBe(3);
  });

  test("replaces all {SYMBOL} occurrences in template", async () => {
    let capturedQuery = "";
    globalThis.fetch = createMockFetch((_url, options) => {
      const body = options?.body ? JSON.parse(options.body as string) : {};
      capturedQuery = body.query || "";
      return Promise.resolve(
        new Response(
          JSON.stringify({
            query: capturedQuery,
            results: [],
            response_time: 1.0,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });
    resetTavilyClient();

    await batchSearch(paperCtx, {
      queryTemplate: "{SYMBOL} vs {SYMBOL} comparison",
      symbols: ["NVDA"],
    });

    expect(capturedQuery).toContain("NVDA vs NVDA comparison");
  });

  test("passes common params to each search", async () => {
    let capturedBody: Record<string, unknown> = {};
    globalThis.fetch = createMockFetch((_url, options) => {
      capturedBody = options?.body ? JSON.parse(options.body as string) : {};
      return Promise.resolve(
        new Response(
          JSON.stringify({
            query: capturedBody.query || "",
            results: [],
            response_time: 1.0,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });
    resetTavilyClient();

    await batchSearch(paperCtx, {
      queryTemplate: "{SYMBOL} news",
      symbols: ["NVDA"],
      commonParams: {
        topic: "finance",
        maxAgeHours: 48,
        maxResults: 5,
      },
    });

    expect(capturedBody.topic).toBe("finance");
    expect(capturedBody.time_range).toBe("week"); // 48 hours maps to week
  });

  test("counts cache hits separately from queries", async () => {
    globalThis.fetch = createMockFetch(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(
            new Response(
              JSON.stringify({
                query: "test",
                results: [
                  {
                    title: "Test",
                    url: "https://example.com",
                    content: "Test",
                    score: 0.9,
                    published_date: now.toISOString(),
                  },
                ],
                response_time: 1.0,
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }, 100); // 100ms delay to ensure > 50ms threshold
      });
    });
    resetTavilyClient();

    // First search - will be API calls (> 50ms)
    const result1 = await batchSearch(paperCtx, {
      queryTemplate: "{SYMBOL} sentiment",
      symbols: ["NVDA", "AAPL"],
    });

    // Queries were executed (not cached because > 50ms)
    expect(result1.metadata.queriesExecuted).toBe(2);

    // Clear rate limiter but keep cache
    rateLimiter.reset();

    // Second search - should be cache hits (< 50ms because from cache)
    const result2 = await batchSearch(paperCtx, {
      queryTemplate: "{SYMBOL} sentiment",
      symbols: ["NVDA", "AAPL"],
    });

    // Should have cache hits now
    expect(result2.metadata.cachedCount).toBe(2);
  });

  test("handles API errors gracefully without failing batch", async () => {
    globalThis.fetch = createMockFetch(() => {
      return Promise.reject(new Error("Network error"));
    });
    resetTavilyClient();
    clearWebSearchCache();

    const result = await batchSearch(paperCtx, {
      queryTemplate: "{SYMBOL} news",
      symbols: ["NVDA", "AAPL"],
    });

    expect(result.metadata.symbolsSearched).toBe(2);
    expect(result.results.NVDA).toBeDefined();
    expect(result.results.AAPL).toBeDefined();
    expect(result.metadata.totalResults).toBe(0);
  });

  test("returns results for successful searches even when some fail", async () => {
    const currentTime = new Date();

    globalThis.fetch = createMockFetch((_url, options) => {
      const body = options?.body ? JSON.parse(options.body as string) : {};
      const query = body.query || "";

      if (query.includes("AAPL") || query.includes("$AAPL")) {
        return Promise.reject(new Error("Network error for AAPL"));
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            query: "test",
            results: [
              {
                title: "Test",
                url: "https://example.com",
                content: "Test",
                score: 0.9,
                published_date: currentTime.toISOString(),
              },
            ],
            response_time: 1.0,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });
    resetTavilyClient();
    clearWebSearchCache();

    const result = await batchSearch(paperCtx, {
      queryTemplate: "{SYMBOL} news",
      symbols: ["NVDA", "AAPL", "MSFT"],
    });

    expect(result.metadata.symbolsSearched).toBe(3);
    expect(result.results.NVDA?.length).toBe(1);
    expect(result.results.AAPL?.length).toBe(0); // Failed
    expect(result.results.MSFT?.length).toBe(1);
    expect(result.metadata.totalResults).toBe(2);
  });

  test("respects concurrency limit with many symbols", async () => {
    const callTimes: number[] = [];

    globalThis.fetch = createMockFetch(() => {
      callTimes.push(Date.now());
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(
            new Response(
              JSON.stringify({
                query: "test",
                results: [],
                response_time: 1.0,
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }, 50); // 50ms delay per call
      });
    });
    resetTavilyClient();

    await batchSearch(paperCtx, {
      queryTemplate: "{SYMBOL} news",
      symbols: ["A", "B", "C", "D", "E", "F"], // 6 symbols, should be 2 chunks of 3
    });

    // With concurrency of 3 and 6 symbols, we expect 2 batches
    expect(callTimes.length).toBe(6);

    // Check that first 3 calls were nearly simultaneous
    const firstBatchSpread =
      Math.max(...callTimes.slice(0, 3)) - Math.min(...callTimes.slice(0, 3));
    expect(firstBatchSpread).toBeLessThan(20); // Should all start within 20ms
  });
});
