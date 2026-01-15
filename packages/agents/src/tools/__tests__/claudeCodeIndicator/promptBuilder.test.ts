/**
 * Prompt builder tests for Claude Code Indicator
 *
 * Tests for buildImplementationPrompt function.
 */

// Set required environment variables before imports
Bun.env.CREAM_ENV = "PAPER";

import { describe, expect, test } from "bun:test";
import { buildImplementationPrompt } from "../../claudeCodeIndicator.js";
import { createMockHypothesis, mockExistingPatterns } from "./fixtures.js";

describe("buildImplementationPrompt", () => {
	test("includes hypothesis name in prompt", () => {
		const hypothesis = createMockHypothesis({ name: "test_indicator" });
		const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

		expect(prompt).toContain("test_indicator");
	});

	test("includes hypothesis statement", () => {
		const hypothesis = createMockHypothesis();
		const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

		expect(prompt).toContain("Measures relative strength of sector ETFs");
	});

	test("includes economic rationale", () => {
		const hypothesis = createMockHypothesis();
		const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

		expect(prompt).toContain("Sector rotation precedes market moves");
	});

	test("includes mathematical approach", () => {
		const hypothesis = createMockHypothesis();
		const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

		expect(prompt).toContain("Rolling correlation of sector ETF returns");
	});

	test("includes falsification criteria", () => {
		const hypothesis = createMockHypothesis();
		const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

		expect(prompt).toContain("1. IC below 0.01 over 60 trading days");
		expect(prompt).toContain("2. Correlation above 0.7 with existing indicators");
	});

	test("includes expected IC range", () => {
		const hypothesis = createMockHypothesis({
			expectedProperties: {
				expectedICRange: [0.05, 0.15] as [number, number],
				maxCorrelationWithExisting: 0.3,
				targetTimeframe: "1d",
				applicableRegimes: ["TRENDING"],
			},
		});
		const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

		expect(prompt).toContain("0.05");
		expect(prompt).toContain("0.15");
	});

	test("includes applicable regimes", () => {
		const hypothesis = createMockHypothesis({
			expectedProperties: {
				expectedICRange: [0.02, 0.08] as [number, number],
				maxCorrelationWithExisting: 0.3,
				targetTimeframe: "1d",
				applicableRegimes: ["TRENDING", "RANGING", "VOLATILE"],
			},
		});
		const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

		expect(prompt).toContain("TRENDING");
		expect(prompt).toContain("RANGING");
		expect(prompt).toContain("VOLATILE");
	});

	test("includes existing patterns in code block", () => {
		const prompt = buildImplementationPrompt(createMockHypothesis(), mockExistingPatterns);

		expect(prompt).toContain("```typescript");
		expect(prompt).toContain("calculateRSI");
	});

	test("includes correct file paths", () => {
		const hypothesis = createMockHypothesis({ name: "my_custom_indicator" });
		const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

		expect(prompt).toContain("packages/indicators/src/custom/my_custom_indicator.ts");
		expect(prompt).toContain("packages/indicators/src/custom/my_custom_indicator.test.ts");
	});

	test("includes PascalCase function name", () => {
		const hypothesis = createMockHypothesis({ name: "sector_rotation_momentum" });
		const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

		expect(prompt).toContain("calculateSectorRotationMomentum");
		expect(prompt).toContain("SectorRotationMomentumResult");
		expect(prompt).toContain("SectorRotationMomentumConfig");
	});

	test("includes related academic work when provided", () => {
		const hypothesis = createMockHypothesis();
		const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

		expect(prompt).toContain("Related Academic Work");
		expect(prompt).toContain("Fama-French sector momentum research");
	});

	test("omits related academic work section when empty", () => {
		const hypothesis = createMockHypothesis({
			relatedAcademicWork: [],
		});
		const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

		expect(prompt).not.toContain("Related Academic Work");
	});

	test("includes bun test command", () => {
		const hypothesis = createMockHypothesis({ name: "test_indicator" });
		const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

		expect(prompt).toContain("bun test packages/indicators/src/custom/test_indicator.test.ts");
	});
});
