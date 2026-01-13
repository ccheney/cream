/**
 * Web Search Domain Filtering Tests
 */

process.env.CREAM_ENV = "PAPER";
process.env.TAVILY_API_KEY = "test-api-key";

import { afterAll, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as domain from "@cream/domain";
import { createTestContext } from "@cream/domain";
import { clearWebSearchCache, resetTavilyClient, webSearch } from "./index.js";

const paperCtx = createTestContext("PAPER");

function createMockFetch<T extends (...args: Parameters<typeof fetch>) => Promise<Response>>(
  implementation: T
): typeof fetch {
  const mockFn = mock(implementation);
  const typedMock = mockFn as unknown as typeof fetch;
  (typedMock as typeof fetch & { preconnect: () => void }).preconnect = () => {};
  return typedMock;
}

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
    clearWebSearchCache();
  });

  beforeEach(() => {
    capturedBody = null;
    clearWebSearchCache();
  });

  test("builds domain filter for news source", async () => {
    await webSearch(paperCtx, { query: "test", sources: ["news"] });

    expect(capturedBody?.include_domains).toEqual(
      expect.arrayContaining(["reuters.com", "bloomberg.com", "cnbc.com"])
    );
  });

  test("builds domain filter for multiple sources", async () => {
    await webSearch(paperCtx, { query: "test", sources: ["reddit", "x"] });

    expect(capturedBody?.include_domains).toEqual(expect.arrayContaining(["reddit.com", "x.com"]));
  });

  test("no domain filter for 'all' source", async () => {
    await webSearch(paperCtx, { query: "test", sources: ["all"] });

    expect(capturedBody?.include_domains).toBeUndefined();
  });

  test("includes symbols in query", async () => {
    await webSearch(paperCtx, { query: "earnings report", symbols: ["AAPL", "MSFT"] });

    expect(capturedBody?.query).toBe("earnings report $AAPL $MSFT");
  });

  test("sets topic parameter", async () => {
    await webSearch(paperCtx, { query: "test", topic: "finance" });

    expect(capturedBody?.topic).toBe("finance");
  });

  test("calculates day time range for <= 24 hours", async () => {
    await webSearch(paperCtx, { query: "test", maxAgeHours: 12 });

    expect(capturedBody?.time_range).toBe("day");
  });

  test("calculates week time range for 24-168 hours", async () => {
    await webSearch(paperCtx, { query: "test", maxAgeHours: 72 });

    expect(capturedBody?.time_range).toBe("week");
  });

  test("requests 2x maxResults for filtering headroom", async () => {
    await webSearch(paperCtx, { query: "test", maxResults: 5 });

    expect(capturedBody?.max_results).toBe(10);
  });

  test("caps max_results at 20", async () => {
    await webSearch(paperCtx, { query: "test", maxResults: 15 });

    expect(capturedBody?.max_results).toBe(20);
  });
});
