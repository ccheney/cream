import { describe, expect, it } from "bun:test";
import {
	type Decision,
	getDecisionDirection,
	validateDecisionPlan,
	validateRiskLevels,
} from "./decision";

const baseDecision: Decision = {
	instrument: { instrumentId: "AAPL", instrumentType: "EQUITY" },
	action: "BUY",
	size: { quantity: 100, unit: "SHARES", targetPositionQuantity: 100 },
	orderPlan: {
		entryOrderType: "LIMIT",
		entryLimitPrice: 150,
		exitOrderType: "MARKET",
		timeInForce: "DAY",
	},
	riskLevels: {
		stopLossLevel: 145,
		takeProfitLevel: 160,
		denomination: "UNDERLYING_PRICE",
	},
	strategyFamily: "TREND",
	rationale: "Test decision for direction detection",
	confidence: 0.5,
};

describe("getDecisionDirection by action", () => {
	it("detects LONG for BUY", () => {
		expect(getDecisionDirection({ ...baseDecision, action: "BUY" })).toBe("LONG");
	});

	it("detects SHORT for SELL", () => {
		expect(getDecisionDirection({ ...baseDecision, action: "SELL" })).toBe("SHORT");
	});

	it("detects FLAT for CLOSE", () => {
		expect(getDecisionDirection({ ...baseDecision, action: "CLOSE" })).toBe("FLAT");
	});
});

describe("getDecisionDirection by target position", () => {
	it("detects LONG for positive target", () => {
		expect(
			getDecisionDirection({
				...baseDecision,
				action: "HOLD",
				size: { quantity: 0, unit: "SHARES", targetPositionQuantity: 100 },
			}),
		).toBe("LONG");
	});

	it("detects SHORT for negative target", () => {
		expect(
			getDecisionDirection({
				...baseDecision,
				action: "NO_TRADE",
				size: { quantity: 0, unit: "SHARES", targetPositionQuantity: -50 },
			}),
		).toBe("SHORT");
	});

	it("detects FLAT for zero target", () => {
		expect(
			getDecisionDirection({
				...baseDecision,
				action: "REDUCE",
				size: { quantity: 100, unit: "SHARES", targetPositionQuantity: 0 },
			}),
		).toBe("FLAT");
	});

	it("handles INCREASE and REDUCE with signed targets", () => {
		expect(
			getDecisionDirection({
				...baseDecision,
				action: "INCREASE",
				size: { quantity: 50, unit: "SHARES", targetPositionQuantity: 150 },
			}),
		).toBe("LONG");
		expect(
			getDecisionDirection({
				...baseDecision,
				action: "REDUCE",
				size: { quantity: 50, unit: "SHARES", targetPositionQuantity: -50 },
			}),
		).toBe("SHORT");
	});
});

const longDecision: Decision = {
	instrument: { instrumentId: "AAPL", instrumentType: "EQUITY" },
	action: "BUY",
	size: { quantity: 100, unit: "SHARES", targetPositionQuantity: 100 },
	orderPlan: {
		entryOrderType: "LIMIT",
		entryLimitPrice: 100,
		exitOrderType: "MARKET",
		timeInForce: "DAY",
	},
	riskLevels: {
		stopLossLevel: 95,
		takeProfitLevel: 110,
		denomination: "UNDERLYING_PRICE",
	},
	strategyFamily: "TREND",
	rationale: "Test LONG position risk validation",
	confidence: 0.7,
};

const shortDecision: Decision = {
	...longDecision,
	action: "SELL",
	size: { quantity: 100, unit: "SHARES", targetPositionQuantity: -100 },
	riskLevels: {
		stopLossLevel: 105,
		takeProfitLevel: 90,
		denomination: "UNDERLYING_PRICE",
	},
};

describe("validateRiskLevels LONG and SHORT", () => {
	it("validates correct LONG and SHORT risk levels", () => {
		expect(validateRiskLevels(longDecision, 100).valid).toBe(true);
		expect(validateRiskLevels(shortDecision, 100).valid).toBe(true);
	});

	it("fails invalid LONG directionality", () => {
		const badLongStop = {
			...longDecision,
			riskLevels: {
				stopLossLevel: 105,
				takeProfitLevel: 110,
				denomination: "UNDERLYING_PRICE" as const,
			},
		};
		const badLongTarget = {
			...longDecision,
			riskLevels: {
				stopLossLevel: 95,
				takeProfitLevel: 95,
				denomination: "UNDERLYING_PRICE" as const,
			},
		};
		expect(validateRiskLevels(badLongStop, 100).valid).toBe(false);
		expect(validateRiskLevels(badLongTarget, 100).valid).toBe(false);
	});

	it("fails invalid SHORT directionality", () => {
		const badShortStop = {
			...shortDecision,
			riskLevels: {
				stopLossLevel: 95,
				takeProfitLevel: 90,
				denomination: "UNDERLYING_PRICE" as const,
			},
		};
		const badShortTarget = {
			...shortDecision,
			riskLevels: {
				stopLossLevel: 105,
				takeProfitLevel: 105,
				denomination: "UNDERLYING_PRICE" as const,
			},
		};
		expect(validateRiskLevels(badShortStop, 100).valid).toBe(false);
		expect(validateRiskLevels(badShortTarget, 100).valid).toBe(false);
	});
});

describe("validateRiskLevels ratios and warnings", () => {
	it("calculates expected risk-reward ratio", () => {
		expect(validateRiskLevels(longDecision, 100).riskRewardRatio).toBe(2);
	});

	it("warns when risk-reward is too low", () => {
		const lowRR = {
			...longDecision,
			riskLevels: {
				stopLossLevel: 90,
				takeProfitLevel: 105,
				denomination: "UNDERLYING_PRICE" as const,
			},
		};
		const result = validateRiskLevels(lowRR, 100);
		expect(result.warnings[0]).toContain("below minimum 1.5:1");
	});

	it("warns when stop distance exceeds 5x profit target", () => {
		const highStop = {
			...longDecision,
			riskLevels: {
				stopLossLevel: 40,
				takeProfitLevel: 110,
				denomination: "UNDERLYING_PRICE",
			},
		};
		expect(validateRiskLevels(highStop, 100).warnings.some((w) => w.includes("5x"))).toBe(true);
	});

	it("skips detailed validation for FLAT direction", () => {
		const flatDecision: Decision = {
			...longDecision,
			action: "REDUCE",
			size: { quantity: 100, unit: "SHARES", targetPositionQuantity: 0 },
		};
		const result = validateRiskLevels(flatDecision, 100);
		expect(result.valid).toBe(true);
		expect(result.riskRewardRatio).toBeNull();
	});
});

const validPlan = {
	cycleId: "2026-01-04T15:00:00Z",
	asOfTimestamp: "2026-01-04T15:00:00Z",
	environment: "PAPER",
	decisions: [
		{
			instrument: { instrumentId: "AAPL", instrumentType: "EQUITY" },
			action: "BUY",
			size: { quantity: 100, unit: "SHARES", targetPositionQuantity: 100 },
			orderPlan: {
				entryOrderType: "LIMIT",
				entryLimitPrice: 150,
				exitOrderType: "MARKET",
				timeInForce: "DAY",
			},
			riskLevels: {
				stopLossLevel: 145,
				takeProfitLevel: 160,
				denomination: "UNDERLYING_PRICE",
			},
			strategyFamily: "TREND",
			rationale: "Strong uptrend with bullish momentum",
			confidence: 0.75,
		},
	],
};

describe("validateDecisionPlan", () => {
	it("validates complete plan with entry prices", () => {
		const entryPrices = new Map([["AAPL", 150]]);
		const result = validateDecisionPlan(validPlan, entryPrices);
		expect(result.success).toBe(true);
		expect(result.data).toBeDefined();
	});

	it("fails with invalid risk levels", () => {
		const badPlan = {
			...validPlan,
			decisions: [
				{
					...validPlan.decisions[0],
					riskLevels: {
						stopLossLevel: 160,
						takeProfitLevel: 170,
						denomination: "UNDERLYING_PRICE",
					},
				},
			],
		};
		const result = validateDecisionPlan(badPlan, new Map([["AAPL", 150]]));
		expect(result.success).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it("returns warnings for low risk-reward", () => {
		const lowRRPlan = {
			...validPlan,
			decisions: [
				{
					...validPlan.decisions[0],
					riskLevels: {
						stopLossLevel: 140,
						takeProfitLevel: 155,
						denomination: "UNDERLYING_PRICE",
					},
				},
			],
		};
		const result = validateDecisionPlan(lowRRPlan, new Map([["AAPL", 150]]));
		expect(result.success).toBe(true);
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	it("returns schema errors for invalid plan structure", () => {
		const invalidPlan = {
			cycleId: "2026-01-04T15:00:00Z",
			asOfTimestamp: "invalid-timestamp",
			environment: "PAPER",
			decisions: [],
		};
		const result = validateDecisionPlan(invalidPlan, new Map<string, number>());
		expect(result.success).toBe(false);
		expect(result.errors.some((error) => error.includes("asOfTimestamp"))).toBe(true);
	});
});
