/**
 * Trading Cycle Act Step Tests
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { WorkflowResultSchema } from "./schemas.js";
import { actStep } from "./steps/index.js";
import { createStepContext, registerTradingCycleMocks } from "./test-helpers/mock-dependencies.js";

registerTradingCycleMocks();

const originalNodeEnv = Bun.env.NODE_ENV;
const originalExecutionEngineUrl = Bun.env.EXECUTION_ENGINE_URL;
const originalAlpacaKey = Bun.env.ALPACA_KEY;
const originalAlpacaSecret = Bun.env.ALPACA_SECRET;

beforeAll(() => {
	Bun.env.NODE_ENV = "test";
	Bun.env.EXECUTION_ENGINE_URL = "http://localhost:50053";
	Bun.env.ALPACA_KEY = "test-key";
	Bun.env.ALPACA_SECRET = "test-secret";
});

afterAll(() => {
	if (originalNodeEnv === undefined) {
		delete Bun.env.NODE_ENV;
	} else {
		Bun.env.NODE_ENV = originalNodeEnv;
	}
	if (originalExecutionEngineUrl === undefined) {
		delete Bun.env.EXECUTION_ENGINE_URL;
	} else {
		Bun.env.EXECUTION_ENGINE_URL = originalExecutionEngineUrl;
	}
	if (originalAlpacaKey === undefined) {
		delete Bun.env.ALPACA_KEY;
	} else {
		Bun.env.ALPACA_KEY = originalAlpacaKey;
	}
	if (originalAlpacaSecret === undefined) {
		delete Bun.env.ALPACA_SECRET;
	} else {
		Bun.env.ALPACA_SECRET = originalAlpacaSecret;
	}
});

function createApprovedDecisionPlan(withStopLoss: boolean) {
	return {
		cycleId: "test-cycle",
		timestamp: new Date().toISOString(),
		decisions: [
			{
				decisionId: "dec-1",
				instrumentId: "AAPL",
				action: "BUY" as const,
				direction: "LONG" as const,
				size: { value: 100, unit: "shares" },
				...(withStopLoss ? { stopLoss: { price: 145, type: "FIXED" as const } } : {}),
				strategyFamily: "momentum",
				timeHorizon: "swing",
				rationale: {
					summary: "Test",
					bullishFactors: [],
					bearishFactors: [],
					decisionLogic: "Test",
					memoryReferences: [],
				},
				thesisState: "ACTIVE",
				confidence: 0.8,
			},
		],
		portfolioNotes: "Test notes",
	};
}

function createApprovals() {
	return {
		riskApproval: {
			verdict: "APPROVE",
			approvedDecisionIds: ["dec-1"],
			rejectedDecisionIds: [],
			violations: [],
			required_changes: [],
			notes: "Test approval",
		},
		criticApproval: {
			verdict: "APPROVE",
			approvedDecisionIds: ["dec-1"],
			rejectedDecisionIds: [],
			violations: [],
			required_changes: [],
			notes: "Test approval",
		},
	};
}

describe("trading-cycle actStep", () => {
	registerIdTest();
	registerNotApprovedTest();
	registerApprovedSubmissionTest();
	registerConstraintViolationTest();
	registerWorkflowSchemaTest();
});

function registerIdTest(): void {
	it("should have correct step id", () => {
		expect(actStep.id).toBe("act-execute");
	});
}

function registerNotApprovedTest(): void {
	it("should execute and return workflow result when not approved", async () => {
		const result = await actStep.execute(
			createStepContext({
				cycleId: "test-cycle",
				approved: false,
				iterations: 1,
				mode: "STUB",
			}) as never,
		);

		expect(result).toHaveProperty("cycleId", "test-cycle");
		expect(result).toHaveProperty("approved", false);
		expect(result).toHaveProperty("orderSubmission");
		if ("orderSubmission" in result) {
			expect(result.orderSubmission.submitted).toBe(false);
		}
	});
}

function registerApprovedSubmissionTest(): void {
	it("should execute and attempt order submission when approved", async () => {
		const result = await actStep.execute(
			createStepContext({
				cycleId: "test-cycle",
				approved: true,
				iterations: 1,
				decisionPlan: createApprovedDecisionPlan(true),
				...createApprovals(),
				mode: "LLM",
			}) as never,
		);

		expect(result).toHaveProperty("cycleId", "test-cycle");
		expect(result).toHaveProperty("approved", true);
		if ("orderSubmission" in result) {
			expect(result.orderSubmission).toBeDefined();
		}
	});
}

function registerConstraintViolationTest(): void {
	it("should reject orders with constraint violations", async () => {
		const result = await actStep.execute(
			createStepContext({
				cycleId: "test-cycle",
				approved: true,
				iterations: 1,
				decisionPlan: createApprovedDecisionPlan(false),
				...createApprovals(),
				mode: "LLM",
			}) as never,
		);

		if ("orderSubmission" in result) {
			expect(result.orderSubmission.submitted).toBe(false);
			expect(result.orderSubmission.errors).toContain("AAPL: Buy order missing stop loss");
		}
	});
}

function registerWorkflowSchemaTest(): void {
	it("should return valid WorkflowResultSchema", async () => {
		const result = await actStep.execute(
			createStepContext({
				cycleId: "test-cycle",
				approved: false,
				iterations: 2,
				mode: "STUB",
			}) as never,
		);

		expect(WorkflowResultSchema.safeParse(result).success).toBe(true);
	});
}
