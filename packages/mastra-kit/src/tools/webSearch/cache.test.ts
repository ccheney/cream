/**
 * Web Search Cache Tests
 */

process.env.CREAM_ENV = "PAPER";
process.env.CREAM_BROKER = "ALPACA";
process.env.TAVILY_API_KEY = "test-api-key";

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as domain from "@cream/domain";
import { createTestContext } from "@cream/domain";
import {
  clearWebSearchCache,
  getWebSearchCacheSize,
  resetTavilyClient,
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
    const result1 = await webSearch(paperCtx, { query: "test query" });
    expect(fetchCallCount).toBe(1);
    expect(result1.results).toHaveLength(1);

    // Second call - cache hit
    const result2 = await webSearch(paperCtx, { query: "test query" });
    expect(fetchCallCount).toBe(1); // No additional API call
    expect(result2.results).toHaveLength(1);
    expect(result2.results[0]?.title).toBe(result1.results[0]?.title);
  });

  test("cache miss executes search", async () => {
    const result = await webSearch(paperCtx, { query: "new query" });

    expect(fetchCallCount).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(getWebSearchCacheSize()).toBe(1);
  });

  test("different queries result in different cache entries", async () => {
    await webSearch(paperCtx, { query: "query one" });
    await webSearch(paperCtx, { query: "query two" });

    expect(fetchCallCount).toBe(2);
    expect(getWebSearchCacheSize()).toBe(2);
  });

  test("cache key normalizes query case", async () => {
    // First call with lowercase
    await webSearch(paperCtx, { query: "test query" });
    expect(fetchCallCount).toBe(1);

    // Second call with mixed case - should be cache hit
    await webSearch(paperCtx, { query: "TEST QUERY" });
    expect(fetchCallCount).toBe(1);

    // Third call with uppercase - should be cache hit
    await webSearch(paperCtx, { query: "Test Query" });
    expect(fetchCallCount).toBe(1);
  });

  test("cache key normalizes query whitespace", async () => {
    // First call with extra whitespace
    await webSearch(paperCtx, { query: "  test query  " });
    expect(fetchCallCount).toBe(1);

    // Second call with no extra whitespace - should be cache hit
    await webSearch(paperCtx, { query: "test query" });
    expect(fetchCallCount).toBe(1);
  });

  test("different maxResults can serve from same cache", async () => {
    // First call with maxResults 5
    const result1 = await webSearch(paperCtx, { query: "test", maxResults: 5 });
    expect(fetchCallCount).toBe(1);

    // Second call with maxResults 3 - should use cached result
    const result2 = await webSearch(paperCtx, { query: "test", maxResults: 3 });
    expect(fetchCallCount).toBe(1); // No additional API call

    // Results should be sliced appropriately
    expect(result1.results.length).toBeLessThanOrEqual(5);
    expect(result2.results.length).toBeLessThanOrEqual(3);
  });

  test("clearWebSearchCache clears all entries", async () => {
    await webSearch(paperCtx, { query: "query one" });
    await webSearch(paperCtx, { query: "query two" });
    expect(getWebSearchCacheSize()).toBe(2);

    clearWebSearchCache();
    expect(getWebSearchCacheSize()).toBe(0);

    // After clear, next call should be cache miss
    await webSearch(paperCtx, { query: "query one" });
    expect(fetchCallCount).toBe(3);
  });

  test("backtest mode does not cache results", async () => {
    isBacktestSpy.mockReturnValue(true);

    const result = await webSearch(paperCtx, { query: "test" });

    expect(result.results).toHaveLength(0);
    expect(getWebSearchCacheSize()).toBe(0);
  });
});
