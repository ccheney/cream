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
  batchSearch,
  clearWebSearchCache,
  getWebSearchCacheSize,
  getWebSearchMetrics,
  metricsCollector,
  rateLimiter,
  resetTavilyClient,
  sanitizeQuery,
  validateResultUrl,
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

// ============================================
// Security Tests
// ============================================

describe("sanitizeQuery", () => {
  test("truncates queries exceeding max length", () => {
    const longQuery = "a".repeat(600);
    const sanitized = sanitizeQuery(longQuery);
    expect(sanitized.length).toBe(500);
  });

  test("removes dangerous characters", () => {
    const dangerousQuery = "test<script>alert('xss')</script>query";
    const sanitized = sanitizeQuery(dangerousQuery);
    expect(sanitized).not.toContain("<");
    expect(sanitized).not.toContain(">");
    expect(sanitized).toBe("testscriptalert('xss')/scriptquery");
  });

  test("removes all dangerous character types", () => {
    const query = "test<>{}|\\^`chars";
    const sanitized = sanitizeQuery(query);
    expect(sanitized).toBe("testchars");
  });

  test("normalizes whitespace", () => {
    const query = "  multiple   spaces   here  ";
    const sanitized = sanitizeQuery(query);
    expect(sanitized).toBe("multiple spaces here");
  });

  test("preserves valid query characters", () => {
    const query = "stock AAPL price $100 @mentions #hashtag";
    const sanitized = sanitizeQuery(query);
    expect(sanitized).toBe("stock AAPL price $100 @mentions #hashtag");
  });
});

describe("validateResultUrl", () => {
  test("accepts valid https URLs", () => {
    expect(validateResultUrl("https://example.com/page")).toBe(true);
    expect(validateResultUrl("https://www.google.com/search?q=test")).toBe(true);
  });

  test("accepts valid http URLs", () => {
    expect(validateResultUrl("http://example.com/page")).toBe(true);
  });

  test("blocks file protocol", () => {
    expect(validateResultUrl("file:///etc/passwd")).toBe(false);
  });

  test("blocks javascript protocol", () => {
    expect(validateResultUrl("javascript:alert('xss')")).toBe(false);
  });

  test("blocks data protocol", () => {
    expect(validateResultUrl("data:text/html,<script>alert('xss')</script>")).toBe(false);
  });

  test("blocks .onion TLD", () => {
    expect(validateResultUrl("https://example.onion/page")).toBe(false);
  });

  test("blocks .local TLD", () => {
    expect(validateResultUrl("https://myservice.local/api")).toBe(false);
  });

  test("blocks .internal TLD", () => {
    expect(validateResultUrl("https://backend.internal/health")).toBe(false);
  });

  test("blocks 10.x.x.x internal IPs", () => {
    expect(validateResultUrl("https://10.0.0.1/api")).toBe(false);
    expect(validateResultUrl("https://10.255.255.255/page")).toBe(false);
  });

  test("blocks 172.16-31.x.x internal IPs", () => {
    expect(validateResultUrl("https://172.16.0.1/api")).toBe(false);
    expect(validateResultUrl("https://172.31.255.255/page")).toBe(false);
  });

  test("allows 172.15.x.x (not in private range)", () => {
    expect(validateResultUrl("https://172.15.0.1/api")).toBe(true);
  });

  test("blocks 192.168.x.x internal IPs", () => {
    expect(validateResultUrl("https://192.168.1.1/router")).toBe(false);
    expect(validateResultUrl("https://192.168.0.100/api")).toBe(false);
  });

  test("blocks 127.x.x.x loopback", () => {
    expect(validateResultUrl("https://127.0.0.1/api")).toBe(false);
    expect(validateResultUrl("http://127.0.0.1:3000/")).toBe(false);
  });

  test("blocks localhost", () => {
    expect(validateResultUrl("https://localhost/api")).toBe(false);
    expect(validateResultUrl("http://localhost:8080/")).toBe(false);
    expect(validateResultUrl("https://LOCALHOST/api")).toBe(false);
  });

  test("blocks link-local addresses", () => {
    expect(validateResultUrl("https://169.254.0.1/api")).toBe(false);
  });

  test("blocks 0.x.x.x addresses", () => {
    expect(validateResultUrl("https://0.0.0.0/api")).toBe(false);
  });

  test("returns false for invalid URLs", () => {
    expect(validateResultUrl("not-a-url")).toBe(false);
    expect(validateResultUrl("")).toBe(false);
  });
});

// ============================================
// Rate Limit Alerting Tests
// ============================================

import { rateLimitAlerter } from "./webSearch.js";

describe("rateLimitAlerter", () => {
  beforeEach(() => {
    rateLimiter.reset();
    rateLimitAlerter.reset();
  });

  test("returns no alerts when under thresholds", () => {
    // Only use a few requests (under 80% of 60 per minute)
    for (let i = 0; i < 10; i++) {
      rateLimiter.record("tavily");
    }
    const alerts = rateLimitAlerter.check("tavily");
    expect(alerts).toHaveLength(0);
  });

  test("returns warning alert at 80% minute usage", () => {
    // Use 80% of 60 = 48 requests
    for (let i = 0; i < 48; i++) {
      rateLimiter.record("tavily");
    }
    const alerts = rateLimitAlerter.check("tavily");
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    const minuteAlert = alerts.find((a) => a.type === "minute_limit");
    expect(minuteAlert?.severity).toBe("warning");
  });

  test("returns critical alert at 95% minute usage", () => {
    // Use 95% of 60 = 57 requests
    for (let i = 0; i < 57; i++) {
      rateLimiter.record("tavily");
    }
    const alerts = rateLimitAlerter.check("tavily");
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    const minuteAlert = alerts.find((a) => a.type === "minute_limit");
    expect(minuteAlert?.severity).toBe("critical");
  });

  test("cooldown prevents repeated alerts", () => {
    // Use enough to trigger warning
    for (let i = 0; i < 50; i++) {
      rateLimiter.record("tavily");
    }

    const alerts1 = rateLimitAlerter.check("tavily");
    expect(alerts1.length).toBeGreaterThanOrEqual(1);

    // Second check should be filtered by cooldown
    const alerts2 = rateLimitAlerter.check("tavily");
    expect(alerts2).toHaveLength(0);
  });

  test("alert message includes useful info", () => {
    for (let i = 0; i < 50; i++) {
      rateLimiter.record("tavily");
    }
    const alerts = rateLimitAlerter.check("tavily");
    const alert = alerts[0];

    expect(alert?.provider).toBe("tavily");
    expect(alert?.message).toContain("tavily");
    expect(alert?.message).toContain("minute");
    expect(alert?.percentUsed).toBeGreaterThanOrEqual(0.8);
    expect(alert?.current).toBeGreaterThan(0);
    expect(alert?.limit).toBe(60);
  });

  test("returns empty array for unknown provider", () => {
    // @ts-expect-error - testing invalid provider
    const alerts = rateLimitAlerter.check("unknown");
    expect(alerts).toHaveLength(0);
  });
});

// ============================================
// Metrics Collector Tests
// ============================================

describe("metricsCollector", () => {
  beforeEach(() => {
    metricsCollector.reset();
  });

  test("getMetrics returns initial zeros", () => {
    const metrics = getWebSearchMetrics();
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.successfulRequests).toBe(0);
    expect(metrics.failedRequests).toBe(0);
    expect(metrics.cacheHits).toBe(0);
    expect(metrics.rateLimitedRequests).toBe(0);
  });

  test("records success metrics correctly", () => {
    metricsCollector.record({
      timestamp: Date.now(),
      type: "success",
      latencyMs: 150,
      resultCount: 5,
    });

    const metrics = getWebSearchMetrics();
    expect(metrics.totalRequests).toBe(1);
    expect(metrics.successfulRequests).toBe(1);
    expect(metrics.apiCallsUsed).toBe(1);
    expect(metrics.averageLatencyMs).toBe(150);
    expect(metrics.averageResultCount).toBe(5);
  });

  test("records cache hit metrics correctly", () => {
    metricsCollector.record({
      timestamp: Date.now(),
      type: "cache_hit",
      latencyMs: 5,
      resultCount: 3,
    });

    const metrics = getWebSearchMetrics();
    expect(metrics.totalRequests).toBe(1);
    expect(metrics.cacheHits).toBe(1);
    expect(metrics.successfulRequests).toBe(0); // Cache hit is not an API success
  });

  test("records rate limited metrics correctly", () => {
    metricsCollector.record({
      timestamp: Date.now(),
      type: "rate_limited",
      latencyMs: 1,
      resultCount: 0,
    });

    const metrics = getWebSearchMetrics();
    expect(metrics.rateLimitedRequests).toBe(1);
    expect(metrics.emptyResultCount).toBe(1);
  });

  test("records error metrics correctly", () => {
    metricsCollector.record({
      timestamp: Date.now(),
      type: "error",
      latencyMs: 100,
      resultCount: 0,
    });

    const metrics = getWebSearchMetrics();
    expect(metrics.failedRequests).toBe(1);
    expect(metrics.emptyResultCount).toBe(1);
  });

  test("calculates latency percentiles from success requests", () => {
    // Add 100 successful requests with increasing latency
    for (let i = 1; i <= 100; i++) {
      metricsCollector.record({
        timestamp: Date.now(),
        type: "success",
        latencyMs: i * 10, // 10, 20, 30, ..., 1000
        resultCount: 1,
      });
    }

    const metrics = getWebSearchMetrics();
    // p95 should be around 95th percentile (950-960 range)
    expect(metrics.p95LatencyMs).toBeGreaterThanOrEqual(940);
    expect(metrics.p95LatencyMs).toBeLessThanOrEqual(970);
    // p99 should be around 99th percentile (990-1000 range)
    expect(metrics.p99LatencyMs).toBeGreaterThanOrEqual(980);
    expect(metrics.p99LatencyMs).toBeLessThanOrEqual(1000);
    // Average of 10-1000 is 505
    expect(metrics.averageLatencyMs).toBe(505);
  });

  test("time window aggregates work correctly", () => {
    metricsCollector.record({
      timestamp: Date.now(),
      type: "success",
      latencyMs: 100,
      resultCount: 5,
    });
    metricsCollector.record({
      timestamp: Date.now(),
      type: "cache_hit",
      latencyMs: 5,
      resultCount: 3,
    });

    const metrics = getWebSearchMetrics();
    expect(metrics.lastHour.total).toBe(2);
    expect(metrics.lastHour.successful).toBe(1);
    expect(metrics.lastHour.cached).toBe(1);
    expect(metrics.lastDay.total).toBe(2);
  });

  test("prunes old records outside 24h window", () => {
    // Record old request (25 hours ago)
    const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000;
    metricsCollector.record({
      timestamp: oldTimestamp,
      type: "success",
      latencyMs: 100,
      resultCount: 5,
    });

    // Record new request (now)
    metricsCollector.record({
      timestamp: Date.now(),
      type: "success",
      latencyMs: 50,
      resultCount: 3,
    });

    const metrics = getWebSearchMetrics();
    // Old record should be pruned, only new one counted
    expect(metrics.lastDay.total).toBe(1);
    expect(metrics.averageLatencyMs).toBe(50);
  });

  test("memory is bounded by maxRecords", () => {
    // Add 15000 records (above 10000 limit)
    for (let i = 0; i < 15000; i++) {
      metricsCollector.record({
        timestamp: Date.now(),
        type: "success",
        latencyMs: 100,
        resultCount: 1,
      });
    }

    // Should be capped at maxRecords
    expect(metricsCollector.getRecordCount()).toBeLessThanOrEqual(10000);
  });

  test("reset clears all records", () => {
    metricsCollector.record({
      timestamp: Date.now(),
      type: "success",
      latencyMs: 100,
      resultCount: 5,
    });

    metricsCollector.reset();
    const metrics = getWebSearchMetrics();
    expect(metrics.totalRequests).toBe(0);
  });
});

// ============================================
// Metrics Integration Tests
// ============================================

describe("webSearch metrics integration", () => {
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

    globalThis.fetch = createMockFetch(() =>
      Promise.resolve(
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
      )
    );
  });

  afterEach(() => {
    isBacktestSpy.mockRestore();
    globalThis.fetch = originalFetch;
    resetTavilyClient();
    clearWebSearchCache();
    rateLimiter.reset();
    metricsCollector.reset();
  });

  test("webSearch records success metric on API call", async () => {
    await webSearch({ query: "test query" });

    const metrics = getWebSearchMetrics();
    expect(metrics.successfulRequests).toBe(1);
    expect(metrics.apiCallsUsed).toBe(1);
  });

  test("webSearch records cache hit metric", async () => {
    // First call - API call
    await webSearch({ query: "cached test" });
    // Second call - cache hit
    await webSearch({ query: "cached test" });

    const metrics = getWebSearchMetrics();
    expect(metrics.successfulRequests).toBe(1); // Only 1 API call
    expect(metrics.cacheHits).toBe(1);
    expect(metrics.totalRequests).toBe(2);
  });

  test("webSearch records rate limited metric", async () => {
    // Exhaust rate limit
    for (let i = 0; i < 60; i++) {
      rateLimiter.record("tavily");
    }

    await webSearch({ query: "rate limited query" });

    const metrics = getWebSearchMetrics();
    expect(metrics.rateLimitedRequests).toBe(1);
  });

  test("webSearch records backtest metric", async () => {
    isBacktestSpy.mockReturnValue(true);

    await webSearch({ query: "backtest query" });

    const metrics = getWebSearchMetrics();
    expect(metrics.totalRequests).toBe(1);
    // Backtest is recorded but not as success/cache/error/rate_limited
    expect(metrics.successfulRequests).toBe(0);
    expect(metrics.cacheHits).toBe(0);
  });

  test("webSearch records error metric on API failure", async () => {
    globalThis.fetch = createMockFetch(() => Promise.reject(new Error("Network error")));
    resetTavilyClient();

    await webSearch({ query: "error query" });

    const metrics = getWebSearchMetrics();
    expect(metrics.failedRequests).toBe(1);
  });
});

// ============================================
// Batch Search Tests
// ============================================

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

    // Mock fetch to return results based on query
    globalThis.fetch = createMockFetch((url, options) => {
      const body = options?.body ? JSON.parse(options.body as string) : {};
      const query = body.query || "";

      // Create different results based on symbol in query
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
    const result = await batchSearch({
      queryTemplate: "{SYMBOL} stock news",
      symbols: [],
    });

    expect(result.results).toEqual({});
    expect(result.metadata.symbolsSearched).toBe(0);
    expect(result.metadata.totalResults).toBe(0);
    expect(result.metadata.queriesExecuted).toBe(0);
  });

  test("searches single symbol correctly", async () => {
    const result = await batchSearch({
      queryTemplate: "{SYMBOL} stock news",
      symbols: ["NVDA"],
    });

    expect(result.results.NVDA).toBeDefined();
    expect(result.results.NVDA!.length).toBeGreaterThan(0);
    expect(result.metadata.symbolsSearched).toBe(1);
    expect(result.metadata.totalResults).toBe(1);
  });

  test("searches multiple symbols with correct mapping", async () => {
    const result = await batchSearch({
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
    globalThis.fetch = createMockFetch((url, options) => {
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

    await batchSearch({
      queryTemplate: "{SYMBOL} vs {SYMBOL} comparison",
      symbols: ["NVDA"],
    });

    expect(capturedQuery).toContain("NVDA vs NVDA comparison");
  });

  test("passes common params to each search", async () => {
    let capturedBody: Record<string, unknown> = {};
    globalThis.fetch = createMockFetch((url, options) => {
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

    await batchSearch({
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
    // Mock with delay to simulate real API call timing
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
    const result1 = await batchSearch({
      queryTemplate: "{SYMBOL} sentiment",
      symbols: ["NVDA", "AAPL"],
    });

    // Queries were executed (not cached because > 50ms)
    expect(result1.metadata.queriesExecuted).toBe(2);

    // Clear rate limiter but keep cache
    rateLimiter.reset();

    // Second search - should be cache hits (< 50ms because from cache)
    const result2 = await batchSearch({
      queryTemplate: "{SYMBOL} sentiment",
      symbols: ["NVDA", "AAPL"],
    });

    // Should have cache hits now
    expect(result2.metadata.cachedCount).toBe(2);
  });

  test("isolates errors - one failure doesn't fail batch", async () => {
    let callCount = 0;
    globalThis.fetch = createMockFetch(() => {
      callCount++;
      // Fail on second call with network error that webSearch will catch
      if (callCount === 2) {
        return Promise.reject(new Error("Network error"));
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

    const result = await batchSearch({
      queryTemplate: "{SYMBOL} news",
      symbols: ["NVDA", "AAPL", "MSFT"],
    });

    // All three symbols should be searched
    expect(result.metadata.symbolsSearched).toBe(3);

    // All symbols should have entries (webSearch returns empty array on error, not throw)
    expect(result.results.NVDA).toBeDefined();
    expect(result.results.AAPL).toBeDefined();
    expect(result.results.MSFT).toBeDefined();

    // Two should succeed with 1 result each, one should have empty results
    // webSearch handles errors internally and returns empty results
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

    await batchSearch({
      queryTemplate: "{SYMBOL} news",
      symbols: ["A", "B", "C", "D", "E", "F"], // 6 symbols, should be 2 chunks of 3
    });

    // With concurrency of 3 and 6 symbols, we expect 2 batches
    // The first batch of 3 should start nearly simultaneously
    // The second batch should start after the first completes
    expect(callTimes.length).toBe(6);

    // Check that first 3 calls were nearly simultaneous
    const firstBatchSpread =
      Math.max(...callTimes.slice(0, 3)) - Math.min(...callTimes.slice(0, 3));
    expect(firstBatchSpread).toBeLessThan(20); // Should all start within 20ms
  });
});
