/**
 * Scoring Tests
 */

import { describe, expect, it } from "bun:test";
import {
  computeSentimentScore,
  computeSentimentFromExtraction,
  aggregateSentimentScores,
  classifySentimentScore,
  computeSentimentMomentum,
  computeImportanceScore,
  getSourceCredibility,
  computeRecencyScore,
  computeEntityRelevance,
  classifyImportance,
  computeSurpriseScore,
  computeAggregatedSurprise,
  classifySurprise,
  isSurpriseSignificant,
  getSurpriseDirection,
} from "../src/index.js";
import type { ExtractionResult } from "../src/index.js";

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
    const score = computeImportanceScore(
      baseExtraction,
      "news",
      "reuters.com",
      new Date(),
      ["AAPL"],
    );
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

  it("should aggregate multiple surprises", () => {
    const dataPoints = [
      { actual: 110, expected: 100, weight: 1 },
      { actual: 95, expected: 100, weight: 1 },
    ];
    const agg = computeAggregatedSurprise(dataPoints);
    expect(agg).toBeGreaterThan(-0.5);
    expect(agg).toBeLessThan(0.5);
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
});
