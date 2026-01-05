/**
 * Base REST Client Tests
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { z } from "zod";
import {
  type ApiError,
  createRestClient,
  DEFAULT_RATE_LIMIT,
  DEFAULT_RETRY,
  RateLimiter,
  RestClient,
} from "../src/client";

// ============================================
// Tests
// ============================================

describe("RateLimiter", () => {
  test("allows requests within limit", async () => {
    const limiter = new RateLimiter({ maxRequests: 5, intervalMs: 1000 });

    // Should allow 5 requests immediately
    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }

    // Success if we get here without hanging
    expect(true).toBe(true);
  });

  test("blocks when limit exceeded", async () => {
    const limiter = new RateLimiter({ maxRequests: 2, intervalMs: 100 });

    const startTime = Date.now();

    // First 2 should be immediate
    await limiter.acquire();
    await limiter.acquire();

    // Third should wait
    await limiter.acquire();

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeGreaterThanOrEqual(90); // Allow for timing variance
  });

  test("refills tokens after interval", async () => {
    const limiter = new RateLimiter({ maxRequests: 2, intervalMs: 50 });

    await limiter.acquire();
    await limiter.acquire();

    // Wait for refill
    await new Promise((r) => setTimeout(r, 60));

    // Should be immediate again
    const startTime = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeLessThan(50);
  });
});

describe("RestClient", () => {
  // Mock fetch for testing
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("creates client with default configuration", () => {
    const client = createRestClient({ baseUrl: "https://api.example.com" });
    expect(client).toBeInstanceOf(RestClient);
  });

  test("makes GET request with query parameters", async () => {
    const client = createRestClient({ baseUrl: "https://api.example.com" });

    await client.get("/test", { foo: "bar", num: 42 });

    expect(mockFetch).toHaveBeenCalled();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("foo=bar");
    expect(url).toContain("num=42");
  });

  test("includes authorization header with API key", async () => {
    const client = createRestClient({
      baseUrl: "https://api.example.com",
      apiKey: "test-key",
    });

    await client.get("/test");

    expect(mockFetch).toHaveBeenCalled();
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
  });

  test("validates response with Zod schema", async () => {
    const schema = z.object({
      success: z.boolean(),
    });

    const client = createRestClient({ baseUrl: "https://api.example.com" });

    const result = await client.get("/test", {}, schema);

    expect(result.success).toBe(true);
  });

  test("throws on schema validation failure", async () => {
    const schema = z.object({
      missing_field: z.string(),
    });

    const client = createRestClient({ baseUrl: "https://api.example.com" });

    await expect(client.get("/test", {}, schema)).rejects.toThrow();
  });

  test("retries on server error", async () => {
    let attempts = 0;
    mockFetch = mock(() => {
      attempts++;
      if (attempts < 3) {
        return Promise.resolve(new Response("Server Error", { status: 500 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });
    globalThis.fetch = mockFetch;

    const client = createRestClient({
      baseUrl: "https://api.example.com",
      retry: {
        maxRetries: 3,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      },
    });

    const result = await client.get<{ success: boolean }>("/test");

    expect(result.success).toBe(true);
    expect(attempts).toBe(3);
  });

  test("does not retry on 4xx errors", async () => {
    let attempts = 0;
    mockFetch = mock(() => {
      attempts++;
      return Promise.resolve(new Response("Bad Request", { status: 400 }));
    });
    globalThis.fetch = mockFetch;

    const client = createRestClient({
      baseUrl: "https://api.example.com",
      retry: {
        maxRetries: 3,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      },
    });

    try {
      await client.get("/test");
    } catch (error) {
      const apiError = error as ApiError;
      expect(apiError.status).toBe(400);
      expect(apiError.retryable).toBe(false);
    }

    expect(attempts).toBe(1);
  });

  test("retries on rate limit (429)", async () => {
    let attempts = 0;
    mockFetch = mock(() => {
      attempts++;
      if (attempts < 2) {
        return Promise.resolve(new Response("Rate Limited", { status: 429 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });
    globalThis.fetch = mockFetch;

    const client = createRestClient({
      baseUrl: "https://api.example.com",
      retry: {
        maxRetries: 3,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      },
    });

    const result = await client.get<{ success: boolean }>("/test");

    expect(result.success).toBe(true);
    expect(attempts).toBe(2);
  });

  test("makes POST request with body", async () => {
    const client = createRestClient({ baseUrl: "https://api.example.com" });

    await client.post("/test", { data: "value" });

    expect(mockFetch).toHaveBeenCalled();
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe("POST");
    expect(options.body).toBe(JSON.stringify({ data: "value" }));
  });

  test("handles timeout", async () => {
    mockFetch = mock((_url: string, options?: RequestInit) => {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(
          () => resolve(new Response(JSON.stringify({ success: true }), { status: 200 })),
          1000
        );

        // Respect abort signal
        options?.signal?.addEventListener("abort", () => {
          clearTimeout(timeoutId);
          const error = new Error("The operation was aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    globalThis.fetch = mockFetch;

    const client = createRestClient({
      baseUrl: "https://api.example.com",
      timeoutMs: 50,
      retry: { maxRetries: 0, initialDelayMs: 10, maxDelayMs: 100, backoffMultiplier: 2 },
    });

    try {
      await client.get("/test");
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      const apiError = error as ApiError;
      expect(apiError.message).toContain("Request timed out");
      expect(apiError.retryable).toBe(true);
    }
  });

  test("filters undefined query parameters", async () => {
    const client = createRestClient({ baseUrl: "https://api.example.com" });

    await client.get("/test", { foo: "bar", missing: undefined });

    expect(mockFetch).toHaveBeenCalled();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("foo=bar");
    expect(url).not.toContain("missing");
  });
});

describe("Default Configuration", () => {
  test("has reasonable rate limit defaults", () => {
    expect(DEFAULT_RATE_LIMIT.maxRequests).toBe(100);
    expect(DEFAULT_RATE_LIMIT.intervalMs).toBe(60000);
  });

  test("has reasonable retry defaults", () => {
    expect(DEFAULT_RETRY.maxRetries).toBe(3);
    expect(DEFAULT_RETRY.initialDelayMs).toBe(1000);
    expect(DEFAULT_RETRY.maxDelayMs).toBe(30000);
    expect(DEFAULT_RETRY.backoffMultiplier).toBe(2);
  });
});
