/**
 * Event Schema Tests
 */

import { describe, expect, it } from "bun:test";
import {
  AnalystRatingPayloadSchema,
  createEarningsEvent,
  createMacroEvent,
  createNewsEvent,
  DividendPayloadSchema,
  EarningsEventPayloadSchema,
  EventQueryRequestSchema,
  ExternalEventListSchema,
  getEventSurpriseScore,
  isEarningsEvent,
  isMacroEvent,
  MacroEventPayloadSchema,
  MergerAcquisitionPayloadSchema,
  NewsEventPayloadSchema,
  RegulatoryPayloadSchema,
  SentimentEventPayloadSchema,
  SplitPayloadSchema,
  TypedEarningsEventSchema,
  TypedExternalEventSchema,
  TypedMacroEventSchema,
  TypedNewsEventSchema,
} from "./events";

describe("Event Payload Schemas", () => {
  describe("EarningsEventPayloadSchema", () => {
    it("should validate valid earnings payload", () => {
      const payload = {
        symbol: "AAPL",
        quarter: "Q1",
        year: 2026,
        epsActual: 2.18,
        epsExpected: 2.1,
        epsSurprisePct: 3.81,
        revenueActual: 120000000000,
        revenueExpected: 118000000000,
        revenueSurprisePct: 1.69,
        transcriptAvailable: true,
      };
      const result = EarningsEventPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("should require symbol, quarter, and year", () => {
      const payload = {
        epsActual: 2.18,
      };
      const result = EarningsEventPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should allow minimal earnings payload", () => {
      const payload = {
        symbol: "AAPL",
        quarter: "Q1",
        year: 2026,
      };
      const result = EarningsEventPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe("MacroEventPayloadSchema", () => {
    it("should validate valid macro payload", () => {
      const payload = {
        indicatorName: "Non-Farm Payrolls",
        value: 250000,
        previousValue: 200000,
        expectedValue: 220000,
        surprisePct: 13.64,
        unit: "jobs",
        country: "US",
      };
      const result = MacroEventPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("should default country to US", () => {
      const payload = {
        indicatorName: "CPI",
        value: 3.2,
      };
      const result = MacroEventPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.country).toBe("US");
      }
    });
  });

  describe("NewsEventPayloadSchema", () => {
    it("should validate valid news payload", () => {
      const payload = {
        headline: "Apple Reports Record Earnings",
        body: "Apple Inc. announced record quarterly earnings today.",
        source: "Reuters",
        url: "https://reuters.com/article/apple",
        entities: [{ name: "Apple", entityType: "company", ticker: "AAPL" }],
        keyInsights: ["Record iPhone sales", "Services revenue growth"],
      };
      const result = NewsEventPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("should require headline, body, and source", () => {
      const payload = {
        headline: "Test",
      };
      const result = NewsEventPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe("SentimentEventPayloadSchema", () => {
    it("should validate valid sentiment payload", () => {
      const payload = {
        platform: "Twitter",
        mentionCount: 50000,
        averageVolume: 10000,
        volumeZscore: 4.0,
        aggregateSentiment: "BULLISH",
        windowMinutes: 60,
      };
      const result = SentimentEventPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe("MergerAcquisitionPayloadSchema", () => {
    it("should validate valid M&A payload", () => {
      const payload = {
        transactionType: "acquisition",
        acquirerSymbol: "MSFT",
        targetSymbol: "ATVI",
        dealValue: 69000000000,
        currency: "USD",
        status: "approved",
      };
      const result = MergerAcquisitionPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe("AnalystRatingPayloadSchema", () => {
    it("should validate valid analyst rating payload", () => {
      const payload = {
        firm: "Goldman Sachs",
        analystName: "John Smith",
        previousRating: "Hold",
        newRating: "Buy",
        previousTarget: 180,
        newTarget: 210,
        actionType: "upgrade",
      };
      const result = AnalystRatingPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe("RegulatoryPayloadSchema", () => {
    it("should validate valid regulatory payload", () => {
      const payload = {
        regulatoryBody: "FDA",
        actionType: "approval",
        subject: "Drug XYZ",
        decision: "Approved for treatment of condition ABC",
      };
      const result = RegulatoryPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe("DividendPayloadSchema", () => {
    it("should validate valid dividend payload", () => {
      const payload = {
        amount: 0.24,
        currency: "USD",
        exDate: "2026-02-10",
        recordDate: "2026-02-11",
        paymentDate: "2026-02-18",
        dividendType: "regular",
        yoyChangePct: 4.35,
      };
      const result = DividendPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe("SplitPayloadSchema", () => {
    it("should validate valid split payload", () => {
      const payload = {
        splitFrom: 4,
        splitTo: 1,
        effectiveDate: "2026-08-25",
        announcementDate: "2026-07-28",
      };
      const result = SplitPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });
});

describe("Typed Event Schemas", () => {
  const baseEvent = {
    eventId: "550e8400-e29b-41d4-a716-446655440000",
    eventTime: "2026-01-05T10:00:00Z",
    relatedInstrumentIds: ["AAPL"],
  };

  describe("TypedEarningsEventSchema", () => {
    it("should validate earnings event", () => {
      const event = {
        ...baseEvent,
        eventType: "EARNINGS",
        payload: {
          symbol: "AAPL",
          quarter: "Q1",
          year: 2026,
          epsActual: 2.18,
        },
      };
      const result = TypedEarningsEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });
  });

  describe("TypedMacroEventSchema", () => {
    it("should validate macro event", () => {
      const event = {
        ...baseEvent,
        eventType: "MACRO",
        relatedInstrumentIds: [],
        payload: {
          indicatorName: "CPI",
          value: 3.2,
        },
      };
      const result = TypedMacroEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });
  });

  describe("TypedNewsEventSchema", () => {
    it("should validate news event", () => {
      const event = {
        ...baseEvent,
        eventType: "NEWS",
        payload: {
          headline: "Test Headline",
          body: "Test body content",
          source: "Reuters",
        },
      };
      const result = TypedNewsEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });
  });

  describe("TypedExternalEventSchema (discriminated union)", () => {
    it("should discriminate earnings event", () => {
      const event = {
        ...baseEvent,
        eventType: "EARNINGS",
        payload: { symbol: "AAPL", quarter: "Q1", year: 2026 },
      };
      const result = TypedExternalEventSchema.safeParse(event);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.eventType).toBe("EARNINGS");
      }
    });

    it("should discriminate macro event", () => {
      const event = {
        ...baseEvent,
        eventType: "MACRO",
        relatedInstrumentIds: [],
        payload: { indicatorName: "GDP", value: 2.8 },
      };
      const result = TypedExternalEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it("should discriminate generic event", () => {
      const event = {
        ...baseEvent,
        eventType: "CONFERENCE",
        payload: { name: "Investor Day" },
      };
      const result = TypedExternalEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });
  });
});

describe("Event Collection Schemas", () => {
  it("should validate event list", () => {
    const list = {
      events: [
        {
          eventId: "550e8400-e29b-41d4-a716-446655440000",
          eventType: "EARNINGS",
          eventTime: "2026-01-05T10:00:00Z",
          relatedInstrumentIds: ["AAPL"],
          payload: { symbol: "AAPL", quarter: "Q1", year: 2026 },
        },
      ],
      totalCount: 1,
    };
    const result = ExternalEventListSchema.safeParse(list);
    expect(result.success).toBe(true);
  });

  it("should validate event query request", () => {
    const request = {
      eventTypes: ["EARNINGS", "MACRO"],
      instrumentIds: ["AAPL", "MSFT"],
      startTime: "2026-01-01T00:00:00Z",
      endTime: "2026-01-05T00:00:00Z",
      limit: 50,
      minImportance: 0.5,
    };
    const result = EventQueryRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });
});

describe("Helper Functions", () => {
  describe("createEarningsEvent", () => {
    it("should create earnings event with defaults", () => {
      const event = createEarningsEvent(
        "550e8400-e29b-41d4-a716-446655440000",
        "2026-01-05T10:00:00Z",
        { symbol: "AAPL", quarter: "Q1", year: 2026, transcriptAvailable: false }
      );
      expect(event.eventType).toBe("EARNINGS");
      expect(event.relatedInstrumentIds).toEqual(["AAPL"]);
    });
  });

  describe("createMacroEvent", () => {
    it("should create macro event with defaults", () => {
      const event = createMacroEvent(
        "550e8400-e29b-41d4-a716-446655440000",
        "2026-01-05T10:00:00Z",
        { indicatorName: "CPI", value: 3.2, unit: "", country: "US" }
      );
      expect(event.eventType).toBe("MACRO");
      expect(event.relatedInstrumentIds).toEqual([]);
    });
  });

  describe("createNewsEvent", () => {
    it("should create news event", () => {
      const event = createNewsEvent(
        "550e8400-e29b-41d4-a716-446655440000",
        "2026-01-05T10:00:00Z",
        { headline: "Test", body: "Content", source: "Reuters", entities: [], keyInsights: [] },
        ["AAPL"]
      );
      expect(event.eventType).toBe("NEWS");
      expect(event.headline).toBe("Test");
    });
  });

  describe("Type guards", () => {
    const earningsEvent = createEarningsEvent(
      "550e8400-e29b-41d4-a716-446655440000",
      "2026-01-05T10:00:00Z",
      { symbol: "AAPL", quarter: "Q1", year: 2026, transcriptAvailable: false }
    );

    const macroEvent = createMacroEvent(
      "550e8400-e29b-41d4-a716-446655440000",
      "2026-01-05T10:00:00Z",
      { indicatorName: "CPI", value: 3.2, unit: "", country: "US" }
    );

    it("isEarningsEvent should work", () => {
      expect(isEarningsEvent(earningsEvent)).toBe(true);
      expect(isEarningsEvent(macroEvent)).toBe(false);
    });

    it("isMacroEvent should work", () => {
      expect(isMacroEvent(macroEvent)).toBe(true);
      expect(isMacroEvent(earningsEvent)).toBe(false);
    });
  });

  describe("getEventSurpriseScore", () => {
    it("should return surprise score from event field", () => {
      const event = createEarningsEvent(
        "550e8400-e29b-41d4-a716-446655440000",
        "2026-01-05T10:00:00Z",
        { symbol: "AAPL", quarter: "Q1", year: 2026, transcriptAvailable: false },
        { surpriseScore: 0.5 }
      );
      expect(getEventSurpriseScore(event)).toBe(0.5);
    });

    it("should calculate from earnings payload", () => {
      const event = createEarningsEvent(
        "550e8400-e29b-41d4-a716-446655440000",
        "2026-01-05T10:00:00Z",
        {
          symbol: "AAPL",
          quarter: "Q1",
          year: 2026,
          epsSurprisePct: 25,
          transcriptAvailable: false,
        }
      );
      expect(getEventSurpriseScore(event)).toBe(0.5); // 25/50 = 0.5
    });

    it("should cap surprise score at ±1", () => {
      const event = createEarningsEvent(
        "550e8400-e29b-41d4-a716-446655440000",
        "2026-01-05T10:00:00Z",
        {
          symbol: "AAPL",
          quarter: "Q1",
          year: 2026,
          epsSurprisePct: 100,
          transcriptAvailable: false,
        }
      );
      expect(getEventSurpriseScore(event)).toBe(1); // Capped at 1
    });
  });
});
