import { describe, expect, it } from "bun:test";
import { DecisionSchema, validateDecisionPlan, validateRiskReward } from "./decision-plan.js";
import {
	validDecisionPlan,
	validEquityDecision,
	validOptionDecision,
} from "./decision-plan.test-data.js";

describe("validateRiskReward long positions", () => {
	it("validates good long position risk-reward", () => {
		const decision = DecisionSchema.parse({
			...validEquityDecision,
			riskLevels: {
				stopLossLevel: 195.0,
				takeProfitLevel: 220.0,
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
				stopLossLevel: 195.0,
				takeProfitLevel: 205.0,
				denomination: "UNDERLYING_PRICE",
			},
		});
		const result = validateRiskReward(decision, 201.15);
		expect(result.valid).toBe(false);
		expect(result.errors.some((error) => error.includes("below minimum 1.5:1"))).toBe(true);
	});

	it("rejects long position with stop above entry", () => {
		const decision = DecisionSchema.parse({
			...validEquityDecision,
			riskLevels: {
				stopLossLevel: 210.0,
				takeProfitLevel: 220.0,
				denomination: "UNDERLYING_PRICE",
			},
		});
		const result = validateRiskReward(decision, 201.15);
		expect(result.valid).toBe(false);
		expect(result.errors.some((error) => error.includes("must be below entry"))).toBe(true);
	});
});

describe("validateRiskReward short and warning scenarios", () => {
	it("validates short position risk-reward", () => {
		const shortDecision = DecisionSchema.parse({
			...validEquityDecision,
			size: { quantity: 100, unit: "SHARES", targetPositionQuantity: -100 },
			riskLevels: {
				stopLossLevel: 210.0,
				takeProfitLevel: 180.0,
				denomination: "UNDERLYING_PRICE",
			},
		});
		const result = validateRiskReward(shortDecision, 200.0);
		expect(result.valid).toBe(true);
		expect(result.riskRewardRatio).toBe(2);
	});

	it("warns when stop exceeds 5x profit target", () => {
		const decision = DecisionSchema.parse({
			...validEquityDecision,
			riskLevels: {
				stopLossLevel: 150.0,
				takeProfitLevel: 210.0,
				denomination: "UNDERLYING_PRICE",
			},
		});
		const result = validateRiskReward(decision, 201.15);
		expect(result.warnings.some((warning) => warning.includes("5x"))).toBe(true);
	});
});

describe("validateDecisionPlan", () => {
	it("validates a complete plan", () => {
		const result = validateDecisionPlan(validDecisionPlan);
		expect(result.success).toBe(true);
		expect(result.decisionPlan).toBeDefined();
		expect(result.errors).toHaveLength(0);
	});

	it("rejects invalid plan structure", () => {
		const result = validateDecisionPlan({ cycleId: "test" });
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
					size: { quantity: 100, unit: "SHARES", targetPositionQuantity: 0 },
				},
			],
		});
		expect(result.success).toBe(true);
		expect(result.warnings.some((warning) => warning.includes("NO_TRADE"))).toBe(true);
	});

	it("errors on wrong size unit for option instruments", () => {
		const result = validateDecisionPlan({
			...validDecisionPlan,
			decisions: [
				{
					...validOptionDecision,
					size: { quantity: 5, unit: "SHARES", targetPositionQuantity: 5 },
				},
			],
		});
		expect(result.success).toBe(false);
		expect(result.errors.some((error) => error.includes("CONTRACTS"))).toBe(true);
	});
});
