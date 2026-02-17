import { describe, expect, it, mock } from "bun:test";
import type { TraderAgentInterface } from "./outputEnforcer";
import { createOutputEnforcer, OutputEnforcer } from "./outputEnforcer";
import {
	createMarketContext,
	createPlanWithDecision,
	createValidDecisionPlan,
	getFirstDecision,
} from "./outputEnforcer.test-fixtures";

describe("OutputEnforcer requestPlanRevision", () => {
	it("fails when no trader agent is configured", async () => {
		const enforcer = new OutputEnforcer();
		const result = await enforcer.requestPlanRevision(
			"original",
			[{ type: "MARKET_CLOSED", message: "Market closed", severity: "ERROR" }],
			createMarketContext(),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.message).toContain("No trader agent");
		}
	});

	it("requests a revision from the trader agent", async () => {
		const validPlan = createValidDecisionPlan();
		const traderAgent: TraderAgentInterface = {
			requestRevision: mock(async () => JSON.stringify(validPlan)),
		};
		const enforcer = new OutputEnforcer({ traderAgent });
		const result = await enforcer.requestPlanRevision(
			"original",
			[{ type: "MARKET_CLOSED", message: "Market closed", severity: "ERROR" }],
			createMarketContext(),
		);
		expect(traderAgent.requestRevision).toHaveBeenCalledTimes(1);
		expect(result.ok).toBe(true);
	});

	it("returns retry failure when the agent throws", async () => {
		const traderAgent: TraderAgentInterface = {
			requestRevision: mock(async () => {
				throw new Error("Agent error");
			}),
		};
		const enforcer = new OutputEnforcer({ traderAgent });
		const result = await enforcer.requestPlanRevision(
			"original",
			[{ type: "MARKET_CLOSED", message: "Market closed", severity: "ERROR" }],
			createMarketContext(),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.message).toContain("Agent error");
		}
	});
});

describe("OutputEnforcer enforce pipeline", () => {
	it("passes a valid plan", async () => {
		const enforcer = new OutputEnforcer();
		const result = await enforcer.enforce(
			JSON.stringify(createValidDecisionPlan()),
			createMarketContext(),
		);
		expect(result.success).toBe(true);
		expect(result.fallbackTriggered).toBe(false);
		expect(result.decisionPlan).toBeDefined();
	});

	it("triggers fallback on parse failure", async () => {
		const enforcer = new OutputEnforcer();
		const result = await enforcer.enforce("invalid json", createMarketContext());
		expect(result.success).toBe(false);
		expect(result.fallbackTriggered).toBe(true);
		expect(result.fallbackReason).toContain("JSON parsing failed");
	});

	it("triggers fallback on preflight failure", async () => {
		const enforcer = new OutputEnforcer();
		const result = await enforcer.enforce(
			JSON.stringify(createValidDecisionPlan()),
			createMarketContext({ marketOpen: false }),
		);
		expect(result.success).toBe(false);
		expect(result.fallbackTriggered).toBe(true);
		expect(result.preflightErrors?.some((error) => error.type === "MARKET_CLOSED")).toBe(true);
	});
});

describe("OutputEnforcer enforce revision behavior", () => {
	it("succeeds when the revised plan passes preflight", async () => {
		const invalidPlan = createPlanWithDecision({ ...getFirstDecision(), action: "INCREASE" });
		const traderAgent: TraderAgentInterface = {
			requestRevision: mock(async () => JSON.stringify(createValidDecisionPlan())),
		};
		const enforcer = new OutputEnforcer({ traderAgent });
		const result = await enforcer.enforce(JSON.stringify(invalidPlan), createMarketContext());
		expect(traderAgent.requestRevision).toHaveBeenCalledTimes(1);
		expect(result.success).toBe(true);
		expect(result.fallbackTriggered).toBe(false);
	});

	it("skips preflight when configured", async () => {
		const enforcer = new OutputEnforcer({ skipPreflight: true });
		const result = await enforcer.enforce(
			JSON.stringify(createValidDecisionPlan()),
			createMarketContext({ marketOpen: false }),
		);
		expect(result.success).toBe(true);
		expect(result.fallbackTriggered).toBe(false);
	});

	it("handles retry callback in complete workflow", async () => {
		const retryCallback = mock(async () => JSON.stringify(createValidDecisionPlan()));
		const enforcer = createOutputEnforcer();
		const result = await enforcer.enforce("not json", createMarketContext(), retryCallback);
		expect(retryCallback).toHaveBeenCalledTimes(1);
		expect(result.success).toBe(true);
	});
});
