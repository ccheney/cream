/**
 * Tests for Polymarket API client
 */

import { describe, expect, it } from "bun:test";
import {
  ClobOrderbookSchema,
  ClobPriceSchema,
  DEFAULT_SEARCH_QUERIES,
  POLYMARKET_RATE_LIMITS,
  PolymarketClient,
  PolymarketEventSchema,
  PolymarketMarketSchema,
} from "./client";

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
});
