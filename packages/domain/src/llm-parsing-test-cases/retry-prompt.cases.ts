import { describe, expect, it } from "bun:test";

import { generateRetryPrompt } from "../llm-parsing";

describe("generateRetryPrompt", () => {
	it("includes original task context", () => {
		const prompt = generateRetryPrompt(
			"Generate trading decision",
			"Missing field: action",
			"DecisionPlan schema",
		);

		expect(prompt).toContain("Generate trading decision");
	});

	it("includes error details", () => {
		const prompt = generateRetryPrompt("Task", "value: Expected number, received string", "Schema");

		expect(prompt).toContain("Expected number");
		expect(prompt).toContain("received string");
	});

	it("includes schema description", () => {
		const prompt = generateRetryPrompt(
			"Task",
			"Error",
			"a valid JSON object with action and symbol",
		);

		expect(prompt).toContain("action and symbol");
	});

	it("includes JSON format instructions", () => {
		const prompt = generateRetryPrompt("Task", "Error", "Schema");

		expect(prompt).toContain("valid JSON");
		expect(prompt).toContain("required fields");
	});
});
