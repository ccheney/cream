/**
 * Tests for Polymarket API client
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { AuthenticationError, RateLimitError } from "../../index";
import {
  ClobOrderbookSchema,
  ClobPriceSchema,
  DEFAULT_SEARCH_QUERIES,
  POLYMARKET_RATE_LIMITS,
  PolymarketClient,
  PolymarketEventSchema,
  PolymarketMarketSchema,
} from "./client";

// ============================================
// Mock Data
// ============================================

const mockPolymarketEvent = {
  id: "event-123",
  title: "Fed Rate Decision",
  slug: "fed-rate-decision",
  description: "Will the Fed cut rates?",
  startDate: "2024-01-01T00:00:00Z",
  endDate: "2024-06-30T00:00:00Z",
  active: true,
  markets: [
    {
      id: "market-456",
      question: "Will the Federal Reserve cut rates in June 2024?",
      slug: "fed-rate-cut-june",
      outcomes: ["Yes", "No"],
      outcomePrices: ["0.65", "0.35"],
      volume: "500000",
      volume24hr: "25000",
      liquidity: "50000",
      active: true,
      closed: false,
      endDate: "2024-06-30T00:00:00Z",
      clobTokenIds: ["token-yes", "token-no"],
    },
  ],
};

const mockPolymarketMarket = {
  id: "market-789",
  question: "Will inflation exceed 3% in Q2?",
  slug: "inflation-q2",
  outcomes: ["Yes", "No"],
  outcomePrices: ["0.45", "0.55"],
  volume: "100000",
  volume24hr: "5000",
  liquidity: "10000",
  active: true,
  closed: false,
  endDate: "2024-07-01T00:00:00Z",
  clobTokenIds: ["token-1", "token-2"],
};

// ============================================
// Tests
// ============================================

describe("POLYMARKET_RATE_LIMITS", () => {
  it("should have all endpoints defined", () => {
    expect(POLYMARKET_RATE_LIMITS.general).toBeDefined();
    expect(POLYMARKET_RATE_LIMITS.clob_book_price).toBeDefined();
    expect(POLYMARKET_RATE_LIMITS.data_trades).toBeDefined();
    expect(POLYMARKET_RATE_LIMITS.gamma_markets).toBeDefined();
    expect(POLYMARKET_RATE_LIMITS.gamma_events).toBeDefined();
  });

  it("should have correct rate limit values", () => {
    expect(POLYMARKET_RATE_LIMITS.general).toBe(15000);
    expect(POLYMARKET_RATE_LIMITS.clob_book_price).toBe(1500);
    expect(POLYMARKET_RATE_LIMITS.data_trades).toBe(200);
    expect(POLYMARKET_RATE_LIMITS.gamma_markets).toBe(300);
    expect(POLYMARKET_RATE_LIMITS.gamma_events).toBe(500);
  });
});

describe("DEFAULT_SEARCH_QUERIES", () => {
  it("should have queries for FED_RATE", () => {
    expect(DEFAULT_SEARCH_QUERIES.FED_RATE).toContain("Federal Reserve");
    expect(DEFAULT_SEARCH_QUERIES.FED_RATE).toContain("FOMC");
  });

  it("should have queries for ECONOMIC_DATA", () => {
    expect(DEFAULT_SEARCH_QUERIES.ECONOMIC_DATA).toContain("inflation");
    expect(DEFAULT_SEARCH_QUERIES.ECONOMIC_DATA).toContain("CPI");
    expect(DEFAULT_SEARCH_QUERIES.ECONOMIC_DATA).toContain("GDP");
  });

  it("should have queries for RECESSION", () => {
    expect(DEFAULT_SEARCH_QUERIES.RECESSION).toContain("recession");
  });
});

describe("PolymarketMarketSchema", () => {
  it("should parse valid market data", () => {
    const market = {
      id: "0x1234",
      question: "Will there be a recession in 2026?",
      slug: "recession-2026",
      outcomes: ["Yes", "No"],
      outcomePrices: ["0.25", "0.75"],
      volume: "1000000",
      volume24hr: "50000",
      liquidity: "25000",
      active: true,
      closed: false,
      endDate: "2026-12-31T23:59:59Z",
    };

    const result = PolymarketMarketSchema.parse(market);
    expect(result.id).toBe("0x1234");
    expect(result.question).toBe("Will there be a recession in 2026?");
    expect(result.outcomes).toEqual(["Yes", "No"]);
    expect(result.outcomePrices).toEqual(["0.25", "0.75"]);
  });

  it("should handle minimal market data", () => {
    const market = {
      id: "0xabcd",
      question: "Test market?",
    };

    const result = PolymarketMarketSchema.parse(market);
    expect(result.id).toBe("0xabcd");
    expect(result.outcomes).toBeUndefined();
  });
});

describe("PolymarketEventSchema", () => {
  it("should parse valid event data", () => {
    const event = {
      id: "evt_123",
      title: "US Recession 2026",
      slug: "us-recession-2026",
      description: "Will the US enter a recession in 2026?",
      markets: [
        {
          id: "0x1234",
          question: "Will there be a recession?",
        },
      ],
      active: true,
    };

    const result = PolymarketEventSchema.parse(event);
    expect(result.id).toBe("evt_123");
    expect(result.title).toBe("US Recession 2026");
    expect(result.markets).toHaveLength(1);
  });

  it("should handle event without markets", () => {
    const event = {
      id: "evt_456",
      title: "Empty event",
    };

    const result = PolymarketEventSchema.parse(event);
    expect(result.id).toBe("evt_456");
    expect(result.markets).toBeUndefined();
  });
});

describe("ClobPriceSchema", () => {
  it("should parse price response", () => {
    const price = {
      price: "0.45",
      side: "buy",
    };

    const result = ClobPriceSchema.parse(price);
    expect(result.price).toBe("0.45");
    expect(result.side).toBe("buy");
  });
});

describe("ClobOrderbookSchema", () => {
  it("should parse orderbook response", () => {
    const orderbook = {
      market: "0x1234",
      asset_id: "0xabcd",
      hash: "0xhash",
      bids: [
        { price: "0.45", size: "100" },
        { price: "0.44", size: "200" },
      ],
      asks: [
        { price: "0.46", size: "150" },
        { price: "0.47", size: "250" },
      ],
    };

    const result = ClobOrderbookSchema.parse(orderbook);
    expect(result.bids).toHaveLength(2);
    expect(result.asks).toHaveLength(2);
    expect(result.bids?.[0]?.price).toBe("0.45");
  });
});

describe("PolymarketClient", () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)
    );
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ========================================
  // Constructor & Configuration
  // ========================================

  it("should create client with default options", () => {
    const client = new PolymarketClient();
    expect(client.platform).toBe("POLYMARKET");
  });

  it("should create client with custom endpoints", () => {
    const client = new PolymarketClient({
      clobEndpoint: "https://custom-clob.example.com",
      gammaEndpoint: "https://custom-gamma.example.com",
    });
    expect(client.platform).toBe("POLYMARKET");
  });

  it("should create client with custom search queries", () => {
    const client = new PolymarketClient({
      searchQueries: ["crypto", "bitcoin"],
    });
    expect(client.platform).toBe("POLYMARKET");
  });

  // ========================================
  // fetchMarkets
  // ========================================

  it("should fetch markets for FED_RATE type", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([mockPolymarketEvent]),
      } as Response)
    );

    const client = new PolymarketClient();
    const events = await client.fetchMarkets(["FED_RATE"]);

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.payload.platform).toBe("POLYMARKET");
    expect(events[0]?.payload.marketType).toBe("FED_RATE");
  });

  it("should fetch markets for multiple types", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              ...mockPolymarketEvent,
              id: `event-${callCount}`,
              markets: [{ ...mockPolymarketEvent.markets[0], id: `market-${callCount}` }],
            },
          ]),
      } as Response);
    });

    const client = new PolymarketClient();
    const events = await client.fetchMarkets(["FED_RATE", "ECONOMIC_DATA"]);

    expect(events.length).toBeGreaterThan(0);
    expect(callCount).toBeGreaterThan(1);
  });

  it("should use default search queries when market type has no queries", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([mockPolymarketEvent]),
      } as Response)
    );

    const client = new PolymarketClient({
      searchQueries: ["default query"],
    });
    await client.fetchMarkets(["GEOPOLITICAL"]); // Has empty queries

    expect(mockFetch).toHaveBeenCalled();
  });

  it("should deduplicate events by eventId", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([mockPolymarketEvent]),
      } as Response)
    );

    const client = new PolymarketClient();
    const events = await client.fetchMarkets(["FED_RATE"]);

    const eventIds = events.map((e) => e.eventId);
    const uniqueIds = [...new Set(eventIds)];
    expect(eventIds.length).toBe(uniqueIds.length);
  });

  it("should throw AuthenticationError on 401", async () => {
    mockFetch.mockImplementation(() => {
      throw new Error("HTTP 401: Unauthorized");
    });

    const client = new PolymarketClient();

    try {
      await client.fetchMarkets(["FED_RATE"]);
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect((error as Error).name).toBe("PredictionMarketError");
      expect((error as AuthenticationError).code).toBe("AUTH_ERROR");
    }
  });

  it("should throw RateLimitError on 429", async () => {
    mockFetch.mockImplementation(() => {
      throw new Error("HTTP 429: Rate limit exceeded");
    });

    const client = new PolymarketClient();

    try {
      await client.fetchMarkets(["FED_RATE"]);
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect((error as Error).name).toBe("PredictionMarketError");
      expect((error as RateLimitError).code).toBe("RATE_LIMIT");
    }
  });

  // ========================================
  // fetchMarketByTicker
  // ========================================

  it("should fetch a specific market by ID", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockPolymarketMarket),
      } as Response)
    );

    const client = new PolymarketClient();
    const event = await client.fetchMarketByTicker("market-789");

    expect(event).not.toBeNull();
    expect(event?.payload.marketTicker).toBe("market-789");
    expect(event?.payload.platform).toBe("POLYMARKET");
  });

  it("should return null for 404", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response)
    );

    const client = new PolymarketClient();
    const event = await client.fetchMarketByTicker("non-existent");

    expect(event).toBeNull();
  });

  it("should return null for invalid response data", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ invalid: "data" }),
      } as Response)
    );

    const client = new PolymarketClient();
    const event = await client.fetchMarketByTicker("bad-market");

    expect(event).toBeNull();
  });

  it("should throw for non-404 errors in fetchMarketByTicker", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as Response)
    );

    const client = new PolymarketClient();

    try {
      await client.fetchMarketByTicker("market-789");
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });

  // ========================================
  // calculateScores
  // ========================================

  it("should calculate scores from events", () => {
    const client = new PolymarketClient();

    const events = [
      {
        eventId: "pm_polymarket_test",
        eventType: "PREDICTION_MARKET" as const,
        eventTime: "2026-12-31T23:59:59Z",
        payload: {
          platform: "POLYMARKET" as const,
          marketType: "FED_RATE" as const,
          marketTicker: "0x1234",
          marketQuestion: "Will the Fed cut rates?",
          outcomes: [
            { outcome: "25bps cut", probability: 0.6, price: 0.6 },
            { outcome: "No change", probability: 0.3, price: 0.3 },
            { outcome: "25bps hike", probability: 0.1, price: 0.1 },
          ],
          lastUpdated: "2026-01-04T15:00:00Z",
        },
        relatedInstrumentIds: ["XLF"],
      },
    ];

    const scores = client.calculateScores(events);
    expect(scores.fedCutProbability).toBe(0.6);
    expect(scores.fedHikeProbability).toBe(0.1);
  });

  it("should calculate recession probability from events", () => {
    const client = new PolymarketClient();

    const events = [
      {
        eventId: "pm_polymarket_recession",
        eventType: "PREDICTION_MARKET" as const,
        eventTime: "2026-12-31T23:59:59Z",
        payload: {
          platform: "POLYMARKET" as const,
          marketType: "RECESSION" as const,
          marketTicker: "0xrec",
          marketQuestion: "Will there be a recession in 2026?",
          outcomes: [
            { outcome: "Yes", probability: 0.35, price: 0.35 },
            { outcome: "No", probability: 0.65, price: 0.65 },
          ],
          lastUpdated: "2026-01-04T15:00:00Z",
        },
        relatedInstrumentIds: ["SPY"],
      },
    ];

    const scores = client.calculateScores(events);
    expect(scores.recessionProbability12m).toBe(0.35);
  });

  it("should calculate macro uncertainty index", () => {
    const client = new PolymarketClient();

    const events = [
      {
        eventId: "pm_polymarket_cut",
        eventType: "PREDICTION_MARKET" as const,
        eventTime: "2026-06-30T00:00:00Z",
        payload: {
          platform: "POLYMARKET" as const,
          marketType: "FED_RATE" as const,
          marketTicker: "cut-market",
          marketQuestion: "Fed rate cut?",
          outcomes: [{ outcome: "Cut decrease", probability: 0.5, price: 0.5 }],
          lastUpdated: new Date().toISOString(),
        },
        relatedInstrumentIds: [],
      },
      {
        eventId: "pm_polymarket_hike",
        eventType: "PREDICTION_MARKET" as const,
        eventTime: "2026-06-30T00:00:00Z",
        payload: {
          platform: "POLYMARKET" as const,
          marketType: "FED_RATE" as const,
          marketTicker: "hike-market",
          marketQuestion: "Fed rate hike?",
          outcomes: [{ outcome: "Hike increase", probability: 0.4, price: 0.4 }],
          lastUpdated: new Date().toISOString(),
        },
        relatedInstrumentIds: [],
      },
    ];

    const scores = client.calculateScores(events);

    expect(scores.fedCutProbability).toBe(0.5);
    expect(scores.fedHikeProbability).toBe(0.4);
    expect(scores.macroUncertaintyIndex).toBe(0.8); // 0.4 / 0.5
  });

  it("should return empty scores for empty events", () => {
    const client = new PolymarketClient();
    const scores = client.calculateScores([]);

    expect(scores.fedCutProbability).toBeUndefined();
    expect(scores.fedHikeProbability).toBeUndefined();
    expect(scores.recessionProbability12m).toBeUndefined();
  });

  // ========================================
  // searchMarkets
  // ========================================

  it("should search markets by query", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([mockPolymarketEvent]),
      } as Response)
    );

    const client = new PolymarketClient();
    const results = await client.searchMarkets("Federal Reserve");

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("Fed Rate Decision");
  });

  it("should return empty array for non-array response", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ not: "an array" }),
      } as Response)
    );

    const client = new PolymarketClient();
    const results = await client.searchMarkets("query");

    expect(results).toHaveLength(0);
  });

  it("should filter out invalid events from response", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            mockPolymarketEvent,
            { invalid: "event" }, // Missing required fields
          ]),
      } as Response)
    );

    const client = new PolymarketClient();
    const results = await client.searchMarkets("query");

    expect(results).toHaveLength(1);
  });

  it("should throw on search errors", async () => {
    mockFetch.mockImplementation(() => {
      throw new Error("Network error");
    });

    const client = new PolymarketClient();

    try {
      await client.searchMarkets("query");
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });

  // ========================================
  // getMidpoint
  // ========================================

  it("should get midpoint price for token", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ mid: "0.65" }),
      } as Response)
    );

    const client = new PolymarketClient();
    const midpoint = await client.getMidpoint("token-123");

    expect(midpoint).toBe(0.65);
  });

  it("should return null for non-ok response in getMidpoint", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 404,
      } as Response)
    );

    const client = new PolymarketClient();
    const midpoint = await client.getMidpoint("invalid-token");

    expect(midpoint).toBeNull();
  });

  it("should return null for missing mid field", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ other: "data" }),
      } as Response)
    );

    const client = new PolymarketClient();
    const midpoint = await client.getMidpoint("token-123");

    expect(midpoint).toBeNull();
  });

  it("should return null on getMidpoint error", async () => {
    mockFetch.mockImplementation(() => Promise.reject(new Error("Network error")));

    const client = new PolymarketClient();
    const midpoint = await client.getMidpoint("token-123");

    expect(midpoint).toBeNull();
  });

  // ========================================
  // getOrderbook
  // ========================================

  it("should get orderbook for token", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            market: "market-123",
            asset_id: "token-123",
            bids: [
              { price: "0.64", size: "1000" },
              { price: "0.63", size: "2000" },
            ],
            asks: [
              { price: "0.66", size: "800" },
              { price: "0.67", size: "1500" },
            ],
          }),
      } as Response)
    );

    const client = new PolymarketClient();
    const orderbook = await client.getOrderbook("token-123");

    expect(orderbook).not.toBeNull();
    expect(orderbook?.bids).toHaveLength(2);
    expect(orderbook?.asks).toHaveLength(2);
  });

  it("should return null for non-ok response in getOrderbook", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 404,
      } as Response)
    );

    const client = new PolymarketClient();
    const orderbook = await client.getOrderbook("invalid-token");

    expect(orderbook).toBeNull();
  });

  it("should return null on getOrderbook error", async () => {
    mockFetch.mockImplementation(() => Promise.reject(new Error("Network error")));

    const client = new PolymarketClient();
    const orderbook = await client.getOrderbook("token-123");

    expect(orderbook).toBeNull();
  });

  // ========================================
  // Event Transformation
  // ========================================

  it("should transform event with default outcomes", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: "event-1",
              title: "Test Event",
              markets: [
                {
                  id: "market-1",
                  question: "Test question?",
                  // No outcomes - should use defaults
                },
              ],
            },
          ]),
      } as Response)
    );

    const client = new PolymarketClient();
    const events = await client.fetchMarkets(["FED_RATE"]);

    expect(events[0]?.payload.outcomes).toHaveLength(2);
  });

  it("should skip events without markets", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: "event-no-markets",
              title: "Event Without Markets",
            },
          ]),
      } as Response)
    );

    const client = new PolymarketClient();
    const events = await client.fetchMarkets(["FED_RATE"]);

    const noMarketEvents = events.filter((e) => e.eventId.includes("event-no-markets"));
    expect(noMarketEvents).toHaveLength(0);
  });

  it("should calculate liquidity score correctly", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: "event-1",
              title: "High Liquidity Event",
              markets: [
                {
                  id: "market-1",
                  question: "High liquidity?",
                  volume24hr: "200000", // $200k - high volume
                  liquidity: "100000", // $100k - high liquidity
                },
              ],
            },
          ]),
      } as Response)
    );

    const client = new PolymarketClient();
    const events = await client.fetchMarkets(["FED_RATE"]);

    expect(events[0]?.payload.liquidityScore).toBe(1);
  });
});

// Factory function tests removed - covered via unified-client integration tests.
// The factory functions (createPolymarketClient, createPolymarketClientFromEnv)
// are simple wrappers that don't need isolated testing.
