/**
 * Tests for DecisionPlan Zod Schema Mirrors
 */

import { describe, expect, it } from "bun:test";
import {
	ActionSchema,
	DecisionPlanSchema,
	DecisionSchema,
	EnvironmentSchema,
	InstrumentSchema,
	ISO8601TimestampSchema,
	OptionContractSchema,
	OrderPlanSchema,
	RiskLevelsSchema,
	SizeSchema,
	StrategyFamilySchema,
	TimeInForceSchema,
} from "./decision-plan.js";
import {
	validDecisionPlan,
	validEquityDecision,
	validOptionDecision,
} from "./decision-plan.test-data.js";

describe("Enums", () => {
	it("validates Environment enum", () => {
		expect(EnvironmentSchema.parse("PAPER")).toBe("PAPER");
		expect(EnvironmentSchema.parse("LIVE")).toBe("LIVE");
		expect(() => EnvironmentSchema.parse("INVALID")).toThrow();
	});

	it("validates Action enum", () => {
		expect(ActionSchema.parse("BUY")).toBe("BUY");
		expect(ActionSchema.parse("SELL")).toBe("SELL");
		expect(ActionSchema.parse("HOLD")).toBe("HOLD");
		expect(ActionSchema.parse("INCREASE")).toBe("INCREASE");
		expect(ActionSchema.parse("REDUCE")).toBe("REDUCE");
		expect(ActionSchema.parse("NO_TRADE")).toBe("NO_TRADE");
		expect(() => ActionSchema.parse("INVALID")).toThrow();
	});

	it("validates TimeInForce enum", () => {
		expect(TimeInForceSchema.parse("DAY")).toBe("DAY");
		expect(TimeInForceSchema.parse("GTC")).toBe("GTC");
		expect(TimeInForceSchema.parse("IOC")).toBe("IOC");
		expect(TimeInForceSchema.parse("FOK")).toBe("FOK");
	});

	it("validates StrategyFamily enum", () => {
		expect(StrategyFamilySchema.parse("TREND")).toBe("TREND");
		expect(StrategyFamilySchema.parse("MEAN_REVERSION")).toBe("MEAN_REVERSION");
		expect(StrategyFamilySchema.parse("EVENT_DRIVEN")).toBe("EVENT_DRIVEN");
		expect(StrategyFamilySchema.parse("VOLATILITY")).toBe("VOLATILITY");
		expect(StrategyFamilySchema.parse("RELATIVE_VALUE")).toBe("RELATIVE_VALUE");
	});
});

describe("ISO8601TimestampSchema", () => {
	it("accepts valid timestamps", () => {
		expect(ISO8601TimestampSchema.parse("2026-01-04T15:00:00Z")).toBe("2026-01-04T15:00:00Z");
		expect(ISO8601TimestampSchema.parse("2026-01-04T15:00:00.000Z")).toBe(
			"2026-01-04T15:00:00.000Z",
		);
	});

	it("rejects invalid timestamps", () => {
		expect(() => ISO8601TimestampSchema.parse("2026-01-04")).toThrow();
		expect(() => ISO8601TimestampSchema.parse("2026-01-04T15:00:00")).toThrow();
		expect(() => ISO8601TimestampSchema.parse("2026-01-04T15:00:00+00:00")).toThrow();
	});
});

describe("InstrumentSchema", () => {
	it("validates equity instrument", () => {
		const equity = InstrumentSchema.parse({
			instrumentId: "AAPL",
			instrumentType: "EQUITY",
		});
		expect(equity.instrumentId).toBe("AAPL");
		expect(equity.instrumentType).toBe("EQUITY");
	});

	it("validates option instrument with contract", () => {
		const option = InstrumentSchema.parse({
			instrumentId: "SPY_2026-03-20_450_C",
			instrumentType: "OPTION",
			optionContract: {
				underlyingSymbol: "SPY",
				expirationDate: "2026-03-20",
				strike: 450.0,
				right: "CALL",
				multiplier: 100,
			},
		});
		expect(option.instrumentType).toBe("OPTION");
		expect(option.optionContract?.strike).toBe(450.0);
	});

	it("rejects option without optionContract", () => {
		const result = InstrumentSchema.safeParse({
			instrumentId: "SPY_2026-03-20_450_C",
			instrumentType: "OPTION",
		});
		expect(result.success).toBe(false);
	});
});

describe("OptionContractSchema", () => {
	it("validates complete option contract", () => {
		const contract = OptionContractSchema.parse({
			underlyingSymbol: "SPY",
			expirationDate: "2026-03-20",
			strike: 450.0,
			right: "CALL",
			multiplier: 100,
		});
		expect(contract.underlyingSymbol).toBe("SPY");
		expect(contract.strike).toBe(450.0);
	});

	it("rejects invalid expiration date format", () => {
		expect(() =>
			OptionContractSchema.parse({
				underlyingSymbol: "SPY",
				expirationDate: "03-20-2026",
				strike: 450.0,
				right: "CALL",
			}),
		).toThrow();
	});

	it("defaults multiplier to 100", () => {
		const contract = OptionContractSchema.parse({
			underlyingSymbol: "SPY",
			expirationDate: "2026-03-20",
			strike: 450.0,
			right: "PUT",
		});
		expect(contract.multiplier).toBe(100);
	});
});

describe("SizeSchema", () => {
	it("validates size with shares", () => {
		const size = SizeSchema.parse({
			quantity: 100,
			unit: "SHARES",
			targetPositionQuantity: 100,
		});
		expect(size.quantity).toBe(100);
		expect(size.unit).toBe("SHARES");
	});

	it("validates size with contracts", () => {
		const size = SizeSchema.parse({
			quantity: 5,
			unit: "CONTRACTS",
			targetPositionQuantity: -5,
		});
		expect(size.targetPositionQuantity).toBe(-5);
	});

	it("allows zero quantity for NO_TRADE", () => {
		const size = SizeSchema.parse({
			quantity: 0,
			unit: "SHARES",
			targetPositionQuantity: 0,
		});
		expect(size.quantity).toBe(0);
	});
});

describe("RiskLevelsSchema", () => {
	it("validates risk levels", () => {
		const risk = RiskLevelsSchema.parse({
			stopLossLevel: 195.0,
			takeProfitLevel: 212.5,
			denomination: "UNDERLYING_PRICE",
		});
		expect(risk.stopLossLevel).toBe(195.0);
		expect(risk.takeProfitLevel).toBe(212.5);
	});

	it("rejects equal stop and profit levels", () => {
		const result = RiskLevelsSchema.safeParse({
			stopLossLevel: 200.0,
			takeProfitLevel: 200.0,
			denomination: "UNDERLYING_PRICE",
		});
		expect(result.success).toBe(false);
	});

	it("rejects zero or negative levels", () => {
		expect(() =>
			RiskLevelsSchema.parse({
				stopLossLevel: 0,
				takeProfitLevel: 100,
				denomination: "UNDERLYING_PRICE",
			}),
		).toThrow();

		expect(() =>
			RiskLevelsSchema.parse({
				stopLossLevel: 100,
				takeProfitLevel: -50,
				denomination: "UNDERLYING_PRICE",
			}),
		).toThrow();
	});
});

describe("OrderPlanSchema", () => {
	it("validates LIMIT order with price", () => {
		const plan = OrderPlanSchema.parse({
			entryOrderType: "LIMIT",
			entryLimitPrice: 201.15,
			exitOrderType: "MARKET",
			timeInForce: "DAY",
		});
		expect(plan.entryLimitPrice).toBe(201.15);
	});

	it("validates MARKET order without price", () => {
		const plan = OrderPlanSchema.parse({
			entryOrderType: "MARKET",
			exitOrderType: "MARKET",
			timeInForce: "GTC",
		});
		expect(plan.entryLimitPrice).toBeUndefined();
	});

	it("rejects LIMIT order without price", () => {
		const result = OrderPlanSchema.safeParse({
			entryOrderType: "LIMIT",
			exitOrderType: "MARKET",
			timeInForce: "DAY",
		});
		expect(result.success).toBe(false);
	});

	it("validates execution tactic", () => {
		const plan = OrderPlanSchema.parse({
			entryOrderType: "LIMIT",
			entryLimitPrice: 100,
			exitOrderType: "MARKET",
			timeInForce: "DAY",
			executionTactic: "TWAP",
			executionParams: {
				durationMinutes: 60,
				intervalMinutes: 5,
				randomize: true,
			},
		});
		expect(plan.executionTactic).toBe("TWAP");
	});

	it("rejects invalid execution tactic", () => {
		const result = OrderPlanSchema.safeParse({
			entryOrderType: "MARKET",
			exitOrderType: "MARKET",
			timeInForce: "DAY",
			executionTactic: "INVALID_TACTIC",
		});
		expect(result.success).toBe(false);
	});
});

describe("DecisionSchema", () => {
	it("validates complete equity decision", () => {
		const decision = DecisionSchema.parse(validEquityDecision);
		expect(decision.instrument.instrumentId).toBe("AAPL");
		expect(decision.action).toBe("INCREASE");
		expect(decision.confidence).toBe(0.71);
	});

	it("validates complete option decision", () => {
		const decision = DecisionSchema.parse(validOptionDecision);
		expect(decision.instrument.instrumentType).toBe("OPTION");
		expect(decision.size.unit).toBe("CONTRACTS");
	});

	it("rejects confidence outside [0, 1]", () => {
		expect(() => DecisionSchema.parse({ ...validEquityDecision, confidence: 1.5 })).toThrow();
		expect(() => DecisionSchema.parse({ ...validEquityDecision, confidence: -0.1 })).toThrow();
	});

	it("provides default references", () => {
		const { references, ...decisionWithoutRefs } = validEquityDecision;
		const decision = DecisionSchema.parse(decisionWithoutRefs);
		expect(decision.references.usedIndicators).toEqual([]);
		expect(decision.references.memoryCaseIds).toEqual([]);
		expect(decision.references.eventIds).toEqual([]);
	});
});

describe("DecisionPlanSchema", () => {
	it("validates complete decision plan", () => {
		const plan = DecisionPlanSchema.parse(validDecisionPlan);
		expect(plan.cycleId).toBe("2026-01-04T15:00:00Z");
		expect(plan.environment).toBe("LIVE");
		expect(plan.decisions).toHaveLength(1);
	});

	it("validates plan with multiple decisions", () => {
		const plan = DecisionPlanSchema.parse({
			...validDecisionPlan,
			decisions: [validEquityDecision, validOptionDecision],
		});
		expect(plan.decisions).toHaveLength(2);
	});

	it("allows empty decisions array", () => {
		const plan = DecisionPlanSchema.parse({
			...validDecisionPlan,
			decisions: [],
		});
		expect(plan.decisions).toHaveLength(0);
	});

	it("allows missing portfolioNotes", () => {
		const { portfolioNotes, ...planWithoutNotes } = validDecisionPlan;
		const plan = DecisionPlanSchema.parse(planWithoutNotes);
		expect(plan.portfolioNotes).toBeUndefined();
	});
});
