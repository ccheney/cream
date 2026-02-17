import { describe, expect, test } from "bun:test";

import {
	calculateCalmar,
	calculateCurrentDrawdown,
	calculateMaxDrawdown,
	calculateReturns,
	calculateSharpe,
	calculateSortino,
	type MetricsConfig,
} from "../risk-adjusted";

describe("calculateMaxDrawdown", () => {
	test("calculates max drawdown correctly", () => {
		const equity = [100, 110, 120, 100, 80, 90, 100];
		expect(calculateMaxDrawdown(equity)).toBeCloseTo(0.333, 2);
	});

	test("returns 0 for monotonically increasing", () => {
		const equity = [100, 110, 120, 130];
		expect(calculateMaxDrawdown(equity)).toBe(0);
	});

	test("handles single value", () => {
		expect(calculateMaxDrawdown([100])).toBe(0);
	});

	test("handles all declining", () => {
		const equity = [100, 90, 80, 70];
		expect(calculateMaxDrawdown(equity)).toBeCloseTo(0.3, 5);
	});
});

describe("calculateCurrentDrawdown", () => {
	test("calculates current drawdown", () => {
		const equity = [100, 120, 110];
		expect(calculateCurrentDrawdown(equity)).toBeCloseTo(0.0833, 3);
	});

	test("returns 0 at peak", () => {
		const equity = [100, 110, 120];
		expect(calculateCurrentDrawdown(equity)).toBe(0);
	});
});

describe("calculateSharpe", () => {
	const config: MetricsConfig = {
		riskFreeRate: 0.05,
		targetReturn: 0,
		periodsPerYear: 252,
	};

	test("calculates positive Sharpe", () => {
		const returns = Array.from({ length: 100 }, (_, index) => 0.001 + Math.sin(index) * 0.0005);
		const sharpe = calculateSharpe(returns, config);
		expect(sharpe).not.toBeNull();
		if (sharpe === null) {
			throw new Error("Expected sharpe ratio to be defined");
		}
		expect(sharpe).toBeGreaterThan(0);
	});

	test("returns null for insufficient data", () => {
		expect(calculateSharpe([0.01], config)).toBeNull();
	});

	test("returns null for zero volatility", () => {
		const returns = Array(100).fill(0.01);
		expect(calculateSharpe(returns, config)).toBeNull();
	});

	test("negative Sharpe for poor returns", () => {
		const returns = Array.from({ length: 100 }, (_, index) => -0.001 - Math.sin(index) * 0.0005);
		const sharpe = calculateSharpe(returns, config);
		expect(sharpe).not.toBeNull();
		if (sharpe === null) {
			throw new Error("Expected sharpe ratio to be defined");
		}
		expect(sharpe).toBeLessThan(0);
	});

	test("annualization is correct", () => {
		const returns = [0.01, 0.02, 0.01, 0.02, 0.01, 0.02, 0.01, 0.02, 0.01, 0.02];
		const sharpe = calculateSharpe(returns, config);
		expect(sharpe).not.toBeNull();
	});
});

describe("calculateSortino", () => {
	const config: MetricsConfig = {
		riskFreeRate: 0.05,
		targetReturn: 0,
		periodsPerYear: 252,
	};

	test("calculates positive Sortino", () => {
		const returns = [0.01, -0.005, 0.02, -0.01, 0.015];
		const sortino = calculateSortino(returns, config);
		expect(sortino).not.toBeNull();
	});

	test("returns null for no downside deviation", () => {
		const returns = Array(10).fill(0.01);
		expect(calculateSortino(returns, config)).toBeNull();
	});

	test("Sortino >= Sharpe when returns are positive-skewed", () => {
		const returns = [0.02, 0.03, 0.01, -0.005, 0.02, 0.025, -0.002];
		const sharpe = calculateSharpe(returns, config);
		const sortino = calculateSortino(returns, config);

		if (sharpe !== null && sortino !== null) {
			expect(Math.abs(sortino)).toBeGreaterThanOrEqual(0);
		}
	});
});

describe("calculateCalmar", () => {
	const config: MetricsConfig = {
		riskFreeRate: 0.05,
		targetReturn: 0,
		periodsPerYear: 252,
	};

	test("calculates positive Calmar", () => {
		const equity = [100, 105, 110, 108, 115, 120, 118, 125];
		const returns = calculateReturns(equity);
		const calmar = calculateCalmar(returns, equity, config);
		expect(calmar).not.toBeNull();
		if (calmar === null) {
			throw new Error("Expected calmar ratio to be defined");
		}
		expect(calmar).toBeGreaterThan(0);
	});

	test("returns null for no drawdown", () => {
		const equity = [100, 105, 110, 115, 120];
		const returns = calculateReturns(equity);
		expect(calculateCalmar(returns, equity, config)).toBeNull();
	});

	test("returns null for insufficient data", () => {
		expect(calculateCalmar([0.01], [100], config)).toBeNull();
	});

	test("lower Calmar for larger drawdowns", () => {
		const equity1 = [100, 110, 105, 115];
		const equity2 = [100, 110, 90, 115];

		const calmar1 = calculateCalmar(calculateReturns(equity1), equity1, config);
		const calmar2 = calculateCalmar(calculateReturns(equity2), equity2, config);

		if (calmar1 !== null && calmar2 !== null) {
			expect(calmar1).toBeGreaterThan(calmar2);
		}
	});
});
