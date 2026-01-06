/**
 * Tests for Kalshi API client
 */

import { describe, expect, it } from "bun:test";
import { AuthenticationError } from "../../types";
import {
  KALSHI_RATE_LIMITS,
  KalshiClient,
  KalshiMarketSchema,
  MARKET_TYPE_TO_SERIES,
} from "./client";

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
  });
});

describe("KalshiMarketSchema", () => {
  it("should parse valid market data", () => {
    const market = {
      ticker: "KXFED-26JAN29-T50",
      event_ticker: "KXFED-26JAN29",
      series_ticker: "KXFED",
      title: "Will the Fed cut rates by 50bps in January 2026?",
      status: "open",
      yes_bid: 25,
      yes_ask: 27,
      last_price: 26,
      volume: 10000,
      volume_24h: 5000,
      open_interest: 25000,
      close_time: "2026-01-29T19:00:00Z",
    };

    const result = KalshiMarketSchema.parse(market);
    expect(result.ticker).toBe("KXFED-26JAN29-T50");
    expect(result.yes_bid).toBe(25);
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
  });
});

describe("KalshiClient", () => {
  it("should throw AuthenticationError if no private key provided", () => {
    expect(() => {
      new KalshiClient({
        apiKeyId: "test-key",
      });
    }).toThrow(AuthenticationError);
  });

  it("should create client with private key PEM (path test skipped - SDK reads file on init)", () => {
    // Note: Can't test privateKeyPath without a real file because the SDK
    // reads the file synchronously in the constructor
    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
    });

    expect(client.platform).toBe("KALSHI");
  });

  it("should create client with private key PEM", () => {
    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
    });

    expect(client.platform).toBe("KALSHI");
  });

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
});
