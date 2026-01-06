/**
 * Scoring Tests
 */

import { describe, expect, it } from "bun:test";
import type { ExtractionResult } from "../src/index.js";
import {
  aggregateSentimentScores,
  applyEventTypeBoost,
  classifyImportance,
  classifySentimentScore,
  classifySurprise,
  computeAggregatedSurprise,
  computeEntityRelevance,
  computeImportanceScore,
  computeRecencyScore,
  computeSentimentFromExtraction,
  computeSentimentMomentum,
  computeSentimentScore,
  computeSurpriseFromExtraction,
  computeSurpriseScore,
  getSourceCredibility,
  getSurpriseDirection,
  isSurpriseSignificant,
} from "../src/index.js";

describe("Sentiment Scoring", () => {
  it("should compute bullish sentiment score", () => {
    const score = computeSentimentScore("bullish", 1.0);
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("should compute bearish sentiment score", () => {
    const score = computeSentimentScore("bearish", 1.0);
    expect(score).toBeLessThan(-0.5);
    expect(score).toBeGreaterThanOrEqual(-1);
  });

  it("should compute neutral sentiment score", () => {
    const score = computeSentimentScore("neutral", 1.0);
    expect(score).toBe(0);
  });

  it("should apply confidence weighting", () => {
    const highConfidence = computeSentimentScore("bullish", 1.0);
    const lowConfidence = computeSentimentScore("bullish", 0.5);
    expect(lowConfidence).toBeLessThan(highConfidence);
  });

  it("should compute from extraction", () => {
    const extraction: ExtractionResult = {
      sentiment: "bullish",
      confidence: 0.9,
      entities: [],
      dataPoints: [],
      eventType: "earnings",
      importance: 4,
      summary: "Test",
      keyInsights: [],
    };
    const score = computeSentimentFromExtraction(extraction);
    expect(score).toBeGreaterThan(0);
  });

  it("should aggregate sentiment scores", () => {
    const scores = [0.5, 0.3, 0.7];
    const mean = aggregateSentimentScores(scores, "mean");
    expect(mean).toBe(0.5);

    const median = aggregateSentimentScores(scores, "median");
    expect(median).toBe(0.5);
  });

  it("should return 0 for empty scores array", () => {
    const result = aggregateSentimentScores([], "mean");
    expect(result).toBe(0);
  });

  it("should return single score for array of length 1", () => {
    const result = aggregateSentimentScores([0.75], "mean");
    expect(result).toBe(0.75);
  });

  it("should compute median for even-length array", () => {
    const scores = [0.2, 0.4, 0.6, 0.8];
    const median = aggregateSentimentScores(scores, "median");
    expect(median).toBe(0.5); // (0.4 + 0.6) / 2
  });

  it("should compute weighted aggregation with valid weights", () => {
    const scores = [0.5, 0.8];
    const weights = [1, 3]; // weight second score 3x more
    const result = aggregateSentimentScores(scores, "weighted", weights);
    // (0.5 * 1 + 0.8 * 3) / (1 + 3) = (0.5 + 2.4) / 4 = 0.725
    expect(result).toBeCloseTo(0.725, 2);
  });

  it("should fall back to mean when weights not provided for weighted", () => {
    const scores = [0.4, 0.6];
    const result = aggregateSentimentScores(scores, "weighted");
    expect(result).toBe(0.5); // mean of 0.4 and 0.6
  });

  it("should fall back to mean when weights length mismatch", () => {
    const scores = [0.4, 0.6, 0.8];
    const weights = [1, 2]; // Wrong length
    const result = aggregateSentimentScores(scores, "weighted", weights);
    expect(result).toBeCloseTo(0.6, 2); // mean
  });

  it("should return 0 when total weight is zero", () => {
    const scores = [0.4, 0.6];
    const weights = [0, 0];
    const result = aggregateSentimentScores(scores, "weighted", weights);
    expect(result).toBe(0);
  });

  it("should classify sentiment scores", () => {
    expect(classifySentimentScore(0.7)).toBe("strong_bullish");
    expect(classifySentimentScore(0.3)).toBe("bullish");
    expect(classifySentimentScore(0)).toBe("neutral");
    expect(classifySentimentScore(-0.3)).toBe("bearish");
    expect(classifySentimentScore(-0.7)).toBe("strong_bearish");
  });

  it("should compute sentiment momentum", () => {
    const recent = [0.5, 0.6, 0.7];
    const older = [0.2, 0.3, 0.4];
    const momentum = computeSentimentMomentum(recent, older);
    expect(momentum).toBeGreaterThan(0);
  });
});

describe("Importance Scoring", () => {
  const baseExtraction: ExtractionResult = {
    sentiment: "neutral",
    confidence: 0.8,
    entities: [{ name: "Apple", type: "company", ticker: "AAPL" }],
    dataPoints: [],
    eventType: "earnings",
    importance: 4,
    summary: "Test",
    keyInsights: [],
  };

  it("should compute importance score", () => {
    const score = computeImportanceScore(baseExtraction, "news", "reuters.com", new Date(), [
      "AAPL",
    ]);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("should give higher credibility to press releases", () => {
    const prCredibility = getSourceCredibility("press_release", "");
    const newsCredibility = getSourceCredibility("news", "unknown-site.com");
    expect(prCredibility).toBeGreaterThan(newsCredibility);
  });

  it("should decay recency over time", () => {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const recentScore = computeRecencyScore(now, 24);
    const oldScore = computeRecencyScore(dayAgo, 24);

    expect(recentScore).toBeGreaterThan(oldScore);
    expect(oldScore).toBeCloseTo(0.5, 1); // Half-life
  });

  it("should compute entity relevance", () => {
    const score = computeEntityRelevance(baseExtraction, ["AAPL", "MSFT"]);
    expect(score).toBeGreaterThan(0);
  });

  it("should classify importance", () => {
    expect(classifyImportance(0.95)).toBe("critical");
    expect(classifyImportance(0.75)).toBe("high");
    expect(classifyImportance(0.5)).toBe("medium");
    expect(classifyImportance(0.25)).toBe("low");
    expect(classifyImportance(0.1)).toBe("minimal");
  });

  it("should give full score for future events", () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day in future
    const score = computeRecencyScore(futureDate, 24);
    expect(score).toBe(1.0);
  });

  it("should match entity by name when ticker matches target symbol", () => {
    const extraction: ExtractionResult = {
      sentiment: "neutral",
      confidence: 0.8,
      entities: [{ name: "MSFT", type: "company" }], // Entity name is the symbol
      dataPoints: [],
      eventType: "other",
      importance: 3,
      summary: "Test",
      keyInsights: [],
    };
    const score = computeEntityRelevance(extraction, ["AAPL", "MSFT"]);
    expect(score).toBeGreaterThan(0);
  });

  it("should apply event type boost for earnings", () => {
    const boosted = applyEventTypeBoost(0.5, "earnings");
    expect(boosted).toBe(0.6); // 0.5 + 0.1 boost
  });

  it("should apply event type boost for guidance", () => {
    const boosted = applyEventTypeBoost(0.5, "guidance");
    expect(boosted).toBe(0.65); // 0.5 + 0.15 boost
  });

  it("should apply event type boost for merger_acquisition", () => {
    const boosted = applyEventTypeBoost(0.5, "merger_acquisition");
    expect(boosted).toBe(0.7); // 0.5 + 0.2 boost
  });

  it("should apply no boost for unknown event type", () => {
    const boosted = applyEventTypeBoost(0.5, "unknown_type");
    expect(boosted).toBe(0.5); // No boost
  });

  it("should cap boosted score at 1", () => {
    const boosted = applyEventTypeBoost(0.95, "merger_acquisition");
    expect(boosted).toBe(1); // Capped at 1
  });
});

describe("Surprise Scoring", () => {
  it("should compute positive surprise for beat", () => {
    const score = computeSurpriseScore(110, 100);
    expect(score).toBeGreaterThan(0);
  });

  it("should compute negative surprise for miss", () => {
    const score = computeSurpriseScore(90, 100);
    expect(score).toBeLessThan(0);
  });

  it("should compute zero for inline", () => {
    const score = computeSurpriseScore(100, 100);
    expect(score).toBe(0);
  });

  it("should cap at max deviation", () => {
    const hugeBeat = computeSurpriseScore(200, 100, { maxDeviation: 0.5 });
    expect(hugeBeat).toBeLessThanOrEqual(1);
    expect(hugeBeat).toBeCloseTo(1, 1);
  });

  it("should handle zero expected value with positive actual", () => {
    const score = computeSurpriseScore(10, 0);
    expect(score).toBe(0.5);
  });

  it("should handle zero expected value with negative actual", () => {
    const score = computeSurpriseScore(-10, 0);
    expect(score).toBe(-0.5);
  });

  it("should handle zero expected value with zero actual", () => {
    const score = computeSurpriseScore(0, 0);
    expect(score).toBe(0);
  });

  it("should aggregate multiple surprises", () => {
    const dataPoints = [
      { actual: 110, expected: 100, weight: 1 },
      { actual: 95, expected: 100, weight: 1 },
    ];
    const agg = computeAggregatedSurprise(dataPoints);
    expect(agg).toBeGreaterThan(-0.5);
    expect(agg).toBeLessThan(0.5);
  });

  it("should return 0 for empty data points", () => {
    const agg = computeAggregatedSurprise([]);
    expect(agg).toBe(0);
  });

  it("should return 0 when total weight is zero", () => {
    const dataPoints = [
      { actual: 110, expected: 100, weight: 0 },
      { actual: 95, expected: 100, weight: 0 },
    ];
    const agg = computeAggregatedSurprise(dataPoints);
    expect(agg).toBe(0);
  });

  it("should classify surprise", () => {
    expect(classifySurprise(0.6)).toBe("big_beat");
    expect(classifySurprise(0.3)).toBe("beat");
    expect(classifySurprise(0)).toBe("inline");
    expect(classifySurprise(-0.3)).toBe("miss");
    expect(classifySurprise(-0.6)).toBe("big_miss");
  });

  it("should detect significant surprise", () => {
    expect(isSurpriseSignificant(0.2)).toBe(true);
    expect(isSurpriseSignificant(0.1)).toBe(false);
    expect(isSurpriseSignificant(-0.2)).toBe(true);
  });

  it("should get surprise direction", () => {
    expect(getSurpriseDirection(0.2)).toBe("positive");
    expect(getSurpriseDirection(-0.2)).toBe("negative");
    expect(getSurpriseDirection(0)).toBe("neutral");
  });

  it("should compute surprise from extraction with matching data points", () => {
    const extraction: ExtractionResult = {
      sentiment: "bullish",
      confidence: 0.8,
      entities: [],
      dataPoints: [
        { metric: "revenue", value: 110, unit: "B" },
        { metric: "eps", value: 2.5, unit: "USD" },
      ],
      eventType: "earnings",
      importance: 4,
      summary: "Test",
      keyInsights: [],
    };

    const expectations = [
      { metric: "revenue", expectedValue: 100 },
      { metric: "eps", expectedValue: 2.0 },
    ];

    const score = computeSurpriseFromExtraction(extraction, expectations);
    expect(score).toBeGreaterThan(0); // Should be positive (beat expectations)
  });

  it("should compute surprise from extraction with partial match", () => {
    const extraction: ExtractionResult = {
      sentiment: "bullish",
      confidence: 0.8,
      entities: [],
      dataPoints: [{ metric: "total revenue", value: 110, unit: "B" }],
      eventType: "earnings",
      importance: 4,
      summary: "Test",
      keyInsights: [],
    };

    const expectations = [{ metric: "revenue", expectedValue: 100 }];

    const score = computeSurpriseFromExtraction(extraction, expectations);
    expect(score).toBeGreaterThan(0); // Partial match: "total revenue" contains "revenue"
  });

  it("should compute surprise from extraction with no matches (fallback to event-based)", () => {
    const extraction: ExtractionResult = {
      sentiment: "bullish",
      confidence: 0.8,
      entities: [],
      dataPoints: [{ metric: "unknown_metric", value: 110, unit: "B" }],
      eventType: "earnings",
      importance: 4,
      summary: "Test",
      keyInsights: [],
    };

    const expectations = [{ metric: "completely_different", expectedValue: 100 }];

    const score = computeSurpriseFromExtraction(extraction, expectations);
    // Falls back to event-based surprise
    expect(typeof score).toBe("number");
  });

  it("should compute surprise from extraction with empty data points", () => {
    const extraction: ExtractionResult = {
      sentiment: "bullish",
      confidence: 0.8,
      entities: [],
      dataPoints: [],
      eventType: "earnings",
      importance: 4,
      summary: "Test",
      keyInsights: [],
    };

    const score = computeSurpriseFromExtraction(extraction, []);
    // Falls back to event-based surprise
    expect(typeof score).toBe("number");
  });

  it("should apply metric weight for eps", () => {
    const extraction: ExtractionResult = {
      sentiment: "bullish",
      confidence: 0.8,
      entities: [],
      dataPoints: [{ metric: "EPS", value: 2.5, unit: "USD" }],
      eventType: "earnings",
      importance: 4,
      summary: "Test",
      keyInsights: [],
    };

    const expectations = [{ metric: "eps", expectedValue: 2.0 }];

    const score = computeSurpriseFromExtraction(extraction, expectations);
    expect(score).toBeGreaterThan(0);
  });

  it("should apply metric weight for growth", () => {
    const extraction: ExtractionResult = {
      sentiment: "bullish",
      confidence: 0.8,
      entities: [],
      dataPoints: [{ metric: "revenue growth", value: 15, unit: "%" }],
      eventType: "earnings",
      importance: 4,
      summary: "Test",
      keyInsights: [],
    };

    const expectations = [{ metric: "growth", expectedValue: 10 }];

    const score = computeSurpriseFromExtraction(extraction, expectations);
    expect(score).toBeGreaterThan(0);
  });

  it("should use default weight for unknown metrics", () => {
    const extraction: ExtractionResult = {
      sentiment: "bullish",
      confidence: 0.8,
      entities: [],
      dataPoints: [{ metric: "custom_metric_xyz", value: 110, unit: "units" }],
      eventType: "earnings",
      importance: 4,
      summary: "Test",
      keyInsights: [],
    };

    const expectations = [{ metric: "custom_metric_xyz", expectedValue: 100 }];

    const score = computeSurpriseFromExtraction(extraction, expectations);
    expect(score).toBeGreaterThan(0);
  });
});
