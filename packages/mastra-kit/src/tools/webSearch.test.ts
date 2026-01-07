/**
 * Web Search Tests
 */

// Set required environment variables before imports
// NOTE: CREAM_ENV=PAPER is used because the domain package caches env at module load time.
// Tests that need backtest mode will mock isBacktest() directly.
process.env.CREAM_ENV = "PAPER";
process.env.CREAM_BROKER = "ALPACA";
process.env.TAVILY_API_KEY = "test-api-key";

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import * as domain from "@cream/domain";
import {
  clearWebSearchCache,
  getWebSearchCacheSize,
  rateLimiter,
  resetTavilyClient,
  WebSearchParamsSchema,
  webSearch,
} from "./webSearch.js";

// ============================================
// Mock Helpers
// ============================================

function createMockFetch<T extends (...args: Parameters<typeof fetch>) => Promise<Response>>(
  implementation: T
): typeof fetch {
  const mockFn = mock(implementation);
  const typedMock = mockFn as unknown as typeof fetch;
  (typedMock as typeof fetch & { preconnect: () => void }).preconnect = () => {};
  return typedMock;
}

// ============================================
// Schema Tests
// ============================================

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

// ============================================
// Backtest Mode Tests
// ============================================

describe("webSearch in backtest mode", () => {
  test("returns empty results in backtest mode", async () => {
    // Mock isBacktest to return true for this test
    const isBacktestSpy = spyOn(domain, "isBacktest").mockReturnValue(true);

    try {
      const result = await webSearch({ query: "test query" });

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

// ============================================
// Missing API Key Tests
// ============================================

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
    const result = await webSearch({ query: "test query" });

    expect(result.results).toHaveLength(0);
    expect(result.metadata.query).toBe("test query");
  });
});

// ============================================
// API Integration Tests (Mocked)
// ============================================

describe("webSearch with mocked API", () => {
  const originalApiKey = process.env.TAVILY_API_KEY;
  const originalFetch = globalThis.fetch;
  let isBacktestSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    isBacktestSpy = spyOn(domain, "isBacktest").mockReturnValue(false);
    process.env.TAVILY_API_KEY = "test-api-key";
    clearWebSearchCache(); // Clear cache before each test
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
    clearWebSearchCache(); // Clear cache after each test
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

    const result = await webSearch({ query: "test query" });

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

    const result = await webSearch({ query: "test query", maxAgeHours: 24 });

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

    const result = await webSearch({ query: "test query", maxResults: 5 });

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

    const result = await webSearch({ query: "test query" });

    expect(result.results).toHaveLength(0);
    expect(result.metadata.query).toBe("test query");
  });

  test("handles network errors gracefully", async () => {
    globalThis.fetch = createMockFetch(() => Promise.reject(new Error("Network error")));
    resetTavilyClient();

    const result = await webSearch({ query: "test query" });

    expect(result.results).toHaveLength(0);
    expect(result.metadata.query).toBe("test query");
  });

  test("handles invalid params gracefully", async () => {
    const result = await webSearch({ query: "" });

    expect(result.results).toHaveLength(0);
  });
});

// ============================================
// Request Building Tests
// ============================================

describe("webSearch request building", () => {
  const originalApiKey = process.env.TAVILY_API_KEY;
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;
  let isBacktestSpy: ReturnType<typeof spyOn>;

  beforeAll(() => {
    isBacktestSpy = spyOn(domain, "isBacktest").mockReturnValue(false);
    process.env.TAVILY_API_KEY = "test-api-key";

    globalThis.fetch = createMockFetch((_url: string | URL | Request, options?: RequestInit) => {
      capturedBody = JSON.parse(options?.body as string);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            query: "test",
            results: [],
            response_time: 1.0,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });
    resetTavilyClient();
  });

  afterAll(() => {
    isBacktestSpy.mockRestore();
    if (originalApiKey) {
      process.env.TAVILY_API_KEY = originalApiKey;
    } else {
      delete process.env.TAVILY_API_KEY;
    }
    globalThis.fetch = originalFetch;
    resetTavilyClient();
    clearWebSearchCache(); // Clear cache after all tests
  });

  beforeEach(() => {
    capturedBody = null;
    clearWebSearchCache(); // Clear cache before each test to ensure API call
  });

  test("builds domain filter for news source", async () => {
    await webSearch({ query: "test", sources: ["news"] });

    expect(capturedBody?.include_domains).toEqual(
      expect.arrayContaining(["reuters.com", "bloomberg.com", "cnbc.com"])
    );
  });

  test("builds domain filter for multiple sources", async () => {
    await webSearch({ query: "test", sources: ["reddit", "x"] });

    expect(capturedBody?.include_domains).toEqual(expect.arrayContaining(["reddit.com", "x.com"]));
  });

  test("no domain filter for 'all' source", async () => {
    await webSearch({ query: "test", sources: ["all"] });

    expect(capturedBody?.include_domains).toBeUndefined();
  });

  test("includes symbols in query", async () => {
    await webSearch({ query: "earnings report", symbols: ["AAPL", "MSFT"] });

    expect(capturedBody?.query).toBe("earnings report $AAPL $MSFT");
  });

  test("sets topic parameter", async () => {
    await webSearch({ query: "test", topic: "finance" });

    expect(capturedBody?.topic).toBe("finance");
  });

  test("calculates day time range for <= 24 hours", async () => {
    await webSearch({ query: "test", maxAgeHours: 12 });

    expect(capturedBody?.time_range).toBe("day");
  });

  test("calculates week time range for 24-168 hours", async () => {
    await webSearch({ query: "test", maxAgeHours: 72 });

    expect(capturedBody?.time_range).toBe("week");
  });

  test("requests 2x maxResults for filtering headroom", async () => {
    await webSearch({ query: "test", maxResults: 5 });

    expect(capturedBody?.max_results).toBe(10);
  });

  test("caps max_results at 20", async () => {
    await webSearch({ query: "test", maxResults: 15 });

    expect(capturedBody?.max_results).toBe(20);
  });
});

// ============================================
// Cache Tests
// ============================================

describe("webSearch caching", () => {
  const originalApiKey = process.env.TAVILY_API_KEY;
  const originalFetch = globalThis.fetch;
  let fetchCallCount = 0;
  let isBacktestSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    isBacktestSpy = spyOn(domain, "isBacktest").mockReturnValue(false);
    process.env.TAVILY_API_KEY = "test-api-key";
    fetchCallCount = 0;
    clearWebSearchCache();

    const now = new Date();
    globalThis.fetch = createMockFetch(() => {
      fetchCallCount++;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            query: "test",
            results: [
              {
                title: "Test Result",
                url: "https://example.com/article",
                content: "Test content",
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
    resetTavilyClient();
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

  test("cache hit returns cached result without API call", async () => {
    // First call - cache miss
    const result1 = await webSearch({ query: "test query" });
    expect(fetchCallCount).toBe(1);
    expect(result1.results).toHaveLength(1);

    // Second call - cache hit
    const result2 = await webSearch({ query: "test query" });
    expect(fetchCallCount).toBe(1); // No additional API call
    expect(result2.results).toHaveLength(1);
    expect(result2.results[0]?.title).toBe(result1.results[0]?.title);
  });

  test("cache miss executes search", async () => {
    const result = await webSearch({ query: "new query" });

    expect(fetchCallCount).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(getWebSearchCacheSize()).toBe(1);
  });

  test("different queries result in different cache entries", async () => {
    await webSearch({ query: "query one" });
    await webSearch({ query: "query two" });

    expect(fetchCallCount).toBe(2);
    expect(getWebSearchCacheSize()).toBe(2);
  });

  test("cache key normalizes query case", async () => {
    // First call with lowercase
    await webSearch({ query: "test query" });
    expect(fetchCallCount).toBe(1);

    // Second call with mixed case - should be cache hit
    await webSearch({ query: "TEST QUERY" });
    expect(fetchCallCount).toBe(1);

    // Third call with uppercase - should be cache hit
    await webSearch({ query: "Test Query" });
    expect(fetchCallCount).toBe(1);
  });

  test("cache key normalizes query whitespace", async () => {
    // First call with extra whitespace
    await webSearch({ query: "  test query  " });
    expect(fetchCallCount).toBe(1);

    // Second call with no extra whitespace - should be cache hit
    await webSearch({ query: "test query" });
    expect(fetchCallCount).toBe(1);
  });

  test("different maxResults can serve from same cache", async () => {
    // First call with maxResults 5
    const result1 = await webSearch({ query: "test", maxResults: 5 });
    expect(fetchCallCount).toBe(1);

    // Second call with maxResults 3 - should use cached result
    const result2 = await webSearch({ query: "test", maxResults: 3 });
    expect(fetchCallCount).toBe(1); // No additional API call

    // Results should be sliced appropriately
    expect(result1.results.length).toBeLessThanOrEqual(5);
    expect(result2.results.length).toBeLessThanOrEqual(3);
  });

  test("clearWebSearchCache clears all entries", async () => {
    await webSearch({ query: "query one" });
    await webSearch({ query: "query two" });
    expect(getWebSearchCacheSize()).toBe(2);

    clearWebSearchCache();
    expect(getWebSearchCacheSize()).toBe(0);

    // After clear, next call should be cache miss
    await webSearch({ query: "query one" });
    expect(fetchCallCount).toBe(3);
  });

  test("backtest mode does not cache results", async () => {
    isBacktestSpy.mockReturnValue(true);

    const result = await webSearch({ query: "test" });

    expect(result.results).toHaveLength(0);
    expect(getWebSearchCacheSize()).toBe(0);
  });
});

// ============================================
// Rate Limiter Tests
// ============================================

describe("RateLimiter", () => {
  beforeEach(() => {
    rateLimiter.reset();
  });

  afterEach(() => {
    rateLimiter.reset();
  });

  test("canProceed returns true when under limit", () => {
    expect(rateLimiter.canProceed("tavily")).toBe(true);
  });

  test("canProceed returns false at minute limit", () => {
    // Record 60 requests (minute limit)
    for (let i = 0; i < 60; i++) {
      rateLimiter.record("tavily");
    }

    expect(rateLimiter.canProceed("tavily")).toBe(false);
  });

  test("canProceed returns false at day limit", () => {
    // Record 1000 requests (day limit)
    for (let i = 0; i < 1000; i++) {
      rateLimiter.record("tavily");
    }

    expect(rateLimiter.canProceed("tavily")).toBe(false);
  });

  test("record increments counters", () => {
    const before = rateLimiter.getRemainingQuota("tavily");
    rateLimiter.record("tavily");
    const after = rateLimiter.getRemainingQuota("tavily");

    expect(after.minute).toBe(before.minute - 1);
    expect(after.day).toBe(before.day - 1);
  });

  test("getRemainingQuota returns correct values", () => {
    const initial = rateLimiter.getRemainingQuota("tavily");
    expect(initial.minute).toBe(60);
    expect(initial.day).toBe(1000);

    // Record 10 requests
    for (let i = 0; i < 10; i++) {
      rateLimiter.record("tavily");
    }

    const after = rateLimiter.getRemainingQuota("tavily");
    expect(after.minute).toBe(50);
    expect(after.day).toBe(990);
  });

  test("reset clears all counts", () => {
    // Record some requests
    for (let i = 0; i < 10; i++) {
      rateLimiter.record("tavily");
    }
    expect(rateLimiter.getRemainingQuota("tavily").minute).toBe(50);

    // Reset
    rateLimiter.reset();

    // Should be back to full
    expect(rateLimiter.getRemainingQuota("tavily").minute).toBe(60);
    expect(rateLimiter.getRemainingQuota("tavily").day).toBe(1000);
  });
});

// ============================================
// Rate Limiting Integration Tests
// ============================================

describe("webSearch rate limiting", () => {
  const originalApiKey = process.env.TAVILY_API_KEY;
  const originalFetch = globalThis.fetch;
  let fetchCallCount = 0;
  let isBacktestSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    isBacktestSpy = spyOn(domain, "isBacktest").mockReturnValue(false);
    process.env.TAVILY_API_KEY = "test-api-key";
    fetchCallCount = 0;
    clearWebSearchCache();
    rateLimiter.reset();

    const now = new Date();
    globalThis.fetch = createMockFetch(() => {
      fetchCallCount++;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            query: "test",
            results: [
              {
                title: "Test Result",
                url: "https://example.com/article",
                content: "Test content",
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
    resetTavilyClient();
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
    rateLimiter.reset();
  });

  test("records API call on successful search", async () => {
    const before = rateLimiter.getRemainingQuota("tavily");
    await webSearch({ query: "test query" });
    const after = rateLimiter.getRemainingQuota("tavily");

    expect(after.minute).toBe(before.minute - 1);
    expect(after.day).toBe(before.day - 1);
  });

  test("returns empty results when rate limited", async () => {
    // Exhaust minute limit
    for (let i = 0; i < 60; i++) {
      rateLimiter.record("tavily");
    }

    const result = await webSearch({ query: "test query" });

    expect(result.results).toHaveLength(0);
    expect(fetchCallCount).toBe(0); // No API call made
  });

  test("does not record when rate limited", async () => {
    // Exhaust minute limit
    for (let i = 0; i < 60; i++) {
      rateLimiter.record("tavily");
    }

    const before = rateLimiter.getRemainingQuota("tavily");
    await webSearch({ query: "test query" });
    const after = rateLimiter.getRemainingQuota("tavily");

    // Should not have recorded additional call
    expect(after.minute).toBe(before.minute);
    expect(after.day).toBe(before.day);
  });

  test("cache hit does not consume rate limit", async () => {
    // First call - API call made
    await webSearch({ query: "cached query" });
    const afterFirst = rateLimiter.getRemainingQuota("tavily");

    // Second call - cache hit, no API call
    await webSearch({ query: "cached query" });
    const afterSecond = rateLimiter.getRemainingQuota("tavily");

    expect(fetchCallCount).toBe(1);
    expect(afterSecond.minute).toBe(afterFirst.minute);
    expect(afterSecond.day).toBe(afterFirst.day);
  });
});
