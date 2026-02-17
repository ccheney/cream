import { describe, expect, test } from "bun:test";

import {
	calculateRawReturn,
	calculateReturns,
	cumulativeReturn,
	downsideDeviation,
	mean,
	stdDev,
} from "../risk-adjusted";

describe("mean", () => {
	test("calculates mean correctly", () => {
		expect(mean([1, 2, 3, 4, 5])).toBe(3);
	});

	test("handles single value", () => {
		expect(mean([5])).toBe(5);
	});

	test("returns 0 for empty array", () => {
		expect(mean([])).toBe(0);
	});

	test("handles negative values", () => {
		expect(mean([-2, -1, 0, 1, 2])).toBe(0);
	});
});

describe("stdDev", () => {
	test("calculates standard deviation correctly", () => {
		const values = [2, 4, 4, 4, 5, 5, 7, 9];
		const result = stdDev(values);
		expect(result).toBeCloseTo(2.138, 2);
	});

	test("returns 0 for single value", () => {
		expect(stdDev([5])).toBe(0);
	});

	test("returns 0 for empty array", () => {
		expect(stdDev([])).toBe(0);
	});

	test("handles identical values", () => {
		expect(stdDev([5, 5, 5, 5])).toBe(0);
	});
});

describe("downsideDeviation", () => {
	test("calculates downside deviation correctly", () => {
		const returns = [0.01, -0.02, 0.03, -0.01, 0.02];
		const result = downsideDeviation(returns, 0);
		expect(result).toBeCloseTo(0.01, 2);
	});

	test("returns 0 for all positive returns", () => {
		const returns = [0.01, 0.02, 0.03];
		expect(downsideDeviation(returns, 0)).toBe(0);
	});

	test("handles empty array", () => {
		expect(downsideDeviation([], 0)).toBe(0);
	});

	test("respects target return", () => {
		const returns = [0.01, 0.02, 0.03];
		const result = downsideDeviation(returns, 0.02);
		expect(result).toBeGreaterThan(0);
	});
});

describe("calculateReturns", () => {
	test("calculates returns from prices", () => {
		const prices = [100, 110, 105, 115.5];
		const returns = calculateReturns(prices);
		expect(returns).toHaveLength(3);
		expect(returns[0]).toBeCloseTo(0.1, 5);
		expect(returns[1]).toBeCloseTo(-0.0455, 3);
		expect(returns[2]).toBeCloseTo(0.1, 5);
	});

	test("handles single value", () => {
		expect(calculateReturns([100])).toEqual([]);
	});

	test("handles empty array", () => {
		expect(calculateReturns([])).toEqual([]);
	});

	test("handles zero values", () => {
		const returns = calculateReturns([0, 100]);
		expect(returns[0]).toBe(0);
	});
});

describe("cumulativeReturn", () => {
	test("calculates cumulative return", () => {
		const returns = [0.1, -0.05, 0.1];
		const result = cumulativeReturn(returns);
		expect(result).toBeCloseTo(0.1495, 4);
	});

	test("returns 0 for empty array", () => {
		expect(cumulativeReturn([])).toBe(0);
	});
});

describe("calculateRawReturn", () => {
	test("calculates raw return from equity", () => {
		const equity = [100, 110, 120];
		expect(calculateRawReturn(equity)).toBeCloseTo(0.2, 5);
	});

	test("handles loss", () => {
		const equity = [100, 90, 80];
		expect(calculateRawReturn(equity)).toBeCloseTo(-0.2, 5);
	});

	test("returns 0 for single value", () => {
		expect(calculateRawReturn([100])).toBe(0);
	});
});
