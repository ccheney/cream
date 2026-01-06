/**
 * Tests for Kalshi API client
 */

import { afterEach, describe, expect, it } from "bun:test";
import type { KalshiConfig } from "@cream/config";
import type { AuthenticationError } from "../../index";
import {
  createKalshiClient,
  createKalshiClientFromEnv,
  KALSHI_RATE_LIMITS,
  KalshiClient,
  KalshiEventSchema,
  KalshiMarketSchema,
  MARKET_TYPE_TO_SERIES,
} from "./client";

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
// Tests
// ============================================

describe("KALSHI_RATE_LIMITS", () => {
  it("should have all tiers defined", () => {
    expect(KALSHI_RATE_LIMITS.basic).toBeDefined();
    expect(KALSHI_RATE_LIMITS.advanced).toBeDefined();
    expect(KALSHI_RATE_LIMITS.premier).toBeDefined();
    expect(KALSHI_RATE_LIMITS.prime).toBeDefined();
  });

  it("should have increasing limits per tier", () => {
    expect(KALSHI_RATE_LIMITS.basic.read).toBeLessThan(KALSHI_RATE_LIMITS.advanced.read);
    expect(KALSHI_RATE_LIMITS.advanced.read).toBeLessThan(KALSHI_RATE_LIMITS.premier.read);
    expect(KALSHI_RATE_LIMITS.premier.read).toBeLessThan(KALSHI_RATE_LIMITS.prime.read);
  });

  it("should have correct values", () => {
    expect(KALSHI_RATE_LIMITS.basic.read).toBe(20);
    expect(KALSHI_RATE_LIMITS.basic.write).toBe(10);
    expect(KALSHI_RATE_LIMITS.prime.read).toBe(400);
    expect(KALSHI_RATE_LIMITS.prime.write).toBe(400);
  });
});

describe("MARKET_TYPE_TO_SERIES", () => {
  it("should map FED_RATE to correct series", () => {
    expect(MARKET_TYPE_TO_SERIES.FED_RATE).toContain("KXFED");
    expect(MARKET_TYPE_TO_SERIES.FED_RATE).toContain("KXFOMC");
  });

  it("should map ECONOMIC_DATA to correct series", () => {
    expect(MARKET_TYPE_TO_SERIES.ECONOMIC_DATA).toContain("KXCPI");
    expect(MARKET_TYPE_TO_SERIES.ECONOMIC_DATA).toContain("KXGDP");
    expect(MARKET_TYPE_TO_SERIES.ECONOMIC_DATA).toContain("KXJOBS");
    expect(MARKET_TYPE_TO_SERIES.ECONOMIC_DATA).toContain("KXPCE");
  });

  it("should map RECESSION to correct series", () => {
    expect(MARKET_TYPE_TO_SERIES.RECESSION).toContain("KXREC");
  });

  it("should map ELECTION to correct series", () => {
    expect(MARKET_TYPE_TO_SERIES.ELECTION).toContain("KXPRES");
  });
});

describe("KalshiMarketSchema", () => {
  it("should parse valid market data", () => {
    const result = KalshiMarketSchema.parse(mockKalshiMarket);
    expect(result.ticker).toBe("KXFED-26JAN29-T50");
    expect(result.yes_bid).toBe(55);
    expect(result.yes_ask).toBe(57);
    expect(result.last_price).toBe(56);
  });

  it("should handle optional fields", () => {
    const market = {
      ticker: "TEST",
      event_ticker: "TEST-EVENT",
      title: "Test market",
      status: "open",
    };

    const result = KalshiMarketSchema.parse(market);
    expect(result.ticker).toBe("TEST");
    expect(result.yes_bid).toBeUndefined();
    expect(result.subtitle).toBeUndefined();
  });
});

describe("KalshiEventSchema", () => {
  it("should parse valid event data", () => {
    const result = KalshiEventSchema.parse(mockKalshiEvent);
    expect(result.event_ticker).toBe("KXFED-26JAN29");
    expect(result.title).toBe("Federal Reserve January 2026 Decision");
    expect(result.markets).toHaveLength(1);
  });

  it("should handle event without markets", () => {
    const event = {
      event_ticker: "EVT-123",
      title: "Event without markets",
    };

    const result = KalshiEventSchema.parse(event);
    expect(result.event_ticker).toBe("EVT-123");
    expect(result.markets).toBeUndefined();
  });
});

describe("KalshiClient", () => {
  // ========================================
  // Constructor & Authentication
  // ========================================

  it("should throw AuthenticationError if no private key provided", () => {
    try {
      new KalshiClient({
        apiKeyId: "test-key",
      });
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect((error as Error).name).toBe("PredictionMarketError");
      expect((error as AuthenticationError).platform).toBe("KALSHI");
      expect((error as AuthenticationError).code).toBe("AUTH_ERROR");
    }
  });

  it("should create client with private key PEM", () => {
    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
    });

    expect(client.platform).toBe("KALSHI");
  });

  it("should create client with custom base path", () => {
    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
      basePath: "https://custom-api.kalshi.com",
    });

    expect(client.platform).toBe("KALSHI");
  });

  it("should create client with specific tier", () => {
    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
      tier: "premier",
    });

    expect(client.platform).toBe("KALSHI");
  });

  // ========================================
  // calculateScores
  // ========================================

  it("should calculate scores from events", () => {
    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test",
    });

    const events = [
      {
        eventId: "pm_kalshi_test",
        eventType: "PREDICTION_MARKET" as const,
        eventTime: "2026-01-29T19:00:00Z",
        payload: {
          platform: "KALSHI" as const,
          marketType: "FED_RATE" as const,
          marketTicker: "KXFED-TEST",
          marketQuestion: "Will the Fed cut rates?",
          outcomes: [
            { outcome: "25bps cut", probability: 0.8, price: 0.8 },
            { outcome: "No change", probability: 0.15, price: 0.15 },
            { outcome: "25bps hike", probability: 0.05, price: 0.05 },
          ],
          lastUpdated: "2026-01-04T15:00:00Z",
        },
        relatedInstrumentIds: ["XLF"],
      },
    ];

    const scores = client.calculateScores(events);
    expect(scores.fedCutProbability).toBe(0.8);
    expect(scores.fedHikeProbability).toBe(0.05);
  });

  it("should calculate recession probability from events", () => {
    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test",
    });

    const events = [
      {
        eventId: "pm_kalshi_recession",
        eventType: "PREDICTION_MARKET" as const,
        eventTime: "2026-12-31T23:59:59Z",
        payload: {
          platform: "KALSHI" as const,
          marketType: "RECESSION" as const,
          marketTicker: "KXREC-2026",
          marketQuestion: "Will there be a recession in 2026?",
          outcomes: [
            { outcome: "Yes", probability: 0.25, price: 0.25 },
            { outcome: "No", probability: 0.75, price: 0.75 },
          ],
          lastUpdated: "2026-01-04T15:00:00Z",
        },
        relatedInstrumentIds: ["SPY"],
      },
    ];

    const scores = client.calculateScores(events);
    expect(scores.recessionProbability12m).toBe(0.25);
  });

  it("should calculate macro uncertainty index", () => {
    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test",
    });

    const events = [
      {
        eventId: "pm_kalshi_cut",
        eventType: "PREDICTION_MARKET" as const,
        eventTime: "2026-06-30T00:00:00Z",
        payload: {
          platform: "KALSHI" as const,
          marketType: "FED_RATE" as const,
          marketTicker: "cut-market",
          marketQuestion: "Fed rate cut?",
          outcomes: [{ outcome: "Rate decrease", probability: 0.6, price: 0.6 }],
          lastUpdated: new Date().toISOString(),
        },
        relatedInstrumentIds: [],
      },
      {
        eventId: "pm_kalshi_hike",
        eventType: "PREDICTION_MARKET" as const,
        eventTime: "2026-06-30T00:00:00Z",
        payload: {
          platform: "KALSHI" as const,
          marketType: "FED_RATE" as const,
          marketTicker: "hike-market",
          marketQuestion: "Fed rate hike?",
          outcomes: [{ outcome: "Rate increase", probability: 0.3, price: 0.3 }],
          lastUpdated: new Date().toISOString(),
        },
        relatedInstrumentIds: [],
      },
    ];

    const scores = client.calculateScores(events);

    expect(scores.fedCutProbability).toBe(0.6);
    expect(scores.fedHikeProbability).toBe(0.3);
    expect(scores.macroUncertaintyIndex).toBe(0.5); // 0.3 / 0.6
  });

  it("should return empty scores for empty events", () => {
    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test",
    });

    const scores = client.calculateScores([]);

    expect(scores.fedCutProbability).toBeUndefined();
    expect(scores.fedHikeProbability).toBeUndefined();
    expect(scores.recessionProbability12m).toBeUndefined();
    expect(scores.macroUncertaintyIndex).toBeUndefined();
  });

  it("should calculate scores with high uncertainty (similar cut/hike)", () => {
    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test",
    });

    const events = [
      {
        eventId: "pm_kalshi_cut",
        eventType: "PREDICTION_MARKET" as const,
        eventTime: "2026-06-30T00:00:00Z",
        payload: {
          platform: "KALSHI" as const,
          marketType: "FED_RATE" as const,
          marketTicker: "cut-market",
          marketQuestion: "Fed rate cut?",
          outcomes: [{ outcome: "Rate cut", probability: 0.5, price: 0.5 }],
          lastUpdated: new Date().toISOString(),
        },
        relatedInstrumentIds: [],
      },
      {
        eventId: "pm_kalshi_hike",
        eventType: "PREDICTION_MARKET" as const,
        eventTime: "2026-06-30T00:00:00Z",
        payload: {
          platform: "KALSHI" as const,
          marketType: "FED_RATE" as const,
          marketTicker: "hike-market",
          marketQuestion: "Fed rate hike?",
          outcomes: [{ outcome: "Rate hike", probability: 0.5, price: 0.5 }],
          lastUpdated: new Date().toISOString(),
        },
        relatedInstrumentIds: [],
      },
    ];

    const scores = client.calculateScores(events);

    expect(scores.fedCutProbability).toBe(0.5);
    expect(scores.fedHikeProbability).toBe(0.5);
    expect(scores.macroUncertaintyIndex).toBe(1.0); // 0.5 / 0.5 = 1.0
  });

  it("should skip macroUncertaintyIndex when maxProb is 0", () => {
    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test",
    });

    const events = [
      {
        eventId: "pm_kalshi_test",
        eventType: "PREDICTION_MARKET" as const,
        eventTime: "2026-06-30T00:00:00Z",
        payload: {
          platform: "KALSHI" as const,
          marketType: "FED_RATE" as const,
          marketTicker: "test-market",
          marketQuestion: "Fed rate?",
          outcomes: [
            { outcome: "cut", probability: 0, price: 0 },
            { outcome: "hike", probability: 0, price: 0 },
          ],
          lastUpdated: new Date().toISOString(),
        },
        relatedInstrumentIds: [],
      },
    ];

    const scores = client.calculateScores(events);

    expect(scores.fedCutProbability).toBe(0);
    expect(scores.fedHikeProbability).toBe(0);
    expect(scores.macroUncertaintyIndex).toBeUndefined();
  });

  it("should handle recession market without Yes outcome", () => {
    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test",
    });

    const events = [
      {
        eventId: "pm_kalshi_recession",
        eventType: "PREDICTION_MARKET" as const,
        eventTime: "2026-12-31T23:59:59Z",
        payload: {
          platform: "KALSHI" as const,
          marketType: "RECESSION" as const,
          marketTicker: "KXREC-2026",
          marketQuestion: "Will there be a recession in 2026?",
          outcomes: [{ outcome: "No", probability: 0.75, price: 0.75 }],
          lastUpdated: "2026-01-04T15:00:00Z",
        },
        relatedInstrumentIds: ["SPY"],
      },
    ];

    const scores = client.calculateScores(events);
    expect(scores.recessionProbability12m).toBeUndefined();
  });
});

// ============================================
// Additional MARKET_TYPE_TO_SERIES Tests
// ============================================

describe("MARKET_TYPE_TO_SERIES extended", () => {
  it("should have empty array for GEOPOLITICAL", () => {
    expect(MARKET_TYPE_TO_SERIES.GEOPOLITICAL).toEqual([]);
  });

  it("should have empty array for REGULATORY", () => {
    expect(MARKET_TYPE_TO_SERIES.REGULATORY).toEqual([]);
  });
});

// ============================================
// Factory Functions
// ============================================

// NOTE: createKalshiClient factory function tests are skipped because they
// conflict with mock.module() in unified-client.test.ts which mocks the
// ../providers/kalshi module. The factory function logic is simple and
// covered by integration testing.
describe.skip("createKalshiClient", () => {
  it("should throw AuthenticationError without api_key_id", () => {
    const config = {
      enabled: true,
    } as KalshiConfig;

    expect(() => createKalshiClient(config)).toThrow("api_key_id is required");
  });
});

describe("createKalshiClientFromEnv", () => {
  const originalApiKeyId = process.env.KALSHI_API_KEY_ID;
  const originalPrivateKeyPath = process.env.KALSHI_PRIVATE_KEY_PATH;

  afterEach(() => {
    // Restore original env
    if (originalApiKeyId !== undefined) {
      process.env.KALSHI_API_KEY_ID = originalApiKeyId;
    } else {
      delete process.env.KALSHI_API_KEY_ID;
    }
    if (originalPrivateKeyPath !== undefined) {
      process.env.KALSHI_PRIVATE_KEY_PATH = originalPrivateKeyPath;
    } else {
      delete process.env.KALSHI_PRIVATE_KEY_PATH;
    }
  });

  it("should throw AuthenticationError without KALSHI_API_KEY_ID", () => {
    delete process.env.KALSHI_API_KEY_ID;
    delete process.env.KALSHI_PRIVATE_KEY_PATH;

    try {
      createKalshiClientFromEnv();
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect((error as Error).name).toBe("PredictionMarketError");
      expect((error as AuthenticationError).message).toContain("KALSHI_API_KEY_ID");
    }
  });

  it("should throw AuthenticationError without KALSHI_PRIVATE_KEY_PATH", () => {
    process.env.KALSHI_API_KEY_ID = "test-key-id";
    delete process.env.KALSHI_PRIVATE_KEY_PATH;

    try {
      createKalshiClientFromEnv();
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect((error as Error).name).toBe("PredictionMarketError");
      expect((error as AuthenticationError).message).toContain("KALSHI_PRIVATE_KEY_PATH");
    }
  });
});
