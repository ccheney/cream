import { describe, expect, test } from "bun:test";

import { validateAdjustedData } from "../parity";

describe("validateAdjustedData", () => {
	test("passes for properly adjusted data", () => {
		const prices = [
			{
				timestamp: "2026-01-04T00:00:00Z",
				price: 200,
				adjustedPrice: 100,
				splitFactor: 2,
			},
		];

		const result = validateAdjustedData(prices);

		expect(result.valid).toBe(true);
		expect(result.violations).toHaveLength(0);
	});

	test("detects unadjusted data", () => {
		const prices = [
			{
				timestamp: "2026-01-04T00:00:00Z",
				price: 200,
				adjustedPrice: 200,
				splitFactor: 2,
			},
		];

		const result = validateAdjustedData(prices);

		expect(result.valid).toBe(false);
		expect(result.violations.some((violation) => violation.type === "unadjusted")).toBe(true);
	});
});
