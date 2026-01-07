/**
 * TavilyClient Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";
process.env.CREAM_BROKER = "ALPACA";

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createTavilyClientFromEnv, TavilyClient, TavilyResponseSchema } from "./tavily.js";

// ============================================
// Mock Helpers
// ============================================

/**
 * Create a mock fetch function that has the required `preconnect` property.
 * Bun's fetch has a preconnect method that must be present on the mock.
 */
function createMockFetch<T extends (...args: Parameters<typeof fetch>) => Promise<Response>>(
  implementation: T
): typeof fetch {
  const mockFn = mock(implementation);
  // Add preconnect stub to satisfy Bun's fetch type
  const typedMock = mockFn as unknown as typeof fetch;
  (typedMock as typeof fetch & { preconnect: () => void }).preconnect = () => {};
  return typedMock;
}

// ============================================
// Schema Tests
// ============================================

describe("TavilyResponseSchema", () => {
  test("parses valid response", () => {
    const response = {
      query: "test query",
      results: [
        {
          title: "Test Title",
          url: "https://example.com",
          content: "Test content",
          score: 0.95,
        },
      ],
      response_time: 1.5,
    };

    const parsed = TavilyResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.query).toBe("test query");
      expect(parsed.data.results).toHaveLength(1);
      expect(parsed.data.results[0]?.title).toBe("Test Title");
    }
  });

  test("parses response with optional fields", () => {
    const response = {
      query: "test query",
      results: [
        {
          title: "Test Title",
          url: "https://example.com",
          content: "Test content",
          score: 0.95,
          published_date: "2024-01-15",
          raw_content: "Full raw content here",
        },
      ],
      response_time: 1.5,
      answer: "AI-generated answer",
      follow_up_questions: ["Follow-up 1", "Follow-up 2"],
    };

    const parsed = TavilyResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.answer).toBe("AI-generated answer");
      expect(parsed.data.follow_up_questions).toHaveLength(2);
      expect(parsed.data.results[0]?.published_date).toBe("2024-01-15");
      expect(parsed.data.results[0]?.raw_content).toBe("Full raw content here");
    }
  });

  test("rejects invalid response", () => {
    const response = {
      query: "test query",
      // Missing required 'results' field
      response_time: 1.5,
    };

    const parsed = TavilyResponseSchema.safeParse(response);
    expect(parsed.success).toBe(false);
  });

  test("rejects result with missing required fields", () => {
    const response = {
      query: "test query",
      results: [
        {
          title: "Test Title",
          // Missing url, content, score
        },
      ],
      response_time: 1.5,
    };

    const parsed = TavilyResponseSchema.safeParse(response);
    expect(parsed.success).toBe(false);
  });
});

// ============================================
// TavilyClient Tests
// ============================================

describe("TavilyClient", () => {
  describe("Configuration", () => {
    test("uses default configuration", () => {
      const client = new TavilyClient({ apiKey: "test-key" });
      expect(client.hasApiKey()).toBe(true);
    });

    test("accepts custom configuration", () => {
      const client = new TavilyClient({
        apiKey: "test-key",
        baseUrl: "https://custom.tavily.com",
        timeout: 60000,
        retries: 5,
        retryDelay: 2000,
      });
      expect(client.hasApiKey()).toBe(true);
    });

    test("reports no API key when empty", () => {
      const client = new TavilyClient({ apiKey: "" });
      expect(client.hasApiKey()).toBe(false);
    });
  });

  describe("Input Validation", () => {
    const client = new TavilyClient({ apiKey: "test-key" });

    test("rejects empty query", async () => {
      const result = await client.search({ query: "" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("empty");
        expect(result.retryable).toBe(false);
      }
    });

    test("rejects whitespace-only query", async () => {
      const result = await client.search({ query: "   " });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("empty");
      }
    });

    test("rejects invalid maxResults (too low)", async () => {
      const result = await client.search({ query: "test", maxResults: 0 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("maxResults");
        expect(result.retryable).toBe(false);
      }
    });

    test("rejects invalid maxResults (too high)", async () => {
      const result = await client.search({ query: "test", maxResults: 25 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("maxResults");
      }
    });

    test("rejects too many includeDomains", async () => {
      const domains = Array.from({ length: 301 }, (_, i) => `domain${i}.com`);
      const result = await client.search({ query: "test", includeDomains: domains });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("includeDomains");
        expect(result.error).toContain("300");
      }
    });

    test("rejects too many excludeDomains", async () => {
      const domains = Array.from({ length: 151 }, (_, i) => `domain${i}.com`);
      const result = await client.search({ query: "test", excludeDomains: domains });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("excludeDomains");
        expect(result.error).toContain("150");
      }
    });
  });

  describe("API Mocking", () => {
    const originalFetch = globalThis.fetch;

    afterAll(() => {
      globalThis.fetch = originalFetch;
    });

    test("returns success on valid response", async () => {
      const mockResponse = {
        query: "test query",
        results: [
          {
            title: "Test Result",
            url: "https://example.com",
            content: "Test content",
            score: 0.9,
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

      const client = new TavilyClient({ apiKey: "test-key" });
      const result = await client.search({ query: "test query" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toBe("test query");
        expect(result.data.results).toHaveLength(1);
      }
    });

    test("handles 401 unauthorized error", async () => {
      globalThis.fetch = createMockFetch(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Invalid API key" }), {
            status: 401,
            statusText: "Unauthorized",
          })
        )
      );

      const client = new TavilyClient({ apiKey: "invalid-key", retries: 1 });
      const result = await client.search({ query: "test" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("401");
        expect(result.retryable).toBe(false);
      }
    });

    test("handles 400 bad request error", async () => {
      globalThis.fetch = createMockFetch(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Bad request" }), {
            status: 400,
            statusText: "Bad Request",
          })
        )
      );

      const client = new TavilyClient({ apiKey: "test-key", retries: 1 });
      const result = await client.search({ query: "test" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("400");
        expect(result.retryable).toBe(false);
      }
    });

    test("retries on 500 server error", async () => {
      let callCount = 0;
      globalThis.fetch = createMockFetch(() => {
        callCount++;
        if (callCount < 2) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: "Internal server error" }), {
              status: 500,
              statusText: "Internal Server Error",
            })
          );
        }
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

      const client = new TavilyClient({ apiKey: "test-key", retries: 3, retryDelay: 10 });
      const result = await client.search({ query: "test" });

      expect(result.success).toBe(true);
      expect(callCount).toBe(2);
    });

    test("retries on 429 rate limit", async () => {
      let callCount = 0;
      globalThis.fetch = createMockFetch(() => {
        callCount++;
        if (callCount < 2) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
              status: 429,
              statusText: "Too Many Requests",
            })
          );
        }
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

      const client = new TavilyClient({ apiKey: "test-key", retries: 3, retryDelay: 10 });
      const result = await client.search({ query: "test" });

      expect(result.success).toBe(true);
      expect(callCount).toBe(2);
    });

    test("returns error after max retries exhausted", async () => {
      globalThis.fetch = createMockFetch(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Server error" }), {
            status: 500,
            statusText: "Internal Server Error",
          })
        )
      );

      const client = new TavilyClient({ apiKey: "test-key", retries: 2, retryDelay: 10 });
      const result = await client.search({ query: "test" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.retryable).toBe(true);
      }
    });

    test("handles network error", async () => {
      globalThis.fetch = createMockFetch(() => Promise.reject(new Error("Network error")));

      const client = new TavilyClient({ apiKey: "test-key", retries: 1, retryDelay: 10 });
      const result = await client.search({ query: "test" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Network error");
        expect(result.retryable).toBe(true);
      }
    });

    test("handles invalid JSON response", async () => {
      globalThis.fetch = createMockFetch(() =>
        Promise.resolve(
          new Response("not json", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      const client = new TavilyClient({ apiKey: "test-key", retries: 1 });
      const result = await client.search({ query: "test" });

      expect(result.success).toBe(false);
    });

    test("handles response schema validation failure", async () => {
      globalThis.fetch = createMockFetch(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              // Invalid response - missing required fields
              query: "test",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );

      const client = new TavilyClient({ apiKey: "test-key", retries: 1 });
      const result = await client.search({ query: "test" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Invalid Tavily response");
        expect(result.retryable).toBe(false);
      }
    });
  });

  describe("Request Parameters", () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: Record<string, unknown> | null = null;

    beforeAll(() => {
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
    });

    afterAll(() => {
      globalThis.fetch = originalFetch;
    });

    test("includes all optional parameters", async () => {
      const client = new TavilyClient({ apiKey: "test-key" });
      await client.search({
        query: "test query",
        topic: "finance",
        timeRange: "week",
        maxResults: 10,
        includeDomains: ["example.com", "test.com"],
        excludeDomains: ["spam.com"],
        includeRawContent: "markdown",
        searchDepth: "advanced",
        includeAnswer: true,
      });

      expect(capturedBody).not.toBeNull();
      expect(capturedBody?.query).toBe("test query");
      expect(capturedBody?.topic).toBe("finance");
      expect(capturedBody?.time_range).toBe("week");
      expect(capturedBody?.max_results).toBe(10);
      expect(capturedBody?.include_domains).toEqual(["example.com", "test.com"]);
      expect(capturedBody?.exclude_domains).toEqual(["spam.com"]);
      expect(capturedBody?.include_raw_content).toBe("markdown");
      expect(capturedBody?.search_depth).toBe("advanced");
      expect(capturedBody?.include_answer).toBe(true);
    });

    test("omits undefined optional parameters", async () => {
      const client = new TavilyClient({ apiKey: "test-key" });
      await client.search({ query: "test query" });

      expect(capturedBody).not.toBeNull();
      expect(capturedBody?.query).toBe("test query");
      expect(capturedBody?.api_key).toBe("test-key");
      expect(capturedBody?.topic).toBeUndefined();
      expect(capturedBody?.time_range).toBeUndefined();
      expect(capturedBody?.max_results).toBeUndefined();
    });

    test("trims query whitespace", async () => {
      const client = new TavilyClient({ apiKey: "test-key" });
      await client.search({ query: "  test query  " });

      expect(capturedBody?.query).toBe("test query");
    });
  });
});

// ============================================
// createTavilyClientFromEnv Tests
// ============================================

describe("createTavilyClientFromEnv", () => {
  const originalEnv = process.env.TAVILY_API_KEY;

  afterAll(() => {
    if (originalEnv) {
      process.env.TAVILY_API_KEY = originalEnv;
    } else {
      delete process.env.TAVILY_API_KEY;
    }
  });

  test("returns null when no API key in env", () => {
    delete process.env.TAVILY_API_KEY;
    const client = createTavilyClientFromEnv();
    expect(client).toBeNull();
  });

  test("returns client when API key is set", () => {
    process.env.TAVILY_API_KEY = "env-test-key";
    const client = createTavilyClientFromEnv();
    expect(client).not.toBeNull();
    expect(client?.hasApiKey()).toBe(true);
  });
});
