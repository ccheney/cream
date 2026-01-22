/**
 * Tests for prediction markets domain schemas
 */

import { describe, expect, it } from "bun:test";
import {
	AggregatedPredictionDataSchema,
	createEmptyPredictionScores,
	getFedDirection,
	hasHighMacroUncertainty,
	hasHighPolicyRisk,
	PredictionMarketEventSchema,
	PredictionMarketScoresSchema,
	PredictionMarketType,
	PredictionOutcomeSchema,
	PredictionPlatform,
	toNumericScores,
} from "./prediction-markets";

describe("PredictionPlatform", () => {
	it("should accept valid platforms", () => {
		expect(PredictionPlatform.parse("KALSHI")).toBe("KALSHI");
		expect(PredictionPlatform.parse("POLYMARKET")).toBe("POLYMARKET");
	});

	it("should reject invalid platforms", () => {
		expect(() => PredictionPlatform.parse("INVALID")).toThrow();
	});
});

describe("PredictionMarketType", () => {
	it("should accept all valid market types", () => {
		const validTypes = [
			"FED_RATE",
			"ECONOMIC_DATA",
			"RECESSION",
			"GEOPOLITICAL",
			"REGULATORY",
			"ELECTION",
		];
		for (const type of validTypes) {
			expect(PredictionMarketType.parse(type)).toBe(type);
		}
	});

	it("should reject invalid market types", () => {
		expect(() => PredictionMarketType.parse("CRYPTO")).toThrow();
	});
});

describe("PredictionOutcomeSchema", () => {
	it("should accept valid outcome", () => {
		const outcome = {
			outcome: "25bps cut",
			probability: 0.81,
			price: 0.81,
			volume24h: 2500000,
		};
		expect(PredictionOutcomeSchema.parse(outcome)).toEqual(outcome);
	});

	it("should accept outcome without optional volume24h", () => {
		const outcome = {
			outcome: "No change",
			probability: 0.15,
			price: 0.15,
		};
		expect(PredictionOutcomeSchema.parse(outcome)).toEqual(outcome);
	});

	it("should reject probability outside 0-1 range", () => {
		expect(() =>
			PredictionOutcomeSchema.parse({
				outcome: "Test",
				probability: 1.5,
				price: 0.5,
			}),
		).toThrow();

		expect(() =>
			PredictionOutcomeSchema.parse({
				outcome: "Test",
				probability: -0.1,
				price: 0.5,
			}),
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

	it("should accept boundary values", () => {
		const boundaryScores = {
			fedCutProbability: 0,
			fedHikeProbability: 1,
			cpiSurpriseDirection: -1,
			gdpSurpriseDirection: 1,
		};
		expect(PredictionMarketScoresSchema.parse(boundaryScores)).toEqual(boundaryScores);
	});

	it("should reject values outside ranges", () => {
		expect(() => PredictionMarketScoresSchema.parse({ cpiSurpriseDirection: 1.5 })).toThrow();

		expect(() => PredictionMarketScoresSchema.parse({ fedCutProbability: -0.1 })).toThrow();
	});
});

describe("AggregatedPredictionDataSchema", () => {
	it("should accept valid aggregated data", () => {
		const data = {
			events: [],
			scores: { fedCutProbability: 0.81 },
			lastUpdated: "2026-01-04T15:00:00Z",
			platforms: ["KALSHI", "POLYMARKET"],
		};
		expect(AggregatedPredictionDataSchema.parse(data)).toEqual(data);
	});

	it("should accept data with single platform", () => {
		const data = {
			events: [],
			scores: {},
			lastUpdated: "2026-01-04T15:00:00Z",
			platforms: ["KALSHI"],
		};
		expect(AggregatedPredictionDataSchema.parse(data)).toEqual(data);
	});
});

describe("createEmptyPredictionScores", () => {
	it("should return empty object", () => {
		expect(createEmptyPredictionScores()).toEqual({});
	});
});

describe("hasHighMacroUncertainty", () => {
	it("should return true when above default threshold", () => {
		expect(hasHighMacroUncertainty({ macroUncertaintyIndex: 0.6 })).toBe(true);
	});

	it("should return false when below threshold", () => {
		expect(hasHighMacroUncertainty({ macroUncertaintyIndex: 0.3 })).toBe(false);
	});

	it("should return false when undefined", () => {
		expect(hasHighMacroUncertainty({})).toBe(false);
	});

	it("should respect custom threshold", () => {
		expect(hasHighMacroUncertainty({ macroUncertaintyIndex: 0.6 }, 0.7)).toBe(false);
		expect(hasHighMacroUncertainty({ macroUncertaintyIndex: 0.8 }, 0.7)).toBe(true);
	});
});

describe("hasHighPolicyRisk", () => {
	it("should return true when above default threshold", () => {
		expect(hasHighPolicyRisk({ policyEventRisk: 0.5 })).toBe(true);
	});

	it("should return false when below threshold", () => {
		expect(hasHighPolicyRisk({ policyEventRisk: 0.3 })).toBe(false);
	});

	it("should return false when undefined", () => {
		expect(hasHighPolicyRisk({})).toBe(false);
	});
});

describe("getFedDirection", () => {
	it("should return CUT when cut probability is highest", () => {
		expect(getFedDirection({ fedCutProbability: 0.6, fedHikeProbability: 0.1 })).toBe("CUT");
	});

	it("should return HIKE when hike probability is highest", () => {
		expect(getFedDirection({ fedCutProbability: 0.1, fedHikeProbability: 0.6 })).toBe("HIKE");
	});

	it("should return HOLD when neither cut nor hike dominates", () => {
		expect(getFedDirection({ fedCutProbability: 0.2, fedHikeProbability: 0.2 })).toBe("HOLD");
	});

	it("should return HOLD when no probabilities defined", () => {
		expect(getFedDirection({})).toBe("HOLD");
	});
});

describe("toNumericScores", () => {
	it("should convert all defined scores", () => {
		const scores = {
			fedCutProbability: 0.81,
			fedHikeProbability: 0.01,
			recessionProbability12m: 0.23,
			macroUncertaintyIndex: 0.42,
			policyEventRisk: 0.35,
		};

		const result = toNumericScores(scores);

		expect(result.pm_fed_cut).toBe(0.81);
		expect(result.pm_fed_hike).toBe(0.01);
		expect(result.pm_recession_12m).toBe(0.23);
		expect(result.pm_macro_uncertainty).toBe(0.42);
		expect(result.pm_policy_risk).toBe(0.35);
	});

	it("should skip undefined scores", () => {
		const scores = {
			fedCutProbability: 0.5,
		};

		const result = toNumericScores(scores);

		expect(result).toEqual({ pm_fed_cut: 0.5 });
		expect(result.pm_fed_hike).toBeUndefined();
	});

	it("should return empty object for empty scores", () => {
		expect(toNumericScores({})).toEqual({});
	});
});
