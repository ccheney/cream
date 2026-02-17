import { describe, expect, it } from "bun:test";
import type { Decision } from "../schemas/decision-plan";
import { OutputEnforcer } from "./outputEnforcer";
import {
	createMarketContext,
	createPlanWithDecision,
	createPosition,
	createValidDecisionPlan,
	getFirstDecision,
} from "./outputEnforcer.test-fixtures";

function createDecision(action: Decision["action"]): Decision {
	const base = getFirstDecision();
	if (action === "SELL") {
		return {
			...base,
			action,
			size: { quantity: 100, unit: "SHARES", targetPositionQuantity: -100 },
		};
	}
	if (action === "NO_TRADE") {
		return {
			...base,
			action,
			size: { quantity: 0, unit: "SHARES", targetPositionQuantity: 0 },
		};
	}
	return { ...base, action };
}

describe("OutputEnforcer runPreflightChecks market constraints", () => {
	it("passes when market is open", () => {
		const enforcer = new OutputEnforcer();
		const result = enforcer.runPreflightChecks(createValidDecisionPlan(), createMarketContext());
		expect(result.errors.some((error) => error.type === "MARKET_CLOSED")).toBe(false);
	});

	it("fails when market is closed", () => {
		const enforcer = new OutputEnforcer();
		const result = enforcer.runPreflightChecks(
			createValidDecisionPlan(),
			createMarketContext({ marketOpen: false }),
		);
		expect(result.valid).toBe(false);
		expect(result.errors.some((error) => error.type === "MARKET_CLOSED")).toBe(true);
	});

	it("fails when margin usage exceeds the configured maximum", () => {
		const enforcer = new OutputEnforcer();
		const result = enforcer.runPreflightChecks(
			createValidDecisionPlan(),
			createMarketContext({ marginUsage: 0.95, maxMarginUsage: 0.9 }),
		);
		expect(result.errors.some((error) => error.type === "MARGIN_EXCEEDED")).toBe(true);
	});
});

describe("OutputEnforcer runPreflightChecks buying power", () => {
	it("fails with insufficient buying power", () => {
		const enforcer = new OutputEnforcer();
		const result = enforcer.runPreflightChecks(
			createValidDecisionPlan(),
			createMarketContext({ buyingPower: 1000 }),
		);
		expect(result.valid).toBe(false);
		expect(result.errors.some((error) => error.type === "INSUFFICIENT_BUYING_POWER")).toBe(true);
	});

	it("warns when using more than 80% of buying power", () => {
		const enforcer = new OutputEnforcer();
		const result = enforcer.runPreflightChecks(
			createValidDecisionPlan(),
			createMarketContext({ buyingPower: 17000 }),
		);
		expect(result.warnings.some((warning) => warning.type === "INSUFFICIENT_BUYING_POWER")).toBe(
			true,
		);
	});

	it("calculates estimated cost for new entries", () => {
		const enforcer = new OutputEnforcer();
		const result = enforcer.runPreflightChecks(createValidDecisionPlan(), createMarketContext());
		expect(result.estimatedCost).toBe(15000);
	});
});

describe("OutputEnforcer runPreflightChecks action conflicts", () => {
	it("fails BUY when position already exists", () => {
		const enforcer = new OutputEnforcer();
		const positions = new Map([["AAPL", createPosition("AAPL", 50)]]);
		const result = enforcer.runPreflightChecks(
			createValidDecisionPlan(),
			createMarketContext({ currentPositions: positions }),
		);
		expect(result.errors.some((error) => error.type === "ACTION_CONFLICT")).toBe(true);
		expect(result.errors[0]?.message).toContain("Cannot BUY");
	});

	it("fails SELL when a position already exists", () => {
		const enforcer = new OutputEnforcer();
		const positions = new Map([["AAPL", createPosition("AAPL", -50)]]);
		const plan = createPlanWithDecision(createDecision("SELL"));
		const result = enforcer.runPreflightChecks(
			plan,
			createMarketContext({ currentPositions: positions }),
		);
		expect(result.errors[0]?.message).toContain("Cannot SELL");
	});

	it("allows NO_TRADE without an existing position", () => {
		const enforcer = new OutputEnforcer();
		const plan = createPlanWithDecision(createDecision("NO_TRADE"));
		const result = enforcer.runPreflightChecks(plan, createMarketContext());
		expect(result.errors.some((error) => error.type === "ACTION_CONFLICT")).toBe(false);
	});
});

describe("OutputEnforcer runPreflightChecks missing position conflicts", () => {
	const cases: Array<{ action: Decision["action"]; expectedMessage: string }> = [
		{ action: "INCREASE", expectedMessage: "Cannot INCREASE" },
		{ action: "REDUCE", expectedMessage: "Cannot REDUCE" },
		{ action: "HOLD", expectedMessage: "Cannot HOLD" },
	];

	for (const testCase of cases) {
		it(`fails ${testCase.action} when no position exists`, () => {
			const enforcer = new OutputEnforcer();
			const plan = createPlanWithDecision(createDecision(testCase.action));
			const result = enforcer.runPreflightChecks(plan, createMarketContext());
			expect(result.valid).toBe(false);
			expect(result.errors[0]?.message).toContain(testCase.expectedMessage);
		});
	}

	it("fails on negative size quantity", () => {
		const enforcer = new OutputEnforcer();
		const decision = {
			...getFirstDecision(),
			size: { quantity: -100, unit: "SHARES" as const, targetPositionQuantity: 100 },
		};
		const result = enforcer.runPreflightChecks(
			createPlanWithDecision(decision),
			createMarketContext(),
		);
		expect(result.errors.some((error) => error.type === "INVALID_SIZE")).toBe(true);
	});
});
