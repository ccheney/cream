/**
 * Short Interest Batch Job Calculation Tests
 */

import { describe, expect, it } from "bun:test";
import {
	calculateShortInterestMomentum,
	calculateShortInterestRatio,
	calculateShortPctFloat,
} from "./short-interest-batch.js";

describe("calculateShortPctFloat", () => {
	it("calculates short % of float correctly", () => {
		const result = calculateShortPctFloat(100000, 1000000);
		expect(result).toBe(0.1);
	});

	it("returns null when float shares is null", () => {
		const result = calculateShortPctFloat(100000, null);
		expect(result).toBeNull();
	});

	it("returns null when float shares is zero", () => {
		const result = calculateShortPctFloat(100000, 0);
		expect(result).toBeNull();
	});

	it("returns null when float shares is negative", () => {
		const result = calculateShortPctFloat(100000, -1000);
		expect(result).toBeNull();
	});

	it("handles small short interest values", () => {
		const result = calculateShortPctFloat(1000, 10000000);
		expect(result).toBeCloseTo(0.0001, 6);
	});

	it("handles high short interest (>100% of float)", () => {
		const result = calculateShortPctFloat(1500000, 1000000);
		expect(result).toBe(1.5);
	});
});

describe("calculateShortInterestRatio", () => {
	it("calculates short interest ratio (days to cover) correctly", () => {
		const result = calculateShortInterestRatio(100000, 50000);
		expect(result).toBe(2);
	});

	it("returns null when avg daily volume is null", () => {
		const result = calculateShortInterestRatio(100000, null);
		expect(result).toBeNull();
	});

	it("returns null when avg daily volume is zero", () => {
		const result = calculateShortInterestRatio(100000, 0);
		expect(result).toBeNull();
	});

	it("returns null when avg daily volume is negative", () => {
		const result = calculateShortInterestRatio(100000, -1000);
		expect(result).toBeNull();
	});

	it("handles low liquidity stocks", () => {
		const result = calculateShortInterestRatio(100000, 1000);
		expect(result).toBe(100);
	});
});

describe("calculateShortInterestMomentum", () => {
	it("calculates positive momentum correctly", () => {
		const result = calculateShortInterestMomentum(110000, 100000);
		expect(result).toBe(0.1);
	});

	it("calculates negative momentum correctly", () => {
		const result = calculateShortInterestMomentum(90000, 100000);
		expect(result).toBe(-0.1);
	});

	it("returns null when previous is null", () => {
		const result = calculateShortInterestMomentum(100000, null);
		expect(result).toBeNull();
	});

	it("returns null when previous is zero", () => {
		const result = calculateShortInterestMomentum(100000, 0);
		expect(result).toBeNull();
	});

	it("returns null when previous is negative", () => {
		const result = calculateShortInterestMomentum(100000, -1000);
		expect(result).toBeNull();
	});

	it("handles no change", () => {
		const result = calculateShortInterestMomentum(100000, 100000);
		expect(result).toBe(0);
	});

	it("handles large increases", () => {
		const result = calculateShortInterestMomentum(300000, 100000);
		expect(result).toBe(2);
	});
});
