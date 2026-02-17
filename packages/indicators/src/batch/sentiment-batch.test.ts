/**
 * Sentiment Aggregation Batch Job Tests
 *
 * Tests for sentiment calculation functions.
 */

import { describe, expect, it } from "bun:test";
import { requireValue } from "@cream/test-utils";
import {
	aggregateSentimentScores,
	calculateRecencyWeight,
	calculateSentimentMomentum,
	calculateSentimentStrength,
	computeSentimentScore,
	detectEventRisk,
	type ExtractedSentiment,
} from "./sentiment-batch.js";

function createMockSentiment(overrides: Partial<ExtractedSentiment> = {}): ExtractedSentiment {
	return {
		symbol: "AAPL",
		sourceType: "news",
		sentiment: "bullish",
		confidence: 0.8,
		eventTime: new Date("2024-01-15T12:00:00Z"),
		importance: 3,
		...overrides,
	};
}

describe("computeSentimentScore", () => {
	it("returns positive score for bullish sentiment", () => {
		const result = computeSentimentScore("bullish", 1.0);
		expect(result).toBe(0.8);
	});

	it("returns negative score for bearish sentiment", () => {
		const result = computeSentimentScore("bearish", 1.0);
		expect(result).toBe(-0.8);
	});

	it("returns zero for neutral sentiment", () => {
		const result = computeSentimentScore("neutral", 1.0);
		expect(result).toBe(0);
	});

	it("applies confidence weighting by default", () => {
		const result = computeSentimentScore("bullish", 0.5);
		expect(result).toBe(0.4); // 0.8 * 0.5
	});

	it("can disable confidence weighting", () => {
		const result = computeSentimentScore("bullish", 0.5, { applyConfidence: false });
		expect(result).toBe(0.8);
	});

	it("respects custom base scores", () => {
		const result = computeSentimentScore("bullish", 1.0, { bullishBase: 1.0 });
		expect(result).toBe(1.0);
	});
});

describe("calculateRecencyWeight", () => {
	it("returns 1.0 for same-time events", () => {
		const eventTime = new Date("2024-01-15T12:00:00Z");
		const referenceTime = new Date("2024-01-15T12:00:00Z");
		const result = calculateRecencyWeight(eventTime, referenceTime);
		expect(result).toBe(1.0);
	});

	it("returns 0.5 for events at half-life", () => {
		const eventTime = new Date("2024-01-14T12:00:00Z");
		const referenceTime = new Date("2024-01-15T12:00:00Z");
		const result = calculateRecencyWeight(eventTime, referenceTime, 24);
		expect(result).toBeCloseTo(0.5, 5);
	});

	it("decays exponentially with time", () => {
		const eventTime = new Date("2024-01-13T12:00:00Z"); // 48 hours ago
		const referenceTime = new Date("2024-01-15T12:00:00Z");
		const result = calculateRecencyWeight(eventTime, referenceTime, 24);
		expect(result).toBeCloseTo(0.25, 5); // 0.5^2
	});

	it("approaches zero for very old events", () => {
		const eventTime = new Date("2024-01-01T12:00:00Z"); // 14 days ago
		const referenceTime = new Date("2024-01-15T12:00:00Z");
		const result = calculateRecencyWeight(eventTime, referenceTime, 24);
		expect(result).toBeLessThan(0.001);
	});
});

describe("aggregateSentimentScores", () => {
	it("returns null for empty array", () => {
		const result = aggregateSentimentScores([]);
		expect(result).toBeNull();
	});

	it("returns single score when only one entry", () => {
		const result = aggregateSentimentScores([{ score: 0.5, weight: 1.0 }]);
		expect(result).toBe(0.5);
	});

	it("calculates weighted average correctly", () => {
		const result = aggregateSentimentScores([
			{ score: 0.8, weight: 1.0 },
			{ score: 0.4, weight: 1.0 },
		]);
		expect(result).toBeCloseTo(0.6, 5); // (0.8 + 0.4) / 2
	});

	it("applies weights correctly", () => {
		const result = aggregateSentimentScores([
			{ score: 0.8, weight: 3.0 }, // High weight
			{ score: 0.2, weight: 1.0 }, // Low weight
		]);
		// (0.8 * 3 + 0.2 * 1) / (3 + 1) = 2.6 / 4 = 0.65
		expect(result).toBeCloseTo(0.65, 5);
	});

	it("returns null when total weight is zero", () => {
		const result = aggregateSentimentScores([
			{ score: 0.5, weight: 0 },
			{ score: 0.3, weight: 0 },
		]);
		expect(result).toBeNull();
	});
});

describe("calculateSentimentStrength", () => {
	it("returns null for empty array", () => {
		const result = calculateSentimentStrength([]);
		expect(result).toBeNull();
	});

	it("returns higher strength for high confidence", () => {
		const highConfidence = calculateSentimentStrength([{ confidence: 0.9, weight: 1.0 }]);
		const lowConfidence = calculateSentimentStrength([{ confidence: 0.3, weight: 1.0 }]);
		const highValue = requireValue(highConfidence, "high confidence");
		const lowValue = requireValue(lowConfidence, "low confidence");
		expect(highValue).toBeGreaterThan(lowValue);
	});

	it("increases with volume (up to a point)", () => {
		const singleEntry = calculateSentimentStrength([{ confidence: 0.8, weight: 1.0 }]);
		const multipleEntries = calculateSentimentStrength([
			{ confidence: 0.8, weight: 1.0 },
			{ confidence: 0.8, weight: 1.0 },
			{ confidence: 0.8, weight: 1.0 },
			{ confidence: 0.8, weight: 1.0 },
			{ confidence: 0.8, weight: 1.0 },
		]);
		const multipleValue = requireValue(multipleEntries, "multiple entries");
		const singleValue = requireValue(singleEntry, "single entry");
		expect(multipleValue).toBeGreaterThan(singleValue);
	});
});

describe("calculateSentimentMomentum", () => {
	it("returns null when short-term is empty", () => {
		const result = calculateSentimentMomentum([], [0.5, 0.4, 0.3]);
		expect(result).toBeNull();
	});

	it("returns null when long-term is empty", () => {
		const result = calculateSentimentMomentum([0.5, 0.4], []);
		expect(result).toBeNull();
	});

	it("returns positive for improving sentiment", () => {
		const shortTerm = [0.6, 0.7, 0.8]; // Avg: 0.7
		const longTerm = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]; // Avg: 0.55
		const result = calculateSentimentMomentum(shortTerm, longTerm);
		expect(requireValue(result, "momentum result")).toBeGreaterThan(0);
	});

	it("returns negative for declining sentiment", () => {
		const shortTerm = [0.2, 0.3, 0.4]; // Avg: 0.3
		const longTerm = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]; // Avg: 0.75
		const result = calculateSentimentMomentum(shortTerm, longTerm);
		expect(requireValue(result, "momentum result")).toBeLessThan(0);
	});

	it("returns zero for stable sentiment", () => {
		const shortTerm = [0.5, 0.5, 0.5];
		const longTerm = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
		const result = calculateSentimentMomentum(shortTerm, longTerm);
		expect(result).toBe(0);
	});
});

describe("detectEventRisk", () => {
	it("returns false for empty array", () => {
		const result = detectEventRisk([]);
		expect(result).toBe(false);
	});

	it("returns false for low-importance events", () => {
		const result = detectEventRisk([createMockSentiment({ eventType: "earnings", importance: 2 })]);
		expect(result).toBe(false);
	});

	it("returns true for high-importance earnings", () => {
		const result = detectEventRisk([createMockSentiment({ eventType: "earnings", importance: 4 })]);
		expect(result).toBe(true);
	});

	it("returns true for high-importance M&A", () => {
		const result = detectEventRisk([
			createMockSentiment({ eventType: "merger_acquisition", importance: 3 }),
		]);
		expect(result).toBe(true);
	});

	it("returns true for regulatory events", () => {
		const result = detectEventRisk([
			createMockSentiment({ eventType: "regulatory", importance: 5 }),
		]);
		expect(result).toBe(true);
	});

	it("returns false for non-risk event types", () => {
		const result = detectEventRisk([
			createMockSentiment({ eventType: "product_launch", importance: 5 }),
		]);
		expect(result).toBe(false);
	});
});
