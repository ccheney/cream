/**
 * Tests for prediction markets type schemas
 */

import { describe, expect, it } from "bun:test";
import {
  AggregatedMarketDataSchema,
  AuthenticationError,
  MarketOutcomeSchema,
  MarketTypeSchema,
  PlatformSchema,
  PredictionMarketError,
  PredictionMarketEventSchema,
  PredictionMarketScoresSchema,
  RateLimitError,
} from "./types";

describe("PlatformSchema", () => {
  it("should accept valid platforms", () => {
    expect(PlatformSchema.parse("KALSHI")).toBe("KALSHI");
    expect(PlatformSchema.parse("POLYMARKET")).toBe("POLYMARKET");
  });

  it("should reject invalid platforms", () => {
    expect(() => PlatformSchema.parse("INVALID")).toThrow();
  });
});

describe("MarketTypeSchema", () => {
  it("should accept valid market types", () => {
    expect(MarketTypeSchema.parse("FED_RATE")).toBe("FED_RATE");
    expect(MarketTypeSchema.parse("ECONOMIC_DATA")).toBe("ECONOMIC_DATA");
    expect(MarketTypeSchema.parse("RECESSION")).toBe("RECESSION");
    expect(MarketTypeSchema.parse("GEOPOLITICAL")).toBe("GEOPOLITICAL");
    expect(MarketTypeSchema.parse("REGULATORY")).toBe("REGULATORY");
    expect(MarketTypeSchema.parse("ELECTION")).toBe("ELECTION");
  });

  it("should reject invalid market types", () => {
    expect(() => MarketTypeSchema.parse("INVALID")).toThrow();
  });
});

describe("MarketOutcomeSchema", () => {
  it("should accept valid market outcome", () => {
    const outcome = {
      outcome: "25bps cut",
      probability: 0.81,
      price: 0.81,
      volume24h: 2500000,
    };
    expect(MarketOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it("should accept outcome without optional volume24h", () => {
    const outcome = {
      outcome: "No change",
      probability: 0.15,
      price: 0.15,
    };
    expect(MarketOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it("should reject probability outside 0-1 range", () => {
    expect(() =>
      MarketOutcomeSchema.parse({
        outcome: "Test",
        probability: 1.5,
        price: 0.5,
      })
    ).toThrow();
  });
});

describe("PredictionMarketEventSchema", () => {
  const validEvent = {
    eventId: "pm_kalshi_fed_jan26",
    eventType: "PREDICTION_MARKET" as const,
    eventTime: "2026-01-29T19:00:00Z",
    payload: {
      platform: "KALSHI" as const,
      marketType: "FED_RATE" as const,
      marketTicker: "KXFED-26JAN29",
      marketQuestion: "What will the Fed decide at the January 2026 FOMC meeting?",
      outcomes: [
        { outcome: "No change", probability: 0.15, price: 0.15 },
        { outcome: "25bps cut", probability: 0.81, price: 0.81 },
      ],
      lastUpdated: "2026-01-04T15:00:00Z",
      volume24h: 2500000,
      liquidityScore: 0.92,
    },
    relatedInstrumentIds: ["XLF", "TLT", "IYR"],
  };

  it("should accept valid prediction market event", () => {
    const result = PredictionMarketEventSchema.parse(validEvent);
    expect(result.eventId).toBe("pm_kalshi_fed_jan26");
    expect(result.payload.platform).toBe("KALSHI");
    expect(result.payload.outcomes).toHaveLength(2);
  });

  it("should accept event without optional fields", () => {
    const minimalEvent = {
      eventId: "pm_test",
      eventType: "PREDICTION_MARKET" as const,
      eventTime: "2026-01-29T19:00:00Z",
      payload: {
        platform: "POLYMARKET" as const,
        marketType: "RECESSION" as const,
        marketTicker: "TEST",
        marketQuestion: "Test question?",
        outcomes: [{ outcome: "Yes", probability: 0.5, price: 0.5 }],
        lastUpdated: "2026-01-04T15:00:00Z",
      },
      relatedInstrumentIds: [],
    };
    expect(PredictionMarketEventSchema.parse(minimalEvent)).toBeDefined();
  });

  it("should reject invalid eventType", () => {
    const invalidEvent = { ...validEvent, eventType: "INVALID" };
    expect(() => PredictionMarketEventSchema.parse(invalidEvent)).toThrow();
  });
});

describe("PredictionMarketScoresSchema", () => {
  it("should accept valid scores", () => {
    const scores = {
      fedCutProbability: 0.81,
      fedHikeProbability: 0.01,
      recessionProbability12m: 0.23,
      cpiSurpriseDirection: 0.15,
      macroUncertaintyIndex: 0.42,
      policyEventRisk: 0.35,
    };
    expect(PredictionMarketScoresSchema.parse(scores)).toEqual(scores);
  });

  it("should accept empty scores object", () => {
    expect(PredictionMarketScoresSchema.parse({})).toEqual({});
  });

  it("should reject cpiSurpriseDirection outside -1 to 1 range", () => {
    expect(() =>
      PredictionMarketScoresSchema.parse({
        cpiSurpriseDirection: 1.5,
      })
    ).toThrow();
  });

  it("should accept negative cpiSurpriseDirection", () => {
    const scores = { cpiSurpriseDirection: -0.5 };
    expect(PredictionMarketScoresSchema.parse(scores)).toEqual(scores);
  });
});

describe("AggregatedMarketDataSchema", () => {
  it("should accept valid aggregated data", () => {
    const data = {
      events: [],
      scores: { fedCutProbability: 0.81 },
      lastUpdated: "2026-01-04T15:00:00Z",
      platforms: ["KALSHI", "POLYMARKET"],
    };
    expect(AggregatedMarketDataSchema.parse(data)).toEqual(data);
  });
});

describe("Error classes", () => {
  it("should create PredictionMarketError correctly", () => {
    const error = new PredictionMarketError("Test error", "KALSHI", "TEST_CODE");
    expect(error.message).toBe("Test error");
    expect(error.platform).toBe("KALSHI");
    expect(error.code).toBe("TEST_CODE");
    expect(error.name).toBe("PredictionMarketError");
  });

  it("should create RateLimitError correctly", () => {
    const error = new RateLimitError("POLYMARKET", 5000);
    expect(error.message).toBe("Rate limit exceeded for POLYMARKET");
    expect(error.platform).toBe("POLYMARKET");
    expect(error.code).toBe("RATE_LIMIT");
    expect(error.retryAfterMs).toBe(5000);
  });

  it("should create AuthenticationError correctly", () => {
    const error = new AuthenticationError("KALSHI", "Invalid API key");
    expect(error.message).toBe("Invalid API key");
    expect(error.platform).toBe("KALSHI");
    expect(error.code).toBe("AUTH_ERROR");
  });
});
