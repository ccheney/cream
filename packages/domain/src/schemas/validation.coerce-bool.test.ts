import { describe, expect, test } from "bun:test";
import { coerceBool } from "./validation";

describe("coerceBool string and numeric coercion", () => {
	const truthyCases: unknown[] = [true, "true", "1", "yes", 42];
	const falsyCases: unknown[] = [false, "false", "0", "no", "", 0];

	for (const value of truthyCases) {
		test(`coerces ${String(value)} to true`, () => {
			expect(coerceBool().parse(value)).toBe(true);
		});
	}

	for (const value of falsyCases) {
		test(`coerces ${String(value)} to false`, () => {
			expect(coerceBool().parse(value)).toBe(false);
		});
	}
});

describe("coerceBool defaults and fallback behavior", () => {
	test("returns configured default for undefined and null", () => {
		const validator = coerceBool(true);
		expect(validator.parse(undefined)).toBe(true);
		expect(validator.parse(null)).toBe(true);
	});

	test("coerces non-primitive values via Boolean", () => {
		expect(coerceBool().parse({})).toBe(true);
	});
});
