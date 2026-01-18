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
	validateDecisionPlan,
	validateRiskReward,
} from "./decision-plan.js";

// ============================================
// Test Data
// ============================================

const validEquityDecision = {
	instrument: {
		instrumentId: "AAPL",
		instrumentType: "EQUITY" as const,
	},
	action: "INCREASE" as const,
	size: {
		quantity: 250,
		unit: "SHARES" as const,
		targetPositionQuantity: 500,
	},
	orderPlan: {
		entryOrderType: "LIMIT" as const,
		entryLimitPrice: 201.15,
		exitOrderType: "MARKET" as const,
		timeInForce: "DAY" as const,
		executionTactic: "",
		executionParams: {},
	},
	riskLevels: {
		stopLossLevel: 195.0,
		takeProfitLevel: 212.5,
		denomination: "UNDERLYING_PRICE" as const,
	},
	strategyFamily: "TREND" as const,
	rationale: "Regime=BULL_TREND; trend metrics strengthening",
	confidence: 0.71,
	references: {
		usedIndicators: ["cfg:trend_strength"],
		memoryCaseIds: ["td_0182"],
		eventIds: [],
	},
};

const validOptionDecision = {
	instrument: {
		instrumentId: "SPY_2026-03-20_450_C",
		instrumentType: "OPTION" as const,
		optionContract: {
			underlyingSymbol: "SPY",
			expirationDate: "2026-03-20",
			strike: 450.0,
			right: "CALL" as const,
			multiplier: 100,
		},
	},
	action: "BUY" as const,
	size: {
		quantity: 5,
		unit: "CONTRACTS" as const,
		targetPositionQuantity: 5,
	},
	orderPlan: {
		entryOrderType: "LIMIT" as const,
		entryLimitPrice: 12.5,
		exitOrderType: "MARKET" as const,
		timeInForce: "DAY" as const,
	},
	riskLevels: {
		stopLossLevel: 445.0,
		takeProfitLevel: 465.0,
		denomination: "UNDERLYING_PRICE" as const,
	},
	strategyFamily: "TREND" as const,
	rationale: "SPY in BULL_TREND; delta exposure adds to portfolio bias",
	confidence: 0.65,
};

const validDecisionPlan = {
	cycleId: "2026-01-04T15:00:00Z",
	asOfTimestamp: "2026-01-04T15:00:00Z",
	environment: "LIVE" as const,
	decisions: [validEquityDecision],
	portfolioNotes: "Increase trend sleeve via AAPL equity",
};

// ============================================
// Enum Tests
// ============================================

describe("Enums", () => {
	it("validates Environment enum", () => {
		expect(EnvironmentSchema.parse("PAPER")).toBe("PAPER");
		expect(EnvironmentSchema.parse("LIVE")).toBe("LIVE");
		expect(() => EnvironmentSchema.parse("BACKTEST")).toThrow();
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

// ============================================
// ISO8601 Timestamp Tests
// ============================================

describe("ISO8601TimestampSchema", () => {
	it("accepts valid timestamps", () => {
		expect(ISO8601TimestampSchema.parse("2026-01-04T15:00:00Z")).toBe("2026-01-04T15:00:00Z");
		expect(ISO8601TimestampSchema.parse("2026-01-04T15:00:00.000Z")).toBe(
			"2026-01-04T15:00:00.000Z"
		);
	});

	it("rejects invalid timestamps", () => {
		expect(() => ISO8601TimestampSchema.parse("2026-01-04")).toThrow();
		expect(() => ISO8601TimestampSchema.parse("2026-01-04T15:00:00")).toThrow(); // No Z
		expect(() => ISO8601TimestampSchema.parse("2026-01-04T15:00:00+00:00")).toThrow(); // Wrong offset format
	});
});

// ============================================
// Instrument Tests
// ============================================

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

// ============================================
// OptionContract Tests
// ============================================

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
				expirationDate: "03-20-2026", // Wrong format
				strike: 450.0,
				right: "CALL",
			})
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

// ============================================
// Size Tests
// ============================================

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
			targetPositionQuantity: -5, // Short position
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

// ============================================
// RiskLevels Tests
// ============================================

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
			})
		).toThrow();

		expect(() =>
			RiskLevelsSchema.parse({
				stopLossLevel: 100,
				takeProfitLevel: -50,
				denomination: "UNDERLYING_PRICE",
			})
		).toThrow();
	});
});

// ============================================
// OrderPlan Tests
// ============================================

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

// ============================================
// Decision Tests
// ============================================

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
		expect(() =>
			DecisionSchema.parse({
				...validEquityDecision,
				confidence: 1.5,
			})
		).toThrow();

		expect(() =>
			DecisionSchema.parse({
				...validEquityDecision,
				confidence: -0.1,
			})
		).toThrow();
	});

	it("provides default references", () => {
		const { references, ...decisionWithoutRefs } = validEquityDecision;
		const decision = DecisionSchema.parse(decisionWithoutRefs);
		expect(decision.references.usedIndicators).toEqual([]);
		expect(decision.references.memoryCaseIds).toEqual([]);
		expect(decision.references.eventIds).toEqual([]);
	});
});

// ============================================
// DecisionPlan Tests
// ============================================

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

// ============================================
// validateRiskReward Tests
// ============================================

describe("validateRiskReward", () => {
	it("validates good long position risk-reward", () => {
		const decision = DecisionSchema.parse({
			...validEquityDecision,
			riskLevels: {
				stopLossLevel: 195.0, // 6.15 risk
				takeProfitLevel: 220.0, // 18.85 reward -> 3:1 RR
				denomination: "UNDERLYING_PRICE",
			},
		});

		const result = validateRiskReward(decision, 201.15);
		expect(result.valid).toBe(true);
		expect(result.riskRewardRatio).toBeGreaterThan(3);
		expect(result.errors).toHaveLength(0);
	});

	it("rejects insufficient risk-reward ratio", () => {
		const decision = DecisionSchema.parse({
			...validEquityDecision,
			riskLevels: {
				stopLossLevel: 195.0, // 6.15 risk
				takeProfitLevel: 205.0, // 3.85 reward -> 0.63:1 RR
				denomination: "UNDERLYING_PRICE",
			},
		});

		const result = validateRiskReward(decision, 201.15);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes("below minimum 1.5:1"))).toBe(true);
	});

	it("rejects long position with stop above entry", () => {
		const decision = DecisionSchema.parse({
			...validEquityDecision,
			riskLevels: {
				stopLossLevel: 210.0, // Above entry
				takeProfitLevel: 220.0,
				denomination: "UNDERLYING_PRICE",
			},
		});

		const result = validateRiskReward(decision, 201.15);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes("must be below entry"))).toBe(true);
	});

	it("validates short position risk-reward", () => {
		const shortDecision = DecisionSchema.parse({
			...validEquityDecision,
			size: {
				quantity: 100,
				unit: "SHARES",
				targetPositionQuantity: -100, // Short position
			},
			riskLevels: {
				stopLossLevel: 210.0, // Above entry (stop for short)
				takeProfitLevel: 180.0, // Below entry (profit for short)
				denomination: "UNDERLYING_PRICE",
			},
		});

		const result = validateRiskReward(shortDecision, 200.0);
		expect(result.valid).toBe(true);
		expect(result.riskRewardRatio).toBe(2); // 20 reward / 10 risk
	});

	it("warns when stop exceeds 5x profit target", () => {
		const decision = DecisionSchema.parse({
			...validEquityDecision,
			riskLevels: {
				stopLossLevel: 150.0, // 51.15 risk
				takeProfitLevel: 210.0, // 8.85 reward -> risk is >5x reward
				denomination: "UNDERLYING_PRICE",
			},
		});

		const result = validateRiskReward(decision, 201.15);
		expect(result.warnings.some((w) => w.includes("5x"))).toBe(true);
	});
});

// ============================================
// validateDecisionPlan Tests
// ============================================

describe("validateDecisionPlan", () => {
	it("validates complete plan", () => {
		const result = validateDecisionPlan(validDecisionPlan);
		expect(result.success).toBe(true);
		expect(result.decisionPlan).toBeDefined();
		expect(result.errors).toHaveLength(0);
	});

	it("rejects invalid plan structure", () => {
		const result = validateDecisionPlan({
			cycleId: "test",
			// Missing required fields
		});
		expect(result.success).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it("warns on NO_TRADE with non-zero quantity", () => {
		const result = validateDecisionPlan({
			...validDecisionPlan,
			decisions: [
				{
					...validEquityDecision,
					action: "NO_TRADE",
					size: {
						quantity: 100, // Should be 0
						unit: "SHARES",
						targetPositionQuantity: 0,
					},
				},
			],
		});
		expect(result.success).toBe(true);
		expect(result.warnings.some((w) => w.includes("NO_TRADE"))).toBe(true);
	});

	it("errors on wrong size unit for instrument type", () => {
		const result = validateDecisionPlan({
			...validDecisionPlan,
			decisions: [
				{
					...validOptionDecision,
					size: {
						quantity: 5,
						unit: "SHARES", // Should be CONTRACTS
						targetPositionQuantity: 5,
					},
				},
			],
		});
		expect(result.success).toBe(false);
		expect(result.errors.some((e) => e.includes("CONTRACTS"))).toBe(true);
	});
});
