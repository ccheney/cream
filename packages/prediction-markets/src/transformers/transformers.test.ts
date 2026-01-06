/**
 * Tests for Prediction Market Transformers
 */

import { describe, expect, it } from "bun:test";
import type { PredictionMarketEvent, PredictionMarketScores } from "@cream/domain";
import {
  INSTRUMENT_MAPPING,
  mapToRelatedInstruments,
  transformScoresToNumeric,
  transformToExternalEvent,
  transformToExternalEvents,
} from "./transformers";

describe("mapToRelatedInstruments", () => {
  it("should map FED_RATE markets to rate-sensitive instruments", () => {
    const event: PredictionMarketEvent = {
      eventId: "pm_kalshi_fed_jan26",
      eventType: "PREDICTION_MARKET",
      eventTime: "2026-01-29T19:00:00Z",
      payload: {
        platform: "KALSHI",
        marketType: "FED_RATE",
        marketTicker: "KXFED-26JAN29",
        marketQuestion: "Will the Fed cut rates in January 2026?",
        outcomes: [
          { outcome: "Yes", probability: 0.6, price: 0.6 },
          { outcome: "No", probability: 0.4, price: 0.4 },
        ],
        lastUpdated: "2026-01-04T15:00:00Z",
      },
      relatedInstrumentIds: [],
    };

    const instruments = mapToRelatedInstruments(event);

    // Should have default FED_RATE instruments
    expect(instruments).toContain("XLF");
    expect(instruments).toContain("TLT");
    expect(instruments).toContain("IYR");
    expect(instruments).toContain("KRE");

    // Should have "cut" keyword instruments
    expect(instruments).toContain("TLT");
    expect(instruments).toContain("IYR");
  });

  it("should map ECONOMIC_DATA markets based on indicator keywords", () => {
    const cpiEvent: PredictionMarketEvent = {
      eventId: "pm_kalshi_cpi",
      eventType: "PREDICTION_MARKET",
      eventTime: "2026-02-14T08:30:00Z",
      payload: {
        platform: "KALSHI",
        marketType: "ECONOMIC_DATA",
        marketTicker: "KXCPI-26FEB",
        marketQuestion: "Will CPI inflation exceed 3% in January?",
        outcomes: [
          { outcome: "Yes", probability: 0.35, price: 0.35 },
          { outcome: "No", probability: 0.65, price: 0.65 },
        ],
        lastUpdated: "2026-01-04T15:00:00Z",
      },
      relatedInstrumentIds: [],
    };

    const instruments = mapToRelatedInstruments(cpiEvent);

    // Should have CPI/inflation-related instruments
    expect(instruments).toContain("TIPS");
    expect(instruments).toContain("GLD");
    expect(instruments).toContain("TIP");
  });

  it("should map RECESSION markets to defensive instruments", () => {
    const event: PredictionMarketEvent = {
      eventId: "pm_poly_recession",
      eventType: "PREDICTION_MARKET",
      eventTime: "2026-12-31T23:59:59Z",
      payload: {
        platform: "POLYMARKET",
        marketType: "RECESSION",
        marketTicker: "0xrec2026",
        marketQuestion: "Will there be a recession in 2026?",
        outcomes: [
          { outcome: "Yes", probability: 0.25, price: 0.25 },
          { outcome: "No", probability: 0.75, price: 0.75 },
        ],
        lastUpdated: "2026-01-04T15:00:00Z",
      },
      relatedInstrumentIds: [],
    };

    const instruments = mapToRelatedInstruments(event);

    // Should have recession-related instruments
    expect(instruments).toContain("SPY");
    expect(instruments).toContain("QQQ");
    expect(instruments).toContain("VIX");
    expect(instruments).toContain("TLT");

    // Should have defensive sector instruments from keyword matching
    expect(instruments).toContain("XLU");
    expect(instruments).toContain("XLP");
    expect(instruments).toContain("GLD");
  });

  it("should include existing relatedInstrumentIds", () => {
    const event: PredictionMarketEvent = {
      eventId: "pm_kalshi_fed",
      eventType: "PREDICTION_MARKET",
      eventTime: "2026-01-29T19:00:00Z",
      payload: {
        platform: "KALSHI",
        marketType: "FED_RATE",
        marketTicker: "KXFED",
        marketQuestion: "Fed rate decision",
        outcomes: [{ outcome: "Yes", probability: 0.5, price: 0.5 }],
        lastUpdated: "2026-01-04T15:00:00Z",
      },
      relatedInstrumentIds: ["AAPL", "GOOGL"],
    };

    const instruments = mapToRelatedInstruments(event);

    expect(instruments).toContain("AAPL");
    expect(instruments).toContain("GOOGL");
  });
});

describe("transformToExternalEvent", () => {
  it("should transform prediction market event to ExternalEvent format", () => {
    const pmEvent: PredictionMarketEvent = {
      eventId: "pm_kalshi_fed_jan26",
      eventType: "PREDICTION_MARKET",
      eventTime: "2026-01-29T19:00:00Z",
      payload: {
        platform: "KALSHI",
        marketType: "FED_RATE",
        marketTicker: "KXFED-26JAN29",
        marketQuestion: "Will the Fed cut rates in January 2026?",
        outcomes: [
          { outcome: "Yes", probability: 0.6, price: 0.6, volume24h: 50000 },
          { outcome: "No", probability: 0.4, price: 0.4, volume24h: 30000 },
        ],
        lastUpdated: "2026-01-04T15:00:00Z",
        liquidityScore: 0.8,
        volume24h: 80000,
      },
      relatedInstrumentIds: [],
    };

    const externalEvent = transformToExternalEvent(pmEvent);

    expect(externalEvent.eventId).toBe("pm_kalshi_fed_jan26");
    expect(externalEvent.eventType).toBe("PREDICTION_MARKET");
    expect(externalEvent.eventTime).toBe("2026-01-29T19:00:00Z");
    expect(externalEvent.source).toBe("KALSHI");
    expect(externalEvent.headline).toBe("Will the Fed cut rates in January 2026?");

    // Check payload structure
    expect(externalEvent.payload.platform).toBe("KALSHI");
    expect(externalEvent.payload.marketType).toBe("FED_RATE");
    expect(externalEvent.payload.liquidityScore).toBe(0.8);

    // Check related instruments are populated
    expect(externalEvent.relatedInstrumentIds).toContain("XLF");
    expect(externalEvent.relatedInstrumentIds).toContain("TLT");
  });

  it("should preserve all outcome data in payload", () => {
    const pmEvent: PredictionMarketEvent = {
      eventId: "pm_test",
      eventType: "PREDICTION_MARKET",
      eventTime: "2026-01-29T19:00:00Z",
      payload: {
        platform: "POLYMARKET",
        marketType: "ELECTION",
        marketTicker: "0x123",
        marketQuestion: "Who will win the 2028 election?",
        outcomes: [
          { outcome: "Democrat", probability: 0.45, price: 0.45, volume24h: 100000 },
          { outcome: "Republican", probability: 0.52, price: 0.52, volume24h: 120000 },
          { outcome: "Other", probability: 0.03, price: 0.03, volume24h: 5000 },
        ],
        lastUpdated: "2026-01-04T15:00:00Z",
      },
      relatedInstrumentIds: [],
    };

    const externalEvent = transformToExternalEvent(pmEvent);

    const outcomes = externalEvent.payload.outcomes as Array<{
      outcome: string;
      probability: number;
      price: number;
      volume24h?: number;
    }>;

    expect(outcomes).toHaveLength(3);
    expect(outcomes[0]?.outcome).toBe("Democrat");
    expect(outcomes[0]?.probability).toBe(0.45);
    expect(outcomes[1]?.outcome).toBe("Republican");
    expect(outcomes[1]?.volume24h).toBe(120000);
  });
});

describe("transformToExternalEvents", () => {
  it("should transform multiple events", () => {
    const events: PredictionMarketEvent[] = [
      {
        eventId: "pm_1",
        eventType: "PREDICTION_MARKET",
        eventTime: "2026-01-29T19:00:00Z",
        payload: {
          platform: "KALSHI",
          marketType: "FED_RATE",
          marketTicker: "KXFED",
          marketQuestion: "Fed rate cut?",
          outcomes: [{ outcome: "Yes", probability: 0.6, price: 0.6 }],
          lastUpdated: "2026-01-04T15:00:00Z",
        },
        relatedInstrumentIds: [],
      },
      {
        eventId: "pm_2",
        eventType: "PREDICTION_MARKET",
        eventTime: "2026-12-31T23:59:59Z",
        payload: {
          platform: "POLYMARKET",
          marketType: "RECESSION",
          marketTicker: "0xrec",
          marketQuestion: "Recession in 2026?",
          outcomes: [{ outcome: "Yes", probability: 0.25, price: 0.25 }],
          lastUpdated: "2026-01-04T15:00:00Z",
        },
        relatedInstrumentIds: [],
      },
    ];

    const externalEvents = transformToExternalEvents(events);

    expect(externalEvents).toHaveLength(2);
    expect(externalEvents[0]?.eventId).toBe("pm_1");
    expect(externalEvents[1]?.eventId).toBe("pm_2");
    expect(externalEvents[0]?.eventType).toBe("PREDICTION_MARKET");
    expect(externalEvents[1]?.eventType).toBe("PREDICTION_MARKET");
  });
});

describe("transformScoresToNumeric", () => {
  it("should transform prediction scores to numeric scores format", () => {
    const scores: PredictionMarketScores = {
      fedCutProbability: 0.65,
      fedHikeProbability: 0.05,
      recessionProbability12m: 0.25,
      macroUncertaintyIndex: 0.45,
      policyEventRisk: 0.3,
    };

    const numericScores = transformScoresToNumeric(scores);

    expect(numericScores.pm_fed_cut).toBe(0.65);
    expect(numericScores.pm_fed_hike).toBe(0.05);
    expect(numericScores.pm_recession_12m).toBe(0.25);
    expect(numericScores.pm_macro_uncertainty).toBe(0.45);
    expect(numericScores.pm_policy_risk).toBe(0.3);
  });

  it("should only include defined scores", () => {
    const scores: PredictionMarketScores = {
      fedCutProbability: 0.6,
    };

    const numericScores = transformScoresToNumeric(scores);

    expect(numericScores.pm_fed_cut).toBe(0.6);
    expect(numericScores.pm_fed_hike).toBeUndefined();
    expect(numericScores.pm_recession_12m).toBeUndefined();
  });

  it("should include economic surprise indicators", () => {
    const scores: PredictionMarketScores = {
      cpiSurpriseDirection: 0.3,
      gdpSurpriseDirection: -0.2,
      shutdownProbability: 0.1,
      tariffEscalationProbability: 0.15,
    };

    const numericScores = transformScoresToNumeric(scores);

    expect(numericScores.pm_cpi_surprise).toBe(0.3);
    expect(numericScores.pm_gdp_surprise).toBe(-0.2);
    expect(numericScores.pm_shutdown).toBe(0.1);
    expect(numericScores.pm_tariff_escalation).toBe(0.15);
  });
});

describe("INSTRUMENT_MAPPING", () => {
  it("should have mappings for all market types", () => {
    const marketTypes = [
      "FED_RATE",
      "ECONOMIC_DATA",
      "RECESSION",
      "GEOPOLITICAL",
      "REGULATORY",
      "ELECTION",
    ];

    for (const type of marketTypes) {
      expect(INSTRUMENT_MAPPING[type as keyof typeof INSTRUMENT_MAPPING]).toBeDefined();
    }
  });

  it("should have FED_RATE mapping with rate-sensitive sectors", () => {
    const fedMapping = INSTRUMENT_MAPPING.FED_RATE;

    expect(fedMapping.defaultInstruments).toContain("XLF");
    expect(fedMapping.defaultInstruments).toContain("TLT");
    expect(fedMapping.keywordMappings.cut).toBeDefined();
    expect(fedMapping.keywordMappings.hike).toBeDefined();
  });

  it("should have GEOPOLITICAL mapping with safe-haven assets", () => {
    const geoMapping = INSTRUMENT_MAPPING.GEOPOLITICAL;

    expect(geoMapping.defaultInstruments).toContain("VIX");
    expect(geoMapping.defaultInstruments).toContain("GLD");
    expect(geoMapping.keywordMappings.war).toContain("ITA");
    expect(geoMapping.keywordMappings.tariff).toContain("EEM");
  });
});
