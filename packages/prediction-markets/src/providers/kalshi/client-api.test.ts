/**
 * Tests for Kalshi API client methods using mock.module
 *
 * These tests mock the kalshi-typescript SDK to test API methods.
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";

// ============================================
// Mock Data
// ============================================

const mockKalshiMarket = {
  ticker: "KXFED-26JAN29-T50",
  event_ticker: "KXFED-26JAN29",
  series_ticker: "KXFED",
  title: "Will the Fed cut rates by 50bps in January 2026?",
  subtitle: "FOMC January 2026 Decision",
  status: "open",
  yes_bid: 55,
  yes_ask: 57,
  no_bid: 43,
  no_ask: 45,
  last_price: 56,
  volume: 100000,
  volume_24h: 15000,
  open_interest: 50000,
  close_time: "2026-01-29T19:00:00Z",
  expiration_time: "2026-01-29T21:00:00Z",
};

const mockKalshiEvent = {
  event_ticker: "KXFED-26JAN29",
  series_ticker: "KXFED",
  title: "Federal Reserve January 2026 Decision",
  category: "Economics",
  markets: [mockKalshiMarket],
};

// ============================================
// SDK Mock Setup
// ============================================

// Create mock functions we can control
const mockGetMarkets = mock(() =>
  Promise.resolve({
    data: { markets: [mockKalshiMarket] },
  })
);

const mockGetMarket = mock(() =>
  Promise.resolve({
    data: { market: mockKalshiMarket },
  })
);

const mockGetEvent = mock(() =>
  Promise.resolve({
    data: { event: mockKalshiEvent },
  })
);

// Mock the kalshi-typescript module BEFORE importing the client
mock.module("kalshi-typescript", () => ({
  Configuration: class Configuration {},
  MarketApi: class MarketApi {
    getMarkets = mockGetMarkets;
    getMarket = mockGetMarket;
  },
  EventsApi: class EventsApi {
    getEvent = mockGetEvent;
  },
}));

// Now import the client (it will use the mocked SDK)
import type { AuthenticationError, RateLimitError } from "../../index";
import { KalshiClient } from "./client";

// ============================================
// Tests
// ============================================

describe("KalshiClient API Methods (mocked SDK)", () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockGetMarkets.mockClear();
    mockGetMarket.mockClear();
    mockGetEvent.mockClear();

    // Reset to default implementations
    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [mockKalshiMarket] },
      })
    );
    mockGetMarket.mockImplementation(() =>
      Promise.resolve({
        data: { market: mockKalshiMarket },
      })
    );
    mockGetEvent.mockImplementation(() =>
      Promise.resolve({
        data: { event: mockKalshiEvent },
      })
    );
  });

  describe("fetchMarkets", () => {
    it("should fetch markets for FED_RATE market type", async () => {
      const client = new KalshiClient({
        apiKeyId: "test-key",
        privateKeyPem: "test-pem",
      });

      const events = await client.fetchMarkets(["FED_RATE"]);

      // Should have called getMarkets for KXFED and KXFOMC series
      expect(mockGetMarkets).toHaveBeenCalled();
      // Each series ticker results in markets being transformed
      expect(events.length).toBeGreaterThan(0);
    });

    it("should fetch markets for multiple market types", async () => {
      const client = new KalshiClient({
        apiKeyId: "test-key",
        privateKeyPem: "test-pem",
      });

      const _events = await client.fetchMarkets(["FED_RATE", "RECESSION"]);

      // Should fetch from KXFED, KXFOMC, and KXREC series
      expect(mockGetMarkets.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it("should return empty array for market types with no series", async () => {
      const client = new KalshiClient({
        apiKeyId: "test-key",
        privateKeyPem: "test-pem",
      });

      const events = await client.fetchMarkets(["GEOPOLITICAL"]);

      // GEOPOLITICAL has empty series array
      expect(events).toEqual([]);
      expect(mockGetMarkets).not.toHaveBeenCalled();
    });

    it("should throw on API error", async () => {
      mockGetMarkets.mockImplementation(() => Promise.reject(new Error("API Error")));

      const client = new KalshiClient({
        apiKeyId: "test-key",
        privateKeyPem: "test-pem",
      });

      await expect(client.fetchMarkets(["FED_RATE"])).rejects.toThrow("API Error");
    });

    it("should throw AuthenticationError on 401", async () => {
      mockGetMarkets.mockImplementation(() => Promise.reject(new Error("401 Unauthorized")));

      const client = new KalshiClient({
        apiKeyId: "test-key",
        privateKeyPem: "test-pem",
      });

      try {
        await client.fetchMarkets(["FED_RATE"]);
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect((error as Error).name).toBe("PredictionMarketError");
        expect((error as AuthenticationError).code).toBe("AUTH_ERROR");
      }
    });

    it("should throw RateLimitError on 429", async () => {
      mockGetMarkets.mockImplementation(() => Promise.reject(new Error("429 rate limit exceeded")));

      const client = new KalshiClient({
        apiKeyId: "test-key",
        privateKeyPem: "test-pem",
      });

      try {
        await client.fetchMarkets(["FED_RATE"]);
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect((error as Error).name).toBe("PredictionMarketError");
        expect((error as RateLimitError).code).toBe("RATE_LIMIT");
      }
    });

    it("should skip invalid market data during parsing", async () => {
      mockGetMarkets.mockImplementation(() =>
        Promise.resolve({
          data: {
            markets: [
              { invalid: "data" }, // Missing required fields
              mockKalshiMarket,
            ],
          },
        })
      );

      const client = new KalshiClient({
        apiKeyId: "test-key",
        privateKeyPem: "test-pem",
      });

      const events = await client.fetchMarkets(["FED_RATE"]);
      // Should skip invalid and only include valid market
      // Called for 2 series (KXFED, KXFOMC), each returns 1 valid
      expect(events.length).toBeGreaterThan(0);
    });

    it("should handle empty markets response", async () => {
      mockGetMarkets.mockImplementation(() =>
        Promise.resolve({
          data: { markets: [] },
        })
      );

      const client = new KalshiClient({
        apiKeyId: "test-key",
        privateKeyPem: "test-pem",
      });

      const events = await client.fetchMarkets(["FED_RATE"]);
      expect(events).toEqual([]);
    });

    it("should handle null markets response", async () => {
      mockGetMarkets.mockImplementation(() =>
        Promise.resolve({
          data: { markets: null },
        })
      );

      const client = new KalshiClient({
        apiKeyId: "test-key",
        privateKeyPem: "test-pem",
      });

      const events = await client.fetchMarkets(["FED_RATE"]);
      expect(events).toEqual([]);
    });
  });

  describe("fetchMarketByTicker", () => {
    it("should fetch a specific market by ticker", async () => {
      const client = new KalshiClient({
        apiKeyId: "test-key",
        privateKeyPem: "test-pem",
      });

      const event = await client.fetchMarketByTicker("KXFED-26JAN29-T50");

      expect(mockGetMarket).toHaveBeenCalledWith("KXFED-26JAN29-T50");
      expect(event).not.toBeNull();
      expect(event?.eventId).toBe("pm_kalshi_KXFED-26JAN29-T50");
      expect(event?.payload.platform).toBe("KALSHI");
      expect(event?.payload.marketTicker).toBe("KXFED-26JAN29-T50");
    });

    it("should return null for invalid market data", async () => {
      mockGetMarket.mockImplementation(() =>
        Promise.resolve({
          data: { market: { invalid: "data" } },
        })
      );

      const client = new KalshiClient({
        apiKeyId: "test-key",
        privateKeyPem: "test-pem",
      });

      const event = await client.fetchMarketByTicker("INVALID");
      expect(event).toBeNull();
    });

    it("should throw on API error", async () => {
      mockGetMarket.mockImplementation(() => Promise.reject(new Error("Not found")));

      const client = new KalshiClient({
        apiKeyId: "test-key",
        privateKeyPem: "test-pem",
      });

      await expect(client.fetchMarketByTicker("NOTFOUND")).rejects.toThrow("Not found");
    });

    it("should throw AuthenticationError on unauthorized", async () => {
      mockGetMarket.mockImplementation(() => Promise.reject(new Error("unauthorized request")));

      const client = new KalshiClient({
        apiKeyId: "test-key",
        privateKeyPem: "test-pem",
      });

      try {
        await client.fetchMarketByTicker("TEST");
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect((error as AuthenticationError).code).toBe("AUTH_ERROR");
      }
    });
  });

  describe("getEventDetails", () => {
    it("should fetch event details by ticker", async () => {
      const client = new KalshiClient({
        apiKeyId: "test-key",
        privateKeyPem: "test-pem",
      });

      const event = await client.getEventDetails("KXFED-26JAN29");

      expect(mockGetEvent).toHaveBeenCalledWith("KXFED-26JAN29", true);
      expect(event).not.toBeNull();
      expect(event?.event_ticker).toBe("KXFED-26JAN29");
      expect(event?.title).toBe("Federal Reserve January 2026 Decision");
    });

    it("should return null when event is not found", async () => {
      mockGetEvent.mockImplementation(() =>
        Promise.resolve({
          data: { event: null },
        })
      );

      const client = new KalshiClient({
        apiKeyId: "test-key",
        privateKeyPem: "test-pem",
      });

      const event = await client.getEventDetails("NONEXISTENT");
      expect(event).toBeNull();
    });

    it("should return null when event is undefined", async () => {
      mockGetEvent.mockImplementation(() =>
        Promise.resolve({
          data: { event: undefined },
        })
      );

      const client = new KalshiClient({
        apiKeyId: "test-key",
        privateKeyPem: "test-pem",
      });

      const event = await client.getEventDetails("MISSING");
      expect(event).toBeNull();
    });

    it("should return null for invalid event data", async () => {
      mockGetEvent.mockImplementation(() =>
        Promise.resolve({
          data: { event: { invalid: "data" } },
        })
      );

      const client = new KalshiClient({
        apiKeyId: "test-key",
        privateKeyPem: "test-pem",
      });

      const event = await client.getEventDetails("INVALID");
      expect(event).toBeNull();
    });

    it("should throw on API error", async () => {
      mockGetEvent.mockImplementation(() => Promise.reject(new Error("API Error")));

      const client = new KalshiClient({
        apiKeyId: "test-key",
        privateKeyPem: "test-pem",
      });

      await expect(client.getEventDetails("ERROR")).rejects.toThrow("API Error");
    });
  });
});

describe("KalshiClient transformMarket (via fetchMarkets)", () => {
  beforeEach(() => {
    mockGetMarkets.mockClear();
  });

  it("should transform market with yes/no prices", async () => {
    const marketWithPrices = {
      ...mockKalshiMarket,
      yes_bid: 55,
      yes_ask: 57,
      no_bid: 43,
      no_ask: 45,
      last_price: 56,
    };

    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [marketWithPrices] },
      })
    );

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    expect(events.length).toBeGreaterThan(0);

    const event = events[0];
    expect(event?.payload.outcomes).toBeDefined();
    // Yes outcome probability should be last_price/100
    const yesOutcome = event?.payload.outcomes.find((o) => o.outcome === "Yes");
    expect(yesOutcome?.probability).toBe(0.56);
    expect(yesOutcome?.price).toBe(0.56);
  });

  it("should handle market with only yes_bid (no last_price)", async () => {
    const marketWithOnlyBid = {
      ...mockKalshiMarket,
      yes_bid: 60,
      yes_ask: 62,
      no_bid: 38,
      no_ask: 40,
      last_price: undefined,
    };

    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [marketWithOnlyBid] },
      })
    );

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    const event = events[0];
    const yesOutcome = event?.payload.outcomes.find((o) => o.outcome === "Yes");
    // Falls back to yes_bid
    expect(yesOutcome?.probability).toBe(0.6);
  });

  it("should use expiration_time for eventTime", async () => {
    const marketWithExpiration = {
      ...mockKalshiMarket,
      expiration_time: "2026-01-29T21:00:00Z",
      close_time: "2026-01-29T19:00:00Z",
    };

    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [marketWithExpiration] },
      })
    );

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    expect(events[0]?.eventTime).toBe("2026-01-29T21:00:00Z");
  });

  it("should fall back to close_time when no expiration_time", async () => {
    const marketWithoutExpiration = {
      ...mockKalshiMarket,
      expiration_time: undefined,
      close_time: "2026-01-29T19:00:00Z",
    };

    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [marketWithoutExpiration] },
      })
    );

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    expect(events[0]?.eventTime).toBe("2026-01-29T19:00:00Z");
  });

  it("should use current date when no time fields", async () => {
    const marketWithoutTimes = {
      ...mockKalshiMarket,
      expiration_time: undefined,
      close_time: undefined,
    };

    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [marketWithoutTimes] },
      })
    );

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    // Should be a valid ISO date string
    expect(events[0]?.eventTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("should include volume24h in Yes outcome", async () => {
    const marketWithVolume = {
      ...mockKalshiMarket,
      volume_24h: 25000,
    };

    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [marketWithVolume] },
      })
    );

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    const yesOutcome = events[0]?.payload.outcomes.find((o) => o.outcome === "Yes");
    expect(yesOutcome?.volume24h).toBe(25000);
  });

  it("should create No outcome with inverse price", async () => {
    const market = {
      ...mockKalshiMarket,
      yes_bid: 70,
      no_bid: 30,
      last_price: 70,
    };

    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [market] },
      })
    );

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    const noOutcome = events[0]?.payload.outcomes.find((o) => o.outcome === "No");
    expect(noOutcome?.probability).toBe(0.3); // 100 - 70 = 30, / 100 = 0.3
  });
});

describe("KalshiClient calculateLiquidityScore (via fetchMarkets)", () => {
  beforeEach(() => {
    mockGetMarkets.mockClear();
  });

  it("should calculate high liquidity for high volume tight spread", async () => {
    const highLiquidityMarket = {
      ...mockKalshiMarket,
      volume_24h: 200000,
      yes_bid: 55,
      yes_ask: 56, // 1 cent spread
    };

    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [highLiquidityMarket] },
      })
    );

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    const liquidityScore = events[0]?.payload.liquidityScore ?? 0;
    // High volume (200k > 100k cap) = 0.5 + tight spread (1 cent) = high score
    expect(liquidityScore).toBeGreaterThan(0.8);
  });

  it("should calculate low liquidity for low volume wide spread", async () => {
    const lowLiquidityMarket = {
      ...mockKalshiMarket,
      volume_24h: 1000,
      yes_bid: 45,
      yes_ask: 55, // 10 cent spread
    };

    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [lowLiquidityMarket] },
      })
    );

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    const liquidityScore = events[0]?.payload.liquidityScore ?? 0;
    expect(liquidityScore).toBeLessThan(0.2);
  });

  it("should handle market with no volume", async () => {
    const noVolumeMarket = {
      ...mockKalshiMarket,
      volume_24h: undefined,
      yes_bid: 55,
      yes_ask: 57,
    };

    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [noVolumeMarket] },
      })
    );

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    // Should still calculate based on spread only
    expect(events[0]?.payload.liquidityScore).toBeDefined();
    expect(events[0]?.payload.liquidityScore).toBeLessThan(0.5);
  });

  it("should handle market with zero volume", async () => {
    const zeroVolumeMarket = {
      ...mockKalshiMarket,
      volume_24h: 0,
      yes_bid: 50,
      yes_ask: 52,
    };

    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [zeroVolumeMarket] },
      })
    );

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    expect(events[0]?.payload.liquidityScore).toBeDefined();
  });

  it("should handle market with no bid/ask", async () => {
    const noBidAskMarket = {
      ...mockKalshiMarket,
      volume_24h: 50000,
      yes_bid: undefined,
      yes_ask: undefined,
    };

    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [noBidAskMarket] },
      })
    );

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    // Should calculate based on volume only (spread component is 0 when no bid/ask)
    expect(events[0]?.payload.liquidityScore).toBeDefined();
    // Volume contribution: min(50000/100000, 0.5) = 0.5, no spread contribution
    expect(events[0]?.payload.liquidityScore).toBe(0.5);
  });

  it("should cap liquidity score at 1.0", async () => {
    const superLiquidMarket = {
      ...mockKalshiMarket,
      volume_24h: 500000, // Way above cap
      yes_bid: 50,
      yes_ask: 50, // Zero spread
    };

    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [superLiquidMarket] },
      })
    );

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    expect(events[0]?.payload.liquidityScore).toBe(1);
  });
});

describe("KalshiClient getRelatedInstruments (via fetchMarkets)", () => {
  beforeEach(() => {
    mockGetMarkets.mockClear();
    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [mockKalshiMarket] },
      })
    );
  });

  it("should return FED_RATE related instruments", async () => {
    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    expect(events[0]?.relatedInstrumentIds).toContain("XLF");
    expect(events[0]?.relatedInstrumentIds).toContain("TLT");
    expect(events[0]?.relatedInstrumentIds).toContain("IYR");
    expect(events[0]?.relatedInstrumentIds).toContain("SHY");
  });

  it("should return RECESSION related instruments", async () => {
    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["RECESSION"]);
    const recessionEvent = events.find((e) => e.payload.marketType === "RECESSION");
    if (recessionEvent) {
      expect(recessionEvent.relatedInstrumentIds).toContain("SPY");
      expect(recessionEvent.relatedInstrumentIds).toContain("VIX");
      expect(recessionEvent.relatedInstrumentIds).toContain("TLT");
      expect(recessionEvent.relatedInstrumentIds).toContain("GLD");
    }
  });

  it("should return ECONOMIC_DATA related instruments", async () => {
    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["ECONOMIC_DATA"]);
    for (const event of events) {
      expect(event.relatedInstrumentIds).toContain("SPY");
      expect(event.relatedInstrumentIds).toContain("QQQ");
      expect(event.relatedInstrumentIds).toContain("TLT");
    }
  });

  it("should return empty array for unknown market type", async () => {
    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    // ELECTION returns empty related instruments
    const events = await client.fetchMarkets(["ELECTION"]);
    for (const event of events) {
      expect(event.relatedInstrumentIds).toEqual([]);
    }
  });
});

describe("KalshiClient getMarketType (via fetchMarkets)", () => {
  beforeEach(() => {
    mockGetMarkets.mockClear();
  });

  it("should return FED_RATE for KXFED series", async () => {
    mockGetMarkets.mockImplementation((_limit, _cursor, _eventTicker, seriesTicker) => {
      if (seriesTicker === "KXFED") {
        return Promise.resolve({
          data: { markets: [mockKalshiMarket] },
        });
      }
      return Promise.resolve({ data: { markets: [] } });
    });

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    expect(events[0]?.payload.marketType).toBe("FED_RATE");
  });

  it("should return RECESSION for KXREC series", async () => {
    mockGetMarkets.mockImplementation((_limit, _cursor, _eventTicker, seriesTicker) => {
      if (seriesTicker === "KXREC") {
        return Promise.resolve({
          data: { markets: [mockKalshiMarket] },
        });
      }
      return Promise.resolve({ data: { markets: [] } });
    });

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["RECESSION"]);
    expect(events[0]?.payload.marketType).toBe("RECESSION");
  });

  it("should return ECONOMIC_DATA for KXCPI series", async () => {
    mockGetMarkets.mockImplementation((_limit, _cursor, _eventTicker, seriesTicker) => {
      if (seriesTicker === "KXCPI") {
        return Promise.resolve({
          data: { markets: [mockKalshiMarket] },
        });
      }
      return Promise.resolve({ data: { markets: [] } });
    });

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["ECONOMIC_DATA"]);
    const cpiEvent = events.find((e) => e.payload.marketType === "ECONOMIC_DATA");
    expect(cpiEvent).toBeDefined();
  });
});

describe("KalshiClient enforceRateLimit", () => {
  beforeEach(() => {
    mockGetMarkets.mockClear();
    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [mockKalshiMarket] },
      })
    );
  });

  it("should not delay first request", async () => {
    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
      tier: "basic",
    });

    const start = Date.now();
    await client.fetchMarkets(["RECESSION"]); // Only 1 series = 1 request
    const elapsed = Date.now() - start;

    // Should be fast (no delay)
    expect(elapsed).toBeLessThan(500);
  });

  it("should work with different tiers", async () => {
    const basicClient = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
      tier: "basic",
    });

    const primeClient = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
      tier: "prime",
    });

    // Both should work without throwing
    await basicClient.fetchMarkets(["RECESSION"]);
    await primeClient.fetchMarkets(["RECESSION"]);

    expect(mockGetMarkets).toHaveBeenCalled();
  });
});
