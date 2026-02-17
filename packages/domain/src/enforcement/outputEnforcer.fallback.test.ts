import { describe, expect, it } from "bun:test";
import type { PositionInfo } from "./outputEnforcer";
import { createFallbackPlan } from "./outputEnforcer";
import { createPosition } from "./outputEnforcer.test-fixtures";

describe("createFallbackPlan", () => {
	it("creates HOLD decisions for non-flat positions", () => {
		const positions = new Map([
			["AAPL", createPosition("AAPL", 100)],
			["GOOGL", createPosition("GOOGL", -50)],
		]);
		const plan = createFallbackPlan("fallback-cycle", positions);
		expect(plan.cycleId).toBe("fallback-cycle");
		expect(plan.decisions).toHaveLength(2);
		expect(plan.decisions[0]?.action).toBe("HOLD");
		expect(plan.decisions[1]?.action).toBe("HOLD");
		expect(plan.portfolioNotes).toContain("Fallback");
	});

	it("skips flat positions", () => {
		const positions = new Map([
			["AAPL", createPosition("AAPL", 100)],
			["FLAT", createPosition("FLAT", 0)],
		]);
		const plan = createFallbackPlan("fallback-cycle", positions);
		expect(plan.decisions).toHaveLength(1);
		expect(plan.decisions[0]?.instrument.instrumentId).toBe("AAPL");
	});

	it("handles empty positions", () => {
		const positions = new Map<string, PositionInfo>();
		const plan = createFallbackPlan("fallback-cycle", positions);
		expect(plan.decisions).toHaveLength(0);
	});

	it("sets risk levels based on long/short direction", () => {
		const positions = new Map([
			["LONG", createPosition("LONG", 100, 100)],
			["SHORT", createPosition("SHORT", -50, 100)],
		]);
		const plan = createFallbackPlan("fallback-cycle", positions);
		const longDecision = plan.decisions.find(
			(decision) => decision.instrument.instrumentId === "LONG",
		);
		const shortDecision = plan.decisions.find(
			(decision) => decision.instrument.instrumentId === "SHORT",
		);
		expect(longDecision?.riskLevels.stopLossLevel).toBeLessThan(100);
		expect(longDecision?.riskLevels.takeProfitLevel).toBeGreaterThan(100);
		expect(shortDecision?.riskLevels.stopLossLevel).toBeGreaterThan(100);
		expect(shortDecision?.riskLevels.takeProfitLevel).toBeLessThan(100);
	});
});
