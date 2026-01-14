/**
 * Tests for prediction-markets package types
 *
 * Note: Schema validation tests are in @cream/domain.
 * This file tests the package-specific exports and error classes.
 */

import { describe, expect, it } from "bun:test";
import {
	AuthenticationError,
	PACKAGE_NAME,
	PredictionMarketError,
	PredictionMarketEventSchema,
	PredictionMarketScoresSchema,
	PredictionMarketType,
	PredictionOutcomeSchema,
	PredictionPlatform,
	RateLimitError,
	VERSION,
} from "./index";

describe("Package metadata", () => {
	it("should export package name and version", () => {
		expect(PACKAGE_NAME).toBe("@cream/prediction-markets");
		expect(VERSION).toBe("0.0.1");
	});
});

describe("Schema re-exports", () => {
	it("should export PredictionPlatform", () => {
		expect(PredictionPlatform.parse("KALSHI")).toBe("KALSHI");
		expect(PredictionPlatform.parse("POLYMARKET")).toBe("POLYMARKET");
	});

	it("should export PredictionMarketType", () => {
		expect(PredictionMarketType.parse("FED_RATE")).toBe("FED_RATE");
		expect(PredictionMarketType.parse("RECESSION")).toBe("RECESSION");
	});

	it("should export PredictionOutcomeSchema", () => {
		const outcome = {
			outcome: "25bps cut",
			probability: 0.81,
			price: 0.81,
		};
		expect(PredictionOutcomeSchema.parse(outcome)).toEqual(outcome);
	});

	it("should export PredictionMarketEventSchema", () => {
		const event = {
			eventId: "pm_test",
			eventType: "PREDICTION_MARKET" as const,
			eventTime: "2026-01-29T19:00:00Z",
			payload: {
				platform: "KALSHI" as const,
				marketType: "FED_RATE" as const,
				marketTicker: "TEST",
				marketQuestion: "Test?",
				outcomes: [],
				lastUpdated: "2026-01-04T15:00:00Z",
			},
			relatedInstrumentIds: [],
		};
		expect(PredictionMarketEventSchema.parse(event)).toBeDefined();
	});

	it("should export PredictionMarketScoresSchema", () => {
		const scores = { fedCutProbability: 0.81 };
		expect(PredictionMarketScoresSchema.parse(scores)).toEqual(scores);
	});
});

describe("PredictionMarketError", () => {
	it("should create error with all properties", () => {
		const error = new PredictionMarketError("Test error", "KALSHI", "TEST_CODE");
		expect(error.message).toBe("Test error");
		expect(error.platform).toBe("KALSHI");
		expect(error.code).toBe("TEST_CODE");
		expect(error.name).toBe("PredictionMarketError");
	});

	it("should accept AGGREGATOR as platform", () => {
		const error = new PredictionMarketError("Aggregation failed", "AGGREGATOR", "AGG_ERROR");
		expect(error.platform).toBe("AGGREGATOR");
	});

	it("should preserve cause", () => {
		const cause = new Error("Original error");
		const error = new PredictionMarketError("Wrapped", "KALSHI", "WRAPPED", cause);
		expect(error.cause).toBe(cause);
	});
});

describe("RateLimitError", () => {
	it("should create rate limit error", () => {
		const error = new RateLimitError("POLYMARKET", 5000);
		expect(error.message).toBe("Rate limit exceeded for POLYMARKET");
		expect(error.platform).toBe("POLYMARKET");
		expect(error.code).toBe("RATE_LIMIT");
		expect(error.retryAfterMs).toBe(5000);
	});

	it("should be instanceof PredictionMarketError", () => {
		const error = new RateLimitError("KALSHI", 1000);
		expect(error instanceof PredictionMarketError).toBe(true);
	});
});

describe("AuthenticationError", () => {
	it("should create authentication error", () => {
		const error = new AuthenticationError("KALSHI", "Invalid API key");
		expect(error.message).toBe("Invalid API key");
		expect(error.platform).toBe("KALSHI");
		expect(error.code).toBe("AUTH_ERROR");
	});

	it("should be instanceof PredictionMarketError", () => {
		const error = new AuthenticationError("POLYMARKET", "Token expired");
		expect(error instanceof PredictionMarketError).toBe(true);
	});
});
