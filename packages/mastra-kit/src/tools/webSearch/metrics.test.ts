/**
 * Web Search Metrics Tests
 */

process.env.CREAM_ENV = "PAPER";
process.env.CREAM_BROKER = "ALPACA";
process.env.TAVILY_API_KEY = "test-api-key";

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as domain from "@cream/domain";
import { createTestContext } from "@cream/domain";
import {
  clearWebSearchCache,
  getWebSearchMetrics,
  metricsCollector,
  rateLimiter,
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
    await webSearch(paperCtx, { query: "test query" });

    const metrics = getWebSearchMetrics();
    expect(metrics.successfulRequests).toBe(1);
    expect(metrics.apiCallsUsed).toBe(1);
  });

  test("webSearch records cache hit metric", async () => {
    // First call - API call
    await webSearch(paperCtx, { query: "cached test" });
    // Second call - cache hit
    await webSearch(paperCtx, { query: "cached test" });

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

    await webSearch(paperCtx, { query: "rate limited query" });

    const metrics = getWebSearchMetrics();
    expect(metrics.rateLimitedRequests).toBe(1);
  });

  test("webSearch records backtest metric", async () => {
    isBacktestSpy.mockReturnValue(true);

    await webSearch(paperCtx, { query: "backtest query" });

    const metrics = getWebSearchMetrics();
    expect(metrics.totalRequests).toBe(1);
    // Backtest is recorded but not as success/cache/error/rate_limited
    expect(metrics.successfulRequests).toBe(0);
    expect(metrics.cacheHits).toBe(0);
  });

  test("webSearch records error metric on API failure", async () => {
    globalThis.fetch = createMockFetch(() => Promise.reject(new Error("Network error")));
    resetTavilyClient();

    await webSearch(paperCtx, { query: "error query" });

    const metrics = getWebSearchMetrics();
    expect(metrics.failedRequests).toBe(1);
  });
});
