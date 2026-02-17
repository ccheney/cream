import { describe, expect, test } from "bun:test";

import { comparePerformanceMetrics, type ParityPerformanceMetrics } from "../parity";

const baseMetrics: ParityPerformanceMetrics = {
	sharpeRatio: 1.5,
	sortinoRatio: 2.0,
	calmarRatio: 1.2,
	maxDrawdownPct: 10,
	totalReturnPct: 25,
	winRatePct: 55,
	winLossRatio: 1.8,
	tradeCount: 100,
	periodDays: 365,
};

describe("comparePerformanceMetrics", () => {
	test("approves when metrics are within tolerance", () => {
		const liveMetrics: ParityPerformanceMetrics = {
			...baseMetrics,
			sharpeRatio: 1.45,
			totalReturnPct: 24,
		};

		const result = comparePerformanceMetrics(baseMetrics, liveMetrics);

		expect(result.withinTolerance).toBe(true);
		expect(result.recommendation).toBe("APPROVE");
		expect(result.parityScore).toBeGreaterThan(0.8);
	});

	test("investigates when some metrics diverge", () => {
		const liveMetrics: ParityPerformanceMetrics = {
			...baseMetrics,
			sharpeRatio: 1.0,
			maxDrawdownPct: 15,
		};

		const result = comparePerformanceMetrics(baseMetrics, liveMetrics);

		expect(result.recommendation).toBe("INVESTIGATE");
	});
});

describe("comparePerformanceMetrics", () => {
	test("rejects when many metrics diverge significantly", () => {
		const liveMetrics: ParityPerformanceMetrics = {
			sharpeRatio: 0.5,
			sortinoRatio: 0.8,
			calmarRatio: 0.4,
			maxDrawdownPct: 25,
			totalReturnPct: 5,
			winRatePct: 40,
			winLossRatio: 0.8,
			tradeCount: 50,
			periodDays: 365,
		};

		const result = comparePerformanceMetrics(baseMetrics, liveMetrics);

		expect(result.recommendation).toBe("REJECT");
		expect(result.parityScore).toBeLessThan(0.7);
	});
});
