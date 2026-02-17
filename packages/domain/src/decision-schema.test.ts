import { describe, expect, it } from "bun:test";
import { Action, DecisionPlanSchema, DecisionSchema, RiskLevelsSchema } from "./decision";

describe("Action enum", () => {
	it("accepts valid actions", () => {
		expect(Action.parse("BUY")).toBe("BUY");
		expect(Action.parse("SELL")).toBe("SELL");
		expect(Action.parse("HOLD")).toBe("HOLD");
		expect(Action.parse("CLOSE")).toBe("CLOSE");
		expect(Action.parse("INCREASE")).toBe("INCREASE");
		expect(Action.parse("REDUCE")).toBe("REDUCE");
		expect(Action.parse("NO_TRADE")).toBe("NO_TRADE");
	});

	it("rejects invalid actions", () => {
		expect(() => Action.parse("OPEN")).toThrow();
		expect(() => Action.parse("CANCEL")).toThrow();
	});
});

describe("RiskLevelsSchema", () => {
	it("accepts valid risk levels", () => {
		const result = RiskLevelsSchema.parse({
			stopLossLevel: 95,
			takeProfitLevel: 110,
			denomination: "UNDERLYING_PRICE",
		});
		expect(result.stopLossLevel).toBe(95);
		expect(result.takeProfitLevel).toBe(110);
	});

	it("requires positive stopLossLevel", () => {
		expect(() =>
			RiskLevelsSchema.parse({
				stopLossLevel: -10,
				takeProfitLevel: 110,
				denomination: "UNDERLYING_PRICE",
			}),
		).toThrow();
	});

	it("requires positive takeProfitLevel", () => {
		expect(() =>
			RiskLevelsSchema.parse({
				stopLossLevel: 95,
				takeProfitLevel: -10,
				denomination: "UNDERLYING_PRICE",
			}),
		).toThrow();
	});

	it("requires stop and profit to be different", () => {
		expect(() =>
			RiskLevelsSchema.parse({
				stopLossLevel: 100,
				takeProfitLevel: 100,
				denomination: "UNDERLYING_PRICE",
			}),
		).toThrow();
	});

	it("requires denomination", () => {
		expect(() =>
			RiskLevelsSchema.parse({
				stopLossLevel: 95,
				takeProfitLevel: 110,
			}),
		).toThrow();
	});
});

const validDecision = {
	instrument: {
		instrumentId: "AAPL",
		instrumentType: "EQUITY",
	},
	action: "BUY",
	size: {
		quantity: 100,
		unit: "SHARES",
		targetPositionQuantity: 100,
	},
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
	rationale: "Strong uptrend with bullish momentum indicators",
	confidence: 0.75,
};

describe("DecisionSchema required risk fields", () => {
	it("accepts valid decision with all fields", () => {
		const result = DecisionSchema.parse(validDecision);
		expect(result.action).toBe("BUY");
		expect(result.riskLevels.stopLossLevel).toBe(145);
	});

	it("fails without riskLevels", () => {
		const noRiskLevels = { ...validDecision };
		delete (noRiskLevels as Record<string, unknown>).riskLevels;
		expect(() => DecisionSchema.parse(noRiskLevels)).toThrow();
	});

	it("fails with missing stopLossLevel", () => {
		const missingStop = {
			...validDecision,
			riskLevels: {
				takeProfitLevel: 160,
				denomination: "UNDERLYING_PRICE",
			},
		};
		expect(() => DecisionSchema.parse(missingStop)).toThrow();
	});

	it("fails with missing takeProfitLevel", () => {
		const missingTakeProfit = {
			...validDecision,
			riskLevels: {
				stopLossLevel: 145,
				denomination: "UNDERLYING_PRICE",
			},
		};
		expect(() => DecisionSchema.parse(missingTakeProfit)).toThrow();
	});
});

describe("DecisionSchema order and option validation", () => {
	it("requires LIMIT price when entryOrderType is LIMIT", () => {
		const noLimitPrice = {
			...validDecision,
			orderPlan: {
				entryOrderType: "LIMIT",
				exitOrderType: "MARKET",
				timeInForce: "DAY",
			},
		};
		expect(() => DecisionSchema.parse(noLimitPrice)).toThrow();
	});

	it("allows MARKET order without limit price", () => {
		const marketOrder = {
			...validDecision,
			orderPlan: {
				entryOrderType: "MARKET",
				exitOrderType: "MARKET",
				timeInForce: "DAY",
			},
		};
		const result = DecisionSchema.parse(marketOrder);
		expect(result.orderPlan.entryOrderType).toBe("MARKET");
	});

	it("requires optionContract for OPTION instruments", () => {
		const optionWithoutContract = {
			...validDecision,
			instrument: {
				instrumentId: "AAPL240120C00150000",
				instrumentType: "OPTION",
			},
		};
		expect(() => DecisionSchema.parse(optionWithoutContract)).toThrow();
	});

	it("accepts OPTION with contract details", () => {
		const validOption = {
			...validDecision,
			instrument: {
				instrumentId: "AAPL240120C00150000",
				instrumentType: "OPTION",
				optionContract: {
					underlying: "AAPL",
					expiration: "2024-01-20",
					strike: 150,
					optionType: "CALL",
				},
			},
		};
		const result = DecisionSchema.parse(validOption);
		expect(result.instrument.instrumentType).toBe("OPTION");
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
	portfolioNotes: "Single position entry",
};

describe("DecisionPlanSchema", () => {
	it("accepts valid decision plan", () => {
		const result = DecisionPlanSchema.parse(validPlan);
		expect(result.decisions.length).toBe(1);
		expect(result.environment).toBe("PAPER");
	});

	it("requires valid ISO timestamp", () => {
		expect(() =>
			DecisionPlanSchema.parse({
				...validPlan,
				asOfTimestamp: "not-a-timestamp",
			}),
		).toThrow();
	});

	it("requires valid environment", () => {
		expect(() =>
			DecisionPlanSchema.parse({
				...validPlan,
				environment: "PRODUCTION",
			}),
		).toThrow();
	});
});
