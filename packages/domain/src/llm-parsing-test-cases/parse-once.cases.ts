import { describe, expect, it } from "bun:test";

import { parseOnce } from "../llm-parsing";
import { SimpleSchema } from "./fixtures";

describe("parseOnce", () => {
	it("succeeds with valid JSON", () => {
		const result = parseOnce('{"name":"test","value":1}', SimpleSchema);

		expect(result.success).toBe(true);
		expect(result.data).toEqual({ name: "test", value: 1 });
		expect(result.attempts.length).toBe(1);
	});

	it("fails with invalid JSON (no retry)", () => {
		const result = parseOnce("invalid", SimpleSchema);

		expect(result.success).toBe(false);
		expect(result.attempts.length).toBe(1);
		expect(result.finalError).toBeDefined();
	});

	it("respects agent type for failure action", () => {
		const result = parseOnce("invalid", SimpleSchema, {
			agentType: "RiskManagerAgent",
		});

		expect(result.agentAction).toBe("REJECT");
	});
});
