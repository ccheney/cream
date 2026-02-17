/**
 * Trading Cycle Workflow Step Tests
 */

import { describe, expect, it } from "bun:test";

import {
	analystsStep,
	consensusStep,
	debateStep,
	groundingStep,
	observeStep,
	orientStep,
	traderStep,
} from "./steps/index.js";
import { createStepContext, registerTradingCycleMocks } from "./test-helpers/mock-dependencies.js";

registerTradingCycleMocks();

function registerStepIdTests(): void {
	describe("step ids", () => {
		const cases = [
			{ name: "observeStep", step: observeStep, id: "observe-market" },
			{ name: "orientStep", step: orientStep, id: "orient-context" },
			{ name: "groundingStep", step: groundingStep, id: "grounding-context" },
			{ name: "analystsStep", step: analystsStep, id: "analysts-parallel" },
			{ name: "debateStep", step: debateStep, id: "debate-researchers" },
			{ name: "traderStep", step: traderStep, id: "trader-synthesize" },
			{ name: "consensusStep", step: consensusStep, id: "consensus-approval" },
		] as const;

		for (const testCase of cases) {
			it(`${testCase.name} should have correct id`, () => {
				expect(testCase.step.id).toBe(testCase.id);
			});
		}
	});
}

function registerObserveTests(): void {
	describe("observeStep", () => {
		it("should execute and return market snapshot", async () => {
			const result = await observeStep.execute(
				createStepContext({
					cycleId: "test-cycle",
					instruments: ["AAPL"],
				}) as never,
			);

			expect(result).toHaveProperty("cycleId", "test-cycle");
			expect(result).toHaveProperty("marketSnapshot");
			expect(result).toHaveProperty("regimeLabels");
			if ("marketSnapshot" in result) {
				expect(result.marketSnapshot.instruments).toContain("AAPL");
			}
		});
	});
}

function registerOrientTests(): void {
	describe("orientStep", () => {
		it("should execute and return memory context", async () => {
			const marketSnapshot = {
				instruments: ["AAPL"],
				candles: {},
				quotes: {},
				timestamp: Date.now(),
			};

			const result = await orientStep.execute(
				createStepContext({
					cycleId: "test-cycle",
					marketSnapshot,
					regimeLabels: {
						AAPL: { regime: "RANGE_BOUND", confidence: 0.5 },
					},
				}) as never,
			);

			expect(result).toHaveProperty("cycleId", "test-cycle");
			expect(result).toHaveProperty("memoryContext");
			expect(result).toHaveProperty("mode");
			if ("mode" in result) {
				expect(result.mode).toBe("STUB");
			}
		});
	});
}

describe("trading-cycle workflow steps", () => {
	registerStepIdTests();
	registerObserveTests();
	registerOrientTests();
});
