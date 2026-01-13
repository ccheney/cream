/**
 * Web Search Rate Limiter Tests
 */

process.env.CREAM_ENV = "PAPER";
process.env.TAVILY_API_KEY = "test-api-key";

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as domain from "@cream/domain";
import { createTestContext } from "@cream/domain";
import {
  clearWebSearchCache,
  rateLimitAlerter,
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
    await webSearch(paperCtx, { query: "test query" });
    const after = rateLimiter.getRemainingQuota("tavily");

    expect(after.minute).toBe(before.minute - 1);
    expect(after.day).toBe(before.day - 1);
  });

  test("returns empty results when rate limited", async () => {
    // Exhaust minute limit
    for (let i = 0; i < 60; i++) {
      rateLimiter.record("tavily");
    }

    const result = await webSearch(paperCtx, { query: "test query" });

    expect(result.results).toHaveLength(0);
    expect(fetchCallCount).toBe(0); // No API call made
  });

  test("does not record when rate limited", async () => {
    // Exhaust minute limit
    for (let i = 0; i < 60; i++) {
      rateLimiter.record("tavily");
    }

    const before = rateLimiter.getRemainingQuota("tavily");
    await webSearch(paperCtx, { query: "test query" });
    const after = rateLimiter.getRemainingQuota("tavily");

    // Should not have recorded additional call
    expect(after.minute).toBe(before.minute);
    expect(after.day).toBe(before.day);
  });

  test("cache hit does not consume rate limit", async () => {
    // First call - API call made
    await webSearch(paperCtx, { query: "cached query" });
    const afterFirst = rateLimiter.getRemainingQuota("tavily");

    // Second call - cache hit, no API call
    await webSearch(paperCtx, { query: "cached query" });
    const afterSecond = rateLimiter.getRemainingQuota("tavily");

    expect(fetchCallCount).toBe(1);
    expect(afterSecond.minute).toBe(afterFirst.minute);
    expect(afterSecond.day).toBe(afterFirst.day);
  });
});

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
