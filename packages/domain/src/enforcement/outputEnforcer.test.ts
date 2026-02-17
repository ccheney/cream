/**
 * Tests for Output Enforcement
 */

import { describe, expect, it, mock } from "bun:test";
import {
	createOutputEnforcer,
	OutputEnforcer,
	parseAndValidateJSON,
	runPreflightChecks,
} from "./outputEnforcer";
import { createMarketContext, createValidDecisionPlan } from "./outputEnforcer.test-fixtures";

describe("OutputEnforcer parseAndValidateJSON", () => {
	it("parses valid JSON", async () => {
		const enforcer = new OutputEnforcer();
		const response = JSON.stringify(createValidDecisionPlan());
		const result = await enforcer.parseAndValidateJSON(response);
		expect(result.ok).toBe(true);
	});

	it("retries with callback on failure", async () => {
		const enforcer = new OutputEnforcer();
		const retryCallback = mock(async () => JSON.stringify(createValidDecisionPlan()));
		const result = await enforcer.parseAndValidateJSON("invalid", retryCallback);

		expect(retryCallback).toHaveBeenCalledTimes(1);
		expect(result.ok).toBe(true);
	});
});

describe("OutputEnforcer parseAndValidateJSON failures", () => {
	it("fails on malformed JSON", async () => {
		const enforcer = new OutputEnforcer();
		const result = await enforcer.parseAndValidateJSON("not valid json");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.type).toBe("JSON_PARSE");
		}
	});

	it("fails on missing required fields", async () => {
		const enforcer = new OutputEnforcer();
		const result = await enforcer.parseAndValidateJSON(JSON.stringify({ cycleId: "test" }));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.type).toBe("SCHEMA_VALIDATION");
		}
	});

	it("returns attempt count after failed retry", async () => {
		const enforcer = new OutputEnforcer();
		const retryCallback = mock(async () => "still invalid");
		const result = await enforcer.parseAndValidateJSON("invalid", retryCallback);

		expect(retryCallback).toHaveBeenCalledTimes(1);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.attemptCount).toBe(2);
		}
	});
});

describe("OutputEnforcer parseJSONOnce", () => {
	it("parses valid JSON without retry", () => {
		const enforcer = new OutputEnforcer();
		const response = JSON.stringify(createValidDecisionPlan());
		const result = enforcer.parseJSONOnce(response);
		expect(result.ok).toBe(true);
	});

	it("fails on invalid JSON without retry", () => {
		const enforcer = new OutputEnforcer();
		const result = enforcer.parseJSONOnce("invalid");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.attemptCount).toBe(1);
		}
	});
});

describe("OutputEnforcer standalone helpers", () => {
	it("parses valid JSON through standalone function", async () => {
		const result = await parseAndValidateJSON(JSON.stringify(createValidDecisionPlan()));
		expect(result.ok).toBe(true);
	});

	it("runs preflight checks through standalone function", () => {
		const result = runPreflightChecks(createValidDecisionPlan(), createMarketContext());
		expect(result.valid).toBe(true);
	});
});

describe("createOutputEnforcer", () => {
	it("creates enforcer with default options", () => {
		const enforcer = createOutputEnforcer();
		expect(enforcer).toBeInstanceOf(OutputEnforcer);
	});

	it("creates enforcer with custom options", () => {
		const enforcer = createOutputEnforcer({ maxRevisionAttempts: 2 });
		expect(enforcer).toBeInstanceOf(OutputEnforcer);
	});
});
