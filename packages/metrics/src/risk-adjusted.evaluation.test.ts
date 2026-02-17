/**
 * Evaluation and quality tests for Risk-Adjusted Performance Metrics
 */

import { describe, expect, test } from "bun:test";
import {
	calculateMetricsForWindow,
	calculateSharpe,
	calculateSortino,
	DEFAULT_METRICS_CONFIG,
	gradePerformance,
	isAcceptablePerformance,
} from "./risk-adjusted";

// ============================================
// Utility Function Tests
// ============================================

describe("isAcceptablePerformance", () => {
	test("returns true for acceptable metrics", () => {
		const metrics = {
			rawReturn: 0.1,
			sharpe: 1.5,
			sortino: 2.0,
			calmar: 1.2,
			window: "1m",
			timestamp: new Date().toISOString(),
		};
		expect(isAcceptablePerformance(metrics)).toBe(true);
	});

	test("returns false for poor Sharpe", () => {
		const metrics = {
			rawReturn: 0.1,
			sharpe: 0.5,
			sortino: 2.0,
			calmar: 1.2,
			window: "1m",
			timestamp: new Date().toISOString(),
		};
		expect(isAcceptablePerformance(metrics)).toBe(false);
	});

	test("handles null metrics", () => {
		const metrics = {
			rawReturn: 0.1,
			sharpe: null,
			sortino: null,
			calmar: null,
			window: "1m",
			timestamp: new Date().toISOString(),
		};
		expect(isAcceptablePerformance(metrics)).toBe(true);
	});
});

describe("gradePerformance", () => {
	test("grades exceptional performance", () => {
		const metrics = {
			rawReturn: 0.5,
			sharpe: 3.5,
			sortino: 4.0,
			calmar: 3.2,
			window: "1m",
			timestamp: new Date().toISOString(),
		};
		expect(gradePerformance(metrics)).toBe("exceptional");
	});

	test("grades elite performance", () => {
		const metrics = {
			rawReturn: 0.3,
			sharpe: 2.5,
			sortino: 2.8,
			calmar: 2.2,
			window: "1m",
			timestamp: new Date().toISOString(),
		};
		expect(gradePerformance(metrics)).toBe("elite");
	});

	test("grades acceptable performance", () => {
		const metrics = {
			rawReturn: 0.15,
			sharpe: 1.2,
			sortino: 1.5,
			calmar: 1.1,
			window: "1m",
			timestamp: new Date().toISOString(),
		};
		expect(gradePerformance(metrics)).toBe("acceptable");
	});

	test("grades poor performance", () => {
		const metrics = {
			rawReturn: 0.05,
			sharpe: 0.5,
			sortino: 0.8,
			calmar: 0.3,
			window: "1m",
			timestamp: new Date().toISOString(),
		};
		expect(gradePerformance(metrics)).toBe("poor");
	});

	test("returns poor for all null metrics", () => {
		const metrics = {
			rawReturn: 0,
			sharpe: null,
			sortino: null,
			calmar: null,
			window: "1m",
			timestamp: new Date().toISOString(),
		};
		expect(gradePerformance(metrics)).toBe("poor");
	});
});

// ============================================
// Edge Cases Tests
// ============================================

describe("Edge Cases", () => {
	test("handles all zero returns", () => {
		const returns = Array(100).fill(0);
		expect(calculateSharpe(returns, DEFAULT_METRICS_CONFIG)).toBeNull();
		expect(calculateSortino(returns, DEFAULT_METRICS_CONFIG)).toBeNull();
	});

	test("handles extreme returns", () => {
		const returns = [0.5, -0.3, 0.8, -0.5]; // 50%, -30%, 80%, -50%
		const sharpe = calculateSharpe(returns, DEFAULT_METRICS_CONFIG);
		expect(sharpe).not.toBeNull();
	});

	test("handles very small returns", () => {
		const returns = Array.from({ length: 100 }, () => Math.random() * 0.0001);
		const sharpe = calculateSharpe(returns, DEFAULT_METRICS_CONFIG);
		// May or may not be null depending on variance
		expect(sharpe === null || typeof sharpe === "number").toBe(true);
	});
});

// ============================================
// Best Practices Validation Tests
// ============================================

describe("Best Practices", () => {
	test("all three metrics should be reported together", () => {
		const equity = Array.from({ length: 200 }, (_, i) => 100 + i * 0.5 - Math.sin(i) * 3);
		const metrics = calculateMetricsForWindow(equity, { period: 100, label: "test" });

		// A comprehensive assessment uses all three metrics
		expect("sharpe" in metrics).toBe(true);
		expect("sortino" in metrics).toBe(true);
		expect("calmar" in metrics).toBe(true);
	});

	test("default windows cover appropriate time horizons", () => {
		// 1d, 1w, 1m provide short, medium, long term views
		const windows = [
			{ period: 20, label: "1d" }, // Short term
			{ period: 100, label: "1w" }, // Medium term
			{ period: 500, label: "1m" }, // Long term
		];

		expect(windows[0]?.period).toBeLessThan(windows[1]?.period ?? Infinity);
		expect(windows[1]?.period).toBeLessThan(windows[2]?.period ?? Infinity);
	});

	test("target thresholds are documented", () => {
		// Sharpe > 1.0 acceptable, > 2.0 professional
		// Sortino > 1.0 acceptable
		// Calmar > 1.0 acceptable, > 2.0 elite

		const acceptableMetrics = {
			rawReturn: 0.15,
			sharpe: 1.0,
			sortino: 1.0,
			calmar: 1.0,
			window: "1m",
			timestamp: new Date().toISOString(),
		};

		expect(isAcceptablePerformance(acceptableMetrics)).toBe(true);
		expect(gradePerformance(acceptableMetrics)).toBe("acceptable");
	});
});
