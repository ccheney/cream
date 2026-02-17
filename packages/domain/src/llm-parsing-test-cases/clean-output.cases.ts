import { describe, expect, it } from "bun:test";

import { cleanLLMOutput } from "../llm-parsing";

describe("cleanLLMOutput", () => {
	it("removes markdown code blocks", () => {
		const input = '```json\n{"name": "test"}\n```';
		const cleaned = cleanLLMOutput(input);

		expect(cleaned).toBe('{"name": "test"}');
	});

	it("removes code blocks without language", () => {
		const input = '```\n{"value": 42}\n```';
		const cleaned = cleanLLMOutput(input);

		expect(cleaned).toBe('{"value": 42}');
	});

	it("extracts JSON from surrounding text", () => {
		const input = 'Here is the JSON:\n{"name": "test"}\nEnd of response';
		const cleaned = cleanLLMOutput(input);

		expect(cleaned).toBe('{"name": "test"}');
	});
});

describe("cleanLLMOutput", () => {
	it("handles arrays", () => {
		const input = "Array: [1, 2, 3]";
		const cleaned = cleanLLMOutput(input);

		expect(cleaned).toBe("[1, 2, 3]");
	});

	it("preserves valid JSON as-is", () => {
		const input = '{"name": "test", "value": 42}';
		const cleaned = cleanLLMOutput(input);

		expect(cleaned).toBe(input);
	});
});
