import { describe, expect, test } from "bun:test";

import {
	calculateAllMetrics,
	calculateMetricsForWindow,
	type MetricsWindow,
	rollingMaxDrawdown,
	rollingSharpE,
	rollingSortino,
} from "../risk-adjusted";

describe("calculateMetricsForWindow", () => {
	const window: MetricsWindow = { period: 20, label: "1d" };

	test("calculates metrics for window", () => {
		const equity = Array.from(
			{ length: 50 },
			(_, index) => 100 + index * 0.5 + Math.sin(index) * 2,
		);
		const metrics = calculateMetricsForWindow(equity, window);

		expect(metrics.window).toBe("1d");
		expect(metrics.timestamp).toBeDefined();
		expect(typeof metrics.rawReturn).toBe("number");
	});

	test("handles window larger than data", () => {
		const equity = [100, 105, 110];
		const metrics = calculateMetricsForWindow(equity, { period: 100, label: "1w" });

		expect(metrics.window).toBe("1w");
		expect(metrics.rawReturn).toBeCloseTo(0.1, 5);
	});
});

describe("calculateAllMetrics", () => {
	test("calculates metrics for all windows", () => {
		const equity = Array.from({ length: 600 }, (_, index) => 100 + index * 0.1);
		const metrics = calculateAllMetrics(equity);

		expect(metrics).toHaveLength(3);
		expect(metrics[0]?.window).toBe("1d");
		expect(metrics[1]?.window).toBe("1w");
		expect(metrics[2]?.window).toBe("1m");
	});

	test("accepts custom windows", () => {
		const equity = Array.from({ length: 100 }, (_, index) => 100 + index);
		const windows = [{ period: 10, label: "10h" }];
		const metrics = calculateAllMetrics(equity, windows);

		expect(metrics).toHaveLength(1);
		expect(metrics[0]?.window).toBe("10h");
	});
});

describe("rollingSharpE", () => {
	test("calculates rolling Sharpe", () => {
		const returns = Array.from({ length: 50 }, () => Math.random() * 0.02 - 0.01);
		const rolling = rollingSharpE(returns, 20);

		expect(rolling).toHaveLength(50);
		for (let index = 0; index < 19; index++) {
			expect(rolling[index]).toBeNull();
		}
		expect(rolling[19]).not.toBeUndefined();
	});
});

describe("rollingSortino", () => {
	test("calculates rolling Sortino", () => {
		const returns = Array.from({ length: 50 }, () => Math.random() * 0.02 - 0.005);
		const rolling = rollingSortino(returns, 20);

		expect(rolling).toHaveLength(50);
		for (let index = 0; index < 19; index++) {
			expect(rolling[index]).toBeNull();
		}
	});
});

describe("rollingMaxDrawdown", () => {
	test("calculates rolling max drawdown", () => {
		const equity = [100, 105, 102, 108, 106, 110, 108, 112];
		const rolling = rollingMaxDrawdown(equity, 4);

		expect(rolling).toHaveLength(8);
		expect(rolling[0]).toBe(0);
		expect(rolling[3]).toBeGreaterThan(0);
	});
});
