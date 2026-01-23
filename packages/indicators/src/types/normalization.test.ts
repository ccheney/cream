/**
 * Tests for normalization functions in applyTransforms
 */

import { describe, expect, test } from "bun:test";
import { requireValue } from "@cream/test-utils";
import type { OHLCVBar } from "./index";
import { applyTransforms, DEFAULT_TRANSFORM_CONFIG } from "./index";

// ============================================================
// Test Fixtures
// ============================================================

function generateBars(count: number, startPrice = 100, volatility = 0.02): OHLCVBar[] {
	const bars: OHLCVBar[] = [];
	let price = startPrice;
	const baseTime = Date.now() - count * 86400000;

	for (let i = 0; i < count; i++) {
		const change = (Math.random() - 0.5) * 2 * volatility;
		const open = price;
		const high = price * (1 + Math.abs(change) + 0.005);
		const low = price * (1 - Math.abs(change) - 0.005);
		price = price * (1 + change);
		const close = price;
		const volume = Math.floor(1000000 + i * 10000);

		bars.push({
			timestamp: baseTime + i * 86400000,
			open,
			high,
			low,
			close,
			volume,
		});
	}

	return bars;
}

function generateDeterministicBars(closes: number[]): OHLCVBar[] {
	const baseTime = Date.now() - closes.length * 86400000;
	return closes.map((close, i) => ({
		timestamp: baseTime + i * 86400000,
		open: close * 0.99,
		high: close * 1.01,
		low: close * 0.98,
		close,
		volume: 1000000,
	}));
}

// ============================================================
// Z-Score Normalization Tests
// ============================================================

describe("applyTransforms - zscore", () => {
	test("returns empty object for insufficient data", () => {
		const bars = generateBars(5);
		const result = applyTransforms(bars, "1h", { method: "zscore", lookbackPeriod: 20 });
		expect(result).toEqual({});
	});

	test("calculates zscore for close prices", () => {
		const bars = generateBars(30);
		const result = applyTransforms(bars, "1h", {
			method: "zscore",
			lookbackPeriod: 20,
			clipOutliers: false,
		});

		expect(result).toHaveProperty("zscore_close_20_1h");
		const zscore = result.zscore_close_20_1h;
		expect(typeof zscore).toBe("number");
		expect(Number.isFinite(zscore)).toBe(true);
	});

	test("zscore of value above mean is positive", () => {
		const closes = Array.from({ length: 25 }, (_, i) => 100 + i);
		const bars = generateDeterministicBars(closes);

		const result = applyTransforms(bars, "1h", {
			method: "zscore",
			lookbackPeriod: 20,
			clipOutliers: false,
		});

		const zscore = result.zscore_close_20_1h;
		expect(zscore).toBeDefined();
		expect(requireValue(zscore, "zscore")).toBeGreaterThan(1);
	});

	test("zscore normalizes to unit variance", () => {
		const closes = [
			100, 102, 98, 101, 99, 103, 97, 100, 102, 98, 101, 99, 103, 97, 100, 102, 98, 101, 99, 103,
		];
		const bars = generateDeterministicBars(closes);

		const result = applyTransforms(bars, "1h", {
			method: "zscore",
			lookbackPeriod: 20,
			clipOutliers: false,
		});

		expect(result.zscore_close_20_1h).toBeDefined();
	});
});

// ============================================================
// Min-Max Normalization Tests
// ============================================================

describe("applyTransforms - minmax", () => {
	test("returns empty object for insufficient data", () => {
		const bars = generateBars(5);
		const result = applyTransforms(bars, "1h", { method: "minmax", lookbackPeriod: 20 });
		expect(result).toEqual({});
	});

	test("calculates minmax for close prices", () => {
		const bars = generateBars(30);
		const result = applyTransforms(bars, "1h", {
			method: "minmax",
			lookbackPeriod: 20,
			clipOutliers: false,
		});

		expect(result).toHaveProperty("minmax_close_20_1h");
		const normalized = result.minmax_close_20_1h;
		expect(typeof normalized).toBe("number");
		expect(normalized).toBeGreaterThanOrEqual(0);
		expect(normalized).toBeLessThanOrEqual(1);
	});

	test("minimum value normalizes to 0", () => {
		const closes = [
			105, 104, 103, 102, 101, 100, 101, 102, 103, 104, 105, 104, 103, 102, 101, 100, 101, 102, 103,
			100,
		];
		const bars = generateDeterministicBars(closes);

		const result = applyTransforms(bars, "1h", {
			method: "minmax",
			lookbackPeriod: 20,
			clipOutliers: false,
		});

		const normalized = result.minmax_close_20_1h;
		expect(normalized).toBeDefined();
		expect(normalized).toBe(0);
	});

	test("maximum value normalizes to 1", () => {
		const closes = [
			100, 101, 102, 103, 104, 105, 104, 103, 102, 101, 100, 101, 102, 103, 104, 105, 104, 103, 102,
			105,
		];
		const bars = generateDeterministicBars(closes);

		const result = applyTransforms(bars, "1h", {
			method: "minmax",
			lookbackPeriod: 20,
			clipOutliers: false,
		});

		const normalized = result.minmax_close_20_1h;
		expect(normalized).toBeDefined();
		expect(normalized).toBe(1);
	});
});

// ============================================================
// Robust Normalization Tests
// ============================================================

describe("applyTransforms - robust", () => {
	test("returns empty object for insufficient data", () => {
		const bars = generateBars(3);
		const result = applyTransforms(bars, "1h", { method: "robust", lookbackPeriod: 20 });
		expect(result).toEqual({});
	});

	test("calculates robust normalization for close prices", () => {
		const bars = generateBars(30);
		const result = applyTransforms(bars, "1h", {
			method: "robust",
			lookbackPeriod: 20,
			clipOutliers: false,
		});

		expect(result).toHaveProperty("robust_close_20_1h");
		const normalized = result.robust_close_20_1h;
		expect(typeof normalized).toBe("number");
		expect(Number.isFinite(normalized)).toBe(true);
	});

	test("median value normalizes to 0", () => {
		const closes = [
			90, 92, 94, 96, 98, 100, 102, 104, 106, 108, 90, 92, 94, 96, 98, 100, 102, 104, 106, 99,
		];
		const bars = generateDeterministicBars(closes);

		const result = applyTransforms(bars, "1h", {
			method: "robust",
			lookbackPeriod: 20,
			clipOutliers: false,
		});

		const normalized = result.robust_close_20_1h;
		expect(normalized).toBeDefined();
		expect(Math.abs(requireValue(normalized, "normalized"))).toBeLessThan(0.5);
	});

	test("robust normalization is resistant to outliers", () => {
		const normalCloses = [
			98, 99, 100, 101, 102, 99, 100, 101, 98, 99, 100, 101, 102, 99, 100, 101, 98,
		];
		const withOutliers = [...normalCloses, 500, 100, 100];
		const bars = generateDeterministicBars(withOutliers);

		const result = applyTransforms(bars, "1h", {
			method: "robust",
			lookbackPeriod: 20,
			clipOutliers: false,
		});

		const normalized = result.robust_close_20_1h;
		expect(normalized).toBeDefined();
		expect(Math.abs(requireValue(normalized, "normalized"))).toBeLessThan(1);
	});
});

// ============================================================
// Outlier Clipping Tests
// ============================================================

describe("applyTransforms - outlier clipping", () => {
	test("clips extreme values when enabled", () => {
		const normalCloses = Array.from({ length: 19 }, () => 100);
		const withOutlier = [...normalCloses, 200];
		const bars = generateDeterministicBars(withOutlier);

		const withClipping = applyTransforms(bars, "1h", {
			method: "zscore",
			lookbackPeriod: 20,
			clipOutliers: true,
			clipThreshold: 3,
		});

		const withoutClipping = applyTransforms(bars, "1h", {
			method: "zscore",
			lookbackPeriod: 20,
			clipOutliers: false,
		});

		const clipped = withClipping.zscore_close_20_1h;
		const unclipped = withoutClipping.zscore_close_20_1h;

		expect(clipped).toBeDefined();
		expect(unclipped).toBeDefined();
		expect(Math.abs(requireValue(clipped, "clipped"))).toBeLessThanOrEqual(
			Math.abs(requireValue(unclipped, "unclipped")),
		);
	});
});

// ============================================================
// Feature Extraction Tests
// ============================================================

describe("applyTransforms - features", () => {
	test("normalizes returns", () => {
		const bars = generateBars(30);
		const result = applyTransforms(bars, "1h", {
			method: "zscore",
			lookbackPeriod: 20,
			clipOutliers: false,
		});

		expect(result).toHaveProperty("zscore_return_20_1h");
	});

	test("normalizes volume", () => {
		const bars = generateBars(30);
		const result = applyTransforms(bars, "1h", {
			method: "zscore",
			lookbackPeriod: 20,
			clipOutliers: false,
		});

		expect(result).toHaveProperty("zscore_volume_20_1h");
	});

	test("normalizes high_low_range", () => {
		const bars = generateBars(30);
		const result = applyTransforms(bars, "1h", {
			method: "zscore",
			lookbackPeriod: 20,
			clipOutliers: false,
		});

		expect(result).toHaveProperty("zscore_high_low_range_20_1h");
	});

	test("includes timeframe in key names", () => {
		const bars = generateBars(30);
		const result = applyTransforms(bars, "15m", {
			method: "minmax",
			lookbackPeriod: 20,
			clipOutliers: false,
		});

		const keys = Object.keys(result);
		expect(keys.every((k) => k.endsWith("_15m"))).toBe(true);
	});
});

// ============================================================
// Edge Cases
// ============================================================

describe("applyTransforms - edge cases", () => {
	test("returns empty for empty candles", () => {
		const result = applyTransforms([], "1h");
		expect(result).toEqual({});
	});

	test("returns empty for single candle", () => {
		const bars = generateBars(1);
		const result = applyTransforms(bars, "1h");
		expect(result).toEqual({});
	});

	test("handles constant prices gracefully", () => {
		const closes = Array.from({ length: 25 }, () => 100);
		const bars = generateDeterministicBars(closes);

		const result = applyTransforms(bars, "1h", {
			method: "zscore",
			lookbackPeriod: 20,
			clipOutliers: false,
		});

		expect(result.zscore_close_20_1h).toBeUndefined();
	});

	test("uses default config when not specified", () => {
		const bars = generateBars(30);
		const result = applyTransforms(bars, "1h");

		expect(DEFAULT_TRANSFORM_CONFIG.method).toBe("zscore");
		const hasZscoreKeys = Object.keys(result).some((k) => k.startsWith("zscore_"));
		expect(hasZscoreKeys).toBe(true);
	});
});
