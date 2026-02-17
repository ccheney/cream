import { describe, expect, it } from "bun:test";

import { parseWithRetry } from "../llm-parsing";
import { ComplexSchema, SimpleSchema } from "./fixtures";

describe("parseWithRetry - valid JSON", () => {
	it("succeeds on first attempt with valid JSON", async () => {
		const input = JSON.stringify({ name: "test", value: 42 });
		const result = await parseWithRetry(input, SimpleSchema);

		expect(result.success).toBe(true);
		expect(result.data).toEqual({ name: "test", value: 42 });
		expect(result.attempts.length).toBe(1);
		const firstAttempt = result.attempts[0];
		expect(firstAttempt).toBeDefined();
		expect(firstAttempt?.attemptNumber).toBe(1);
		expect(firstAttempt?.success).toBe(true);
		expect(result.agentAction).toBe("SUCCESS");
	});

	it("succeeds with complex nested schema", async () => {
		const input = JSON.stringify({
			action: "BUY",
			symbol: "AAPL",
			quantity: 100,
			confidence: 0.85,
			rationale: "Strong momentum with volume confirmation",
			nested: {
				level: 2,
				tags: ["momentum", "breakout"],
			},
		});

		const result = await parseWithRetry(input, ComplexSchema);

		expect(result.success).toBe(true);
		expect(result.data?.action).toBe("BUY");
		expect(result.data?.nested?.tags).toEqual(["momentum", "breakout"]);
	});
});
