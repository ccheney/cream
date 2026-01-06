/**
 * External Context Type Tests
 */

import { describe, expect, test } from "bun:test";
import {
  AnalystRatingsSchema,
  createEmptyExternalContext,
  EarningsDataSchema,
  EventType,
  ExternalContextSchema,
  ExternalEventSchema,
  FundamentalsContextSchema,
  getSentimentScore,
  hasExternalContext,
  InfluenceType,
  MacroIndicatorsSchema,
  NewsContextSchema,
  NewsItemSchema,
  SentimentContextSchema,
  SentimentDirection,
  SocialSentimentSchema,
  StandardScoreNames,
  StructuredSummarySchema,
  ValuationMetricsSchema,
} from "./external-context";

// ============================================
// Enum Tests
// ============================================

describe("EventType", () => {
  test("accepts valid event types", () => {
    const validTypes = [
      "EARNINGS",
      "MACRO",
      "NEWS",
      "SENTIMENT_SPIKE",
      "SEC_FILING",
      "DIVIDEND",
      "SPLIT",
      "M_AND_A",
      "ANALYST_RATING",
      "CONFERENCE",
      "GUIDANCE",
      "OTHER",
    ];
    for (const type of validTypes) {
      expect(() => EventType.parse(type)).not.toThrow();
    }
  });

  test("rejects invalid event types", () => {
    expect(() => EventType.parse("INVALID")).toThrow();
  });
});

describe("InfluenceType", () => {
  test("accepts valid influence types", () => {
    expect(() => InfluenceType.parse("NEWS")).not.toThrow();
    expect(() => InfluenceType.parse("SENTIMENT")).not.toThrow();
    expect(() => InfluenceType.parse("FUNDAMENTAL")).not.toThrow();
    expect(() => InfluenceType.parse("MACRO")).not.toThrow();
  });
});

describe("SentimentDirection", () => {
  test("accepts valid directions", () => {
    expect(() => SentimentDirection.parse("BULLISH")).not.toThrow();
    expect(() => SentimentDirection.parse("BEARISH")).not.toThrow();
    expect(() => SentimentDirection.parse("NEUTRAL")).not.toThrow();
    expect(() => SentimentDirection.parse("MIXED")).not.toThrow();
  });
});

describe("StandardScoreNames", () => {
  test("accepts standard score names", () => {
    expect(() => StandardScoreNames.parse("sentiment")).not.toThrow();
    expect(() => StandardScoreNames.parse("volume_zscore")).not.toThrow();
    expect(() => StandardScoreNames.parse("news_intensity")).not.toThrow();
  });
});

// ============================================
// External Event Tests
// ============================================

describe("ExternalEventSchema", () => {
  const validEvent = {
    eventId: "evt-001",
    eventType: "EARNINGS" as const,
    eventTime: "2026-01-05T16:00:00Z",
    payload: { eps: 1.25, estimate: 1.2 },
    relatedInstrumentIds: ["AAPL"],
    source: "FMP",
    headline: "Apple Q4 Earnings Beat Estimates",
  };

  test("accepts valid event", () => {
    const result = ExternalEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });

  test("accepts event without optional fields", () => {
    const result = ExternalEventSchema.safeParse({
      eventId: "evt-002",
      eventType: "MACRO",
      payload: { indicator: "CPI", value: 3.2 },
    });
    expect(result.success).toBe(true);
  });

  test("defaults relatedInstrumentIds to empty array", () => {
    const result = ExternalEventSchema.parse({
      eventId: "evt-003",
      eventType: "NEWS",
      payload: {},
    });
    expect(result.relatedInstrumentIds).toEqual([]);
  });

  test("requires eventId", () => {
    const { eventId: _, ...invalid } = validEvent;
    const result = ExternalEventSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

// ============================================
// News Schema Tests
// ============================================

describe("NewsItemSchema", () => {
  const validNewsItem = {
    id: "news-001",
    headline: "Apple announces new product line",
    source: "Reuters",
    publishedAt: "2026-01-05T10:00:00Z",
    summary: "Apple unveiled...",
    tickers: ["AAPL"],
    sentimentScore: 0.6,
    sentimentDirection: "BULLISH" as const,
    relevanceScore: 0.9,
  };

  test("accepts valid news item", () => {
    const result = NewsItemSchema.safeParse(validNewsItem);
    expect(result.success).toBe(true);
  });

  test("clamps sentiment score to [-1, 1]", () => {
    const result = NewsItemSchema.safeParse({
      ...validNewsItem,
      sentimentScore: 1.5,
    });
    expect(result.success).toBe(false);
  });

  test("requires headline and source", () => {
    const result = NewsItemSchema.safeParse({
      id: "news-002",
      publishedAt: "2026-01-05T10:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("NewsContextSchema", () => {
  test("accepts valid news context", () => {
    const result = NewsContextSchema.safeParse({
      items: [
        {
          id: "news-001",
          headline: "Test headline",
          source: "Test",
          publishedAt: "2026-01-05T10:00:00Z",
        },
      ],
      aggregateSentiment: 0.3,
      itemCount: 1,
      periodHours: 24,
    });
    expect(result.success).toBe(true);
  });

  test("defaults periodHours to 24", () => {
    const result = NewsContextSchema.parse({
      items: [],
      itemCount: 0,
    });
    expect(result.periodHours).toBe(24);
  });
});

// ============================================
// Sentiment Schema Tests
// ============================================

describe("SocialSentimentSchema", () => {
  test("accepts valid social sentiment", () => {
    const result = SocialSentimentSchema.safeParse({
      platform: "Twitter",
      score: 0.45,
      mentionCount: 1500,
      volumeZScore: 2.3,
      asOf: "2026-01-05T12:00:00Z",
    });
    expect(result.success).toBe(true);
  });
});

describe("SentimentContextSchema", () => {
  test("accepts valid sentiment context", () => {
    const result = SentimentContextSchema.safeParse({
      newsSentiment: 0.3,
      socialSentiments: [
        {
          platform: "Reddit",
          score: 0.5,
          mentionCount: 500,
          asOf: "2026-01-05T12:00:00Z",
        },
      ],
      combinedScore: 0.4,
      direction: "BULLISH",
      confidence: 0.8,
    });
    expect(result.success).toBe(true);
  });

  test("defaults socialSentiments to empty array", () => {
    const result = SentimentContextSchema.parse({});
    expect(result.socialSentiments).toEqual([]);
  });
});

// ============================================
// Fundamentals Schema Tests
// ============================================

describe("EarningsDataSchema", () => {
  test("accepts valid earnings data", () => {
    const result = EarningsDataSchema.safeParse({
      lastEps: 1.25,
      epsSurprise: 4.2,
      nextEarningsDate: "2026-02-01",
      daysToEarnings: 27,
      epsEstimate: 1.3,
    });
    expect(result.success).toBe(true);
  });
});

describe("ValuationMetricsSchema", () => {
  test("accepts valid valuation metrics", () => {
    const result = ValuationMetricsSchema.safeParse({
      peRatio: 25.5,
      forwardPe: 22.3,
      psRatio: 6.8,
      pbRatio: 12.1,
      evToEbitda: 18.5,
      marketCap: 3000000000000,
      dividendYield: 0.5,
    });
    expect(result.success).toBe(true);
  });
});

describe("AnalystRatingsSchema", () => {
  test("accepts valid analyst ratings", () => {
    const result = AnalystRatingsSchema.safeParse({
      averageRating: 1.8,
      analystCount: 42,
      buyCount: 35,
      holdCount: 5,
      sellCount: 2,
      priceTarget: 250,
      priceTargetUpside: 15.5,
    });
    expect(result.success).toBe(true);
  });

  test("clamps averageRating to [1, 5]", () => {
    const tooHigh = AnalystRatingsSchema.safeParse({ averageRating: 6 });
    expect(tooHigh.success).toBe(false);

    const tooLow = AnalystRatingsSchema.safeParse({ averageRating: 0 });
    expect(tooLow.success).toBe(false);
  });
});

describe("FundamentalsContextSchema", () => {
  test("accepts complete fundamentals context", () => {
    const result = FundamentalsContextSchema.safeParse({
      earnings: { lastEps: 1.25 },
      valuation: { peRatio: 25 },
      analystRatings: { averageRating: 2 },
      sector: "Technology",
      industry: "Consumer Electronics",
      companyName: "Apple Inc.",
    });
    expect(result.success).toBe(true);
  });
});

// ============================================
// Macro Schema Tests
// ============================================

describe("MacroIndicatorsSchema", () => {
  test("accepts valid macro indicators", () => {
    const result = MacroIndicatorsSchema.safeParse({
      vix: 18.5,
      treasury10y: 4.25,
      treasury2y: 4.8,
      fedFundsRate: 5.25,
      dxy: 103.5,
      crudeOil: 72.5,
      gold: 2050,
      cpi: 3.2,
      gdpGrowth: 2.5,
      unemployment: 3.8,
    });
    expect(result.success).toBe(true);
  });

  test("rejects negative VIX", () => {
    const result = MacroIndicatorsSchema.safeParse({ vix: -5 });
    expect(result.success).toBe(false);
  });

  test("clamps unemployment to [0, 100]", () => {
    const result = MacroIndicatorsSchema.safeParse({ unemployment: 150 });
    expect(result.success).toBe(false);
  });
});

// ============================================
// External Context Schema Tests
// ============================================

describe("StructuredSummarySchema", () => {
  test("accepts valid summary", () => {
    const result = StructuredSummarySchema.safeParse({
      marketSentiment: "Cautiously optimistic",
      keyThemes: ["AI", "Earnings season"],
      risks: ["Interest rate uncertainty"],
      opportunities: ["Tech sector momentum"],
      generatedAt: "2026-01-05T12:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  test("defaults arrays to empty", () => {
    const result = StructuredSummarySchema.parse({});
    expect(result.keyThemes).toEqual([]);
    expect(result.risks).toEqual([]);
    expect(result.opportunities).toEqual([]);
  });
});

describe("ExternalContextSchema", () => {
  test("accepts complete external context", () => {
    const result = ExternalContextSchema.safeParse({
      structuredSummary: { marketSentiment: "Bullish" },
      numericScores: { sentiment: 0.6, volume_zscore: 1.5 },
      extractedEvents: [
        {
          eventId: "evt-001",
          eventType: "EARNINGS",
          payload: { eps: 1.25 },
        },
      ],
      news: {
        items: [],
        itemCount: 0,
      },
      sentiment: { combinedScore: 0.5 },
      fundamentals: { sector: "Technology" },
      macro: { vix: 18 },
    });
    expect(result.success).toBe(true);
  });

  test("accepts minimal external context", () => {
    const result = ExternalContextSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test("defaults numericScores and extractedEvents", () => {
    const result = ExternalContextSchema.parse({});
    expect(result.numericScores).toEqual({});
    expect(result.extractedEvents).toEqual([]);
  });
});

// ============================================
// Helper Function Tests
// ============================================

describe("createEmptyExternalContext", () => {
  test("returns empty context", () => {
    const ctx = createEmptyExternalContext();
    expect(ctx.numericScores).toEqual({});
    expect(ctx.extractedEvents).toEqual([]);
    expect(ctx.news).toBeUndefined();
    expect(ctx.sentiment).toBeUndefined();
  });
});

describe("hasExternalContext", () => {
  test("returns false for empty context", () => {
    const ctx = createEmptyExternalContext();
    expect(hasExternalContext(ctx)).toBe(false);
  });

  test("returns true if numericScores present", () => {
    const ctx = { numericScores: { sentiment: 0.5 }, extractedEvents: [] };
    expect(hasExternalContext(ctx)).toBe(true);
  });

  test("returns true if extractedEvents present", () => {
    const ctx = {
      numericScores: {},
      extractedEvents: [{ eventId: "1", eventType: "NEWS" as const, payload: {} }],
    };
    expect(hasExternalContext(ctx)).toBe(true);
  });

  test("returns true if news present", () => {
    const ctx = {
      numericScores: {},
      extractedEvents: [],
      news: { items: [], itemCount: 0, periodHours: 24 },
    };
    expect(hasExternalContext(ctx)).toBe(true);
  });

  test("returns true if sentiment present", () => {
    const ctx = {
      numericScores: {},
      extractedEvents: [],
      sentiment: { socialSentiments: [] },
    };
    expect(hasExternalContext(ctx)).toBe(true);
  });
});

describe("getSentimentScore", () => {
  test("returns numericScores.sentiment first", () => {
    const ctx = {
      numericScores: { sentiment: 0.7 },
      extractedEvents: [],
      sentiment: { combinedScore: 0.5 },
    };
    expect(getSentimentScore(ctx)).toBe(0.7);
  });

  test("returns sentiment.combinedScore second", () => {
    const ctx = {
      numericScores: {},
      extractedEvents: [],
      sentiment: { combinedScore: 0.5, newsSentiment: 0.3, socialSentiments: [] },
    };
    expect(getSentimentScore(ctx)).toBe(0.5);
  });

  test("returns sentiment.newsSentiment third", () => {
    const ctx = {
      numericScores: {},
      extractedEvents: [],
      sentiment: { newsSentiment: 0.3, socialSentiments: [] },
    };
    expect(getSentimentScore(ctx)).toBe(0.3);
  });

  test("returns news.aggregateSentiment last", () => {
    const ctx = {
      numericScores: {},
      extractedEvents: [],
      news: { items: [], itemCount: 0, aggregateSentiment: 0.2, periodHours: 24 },
    };
    expect(getSentimentScore(ctx)).toBe(0.2);
  });

  test("returns undefined if no sentiment available", () => {
    const ctx = createEmptyExternalContext();
    expect(getSentimentScore(ctx)).toBeUndefined();
  });
});
