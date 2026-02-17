/**
 * Tests for LiquidityCalculatorAdapter
 */

import { describe, expect, test } from "bun:test";
import { requireValue } from "@cream/test-utils";
import type { OHLCVBar, Quote } from "../types";
import { createLiquidityCalculator, LiquidityCalculatorAdapter } from "./liquidity-calculator";

const LIQUIDITY_FIELDS = [
	"bid_ask_spread",
	"bid_ask_spread_pct",
	"amihud_illiquidity",
	"vwap",
	"turnover_ratio",
	"volume_ratio",
];

function generateBars(count: number, startPrice = 100, avgVolume = 1000000): OHLCVBar[] {
	const bars: OHLCVBar[] = [];
	let price = startPrice;
	const baseTime = Date.now() - count * 86400000;

	for (let i = 0; i < count; i++) {
		const change = (Math.random() - 0.5) * 0.04;
		const open = price;
		const high = price * (1 + Math.abs(change) + Math.random() * 0.01);
		const low = price * (1 - Math.abs(change) - Math.random() * 0.01);
		price = price * (1 + change);
		const close = price;
		const volume = Math.floor(avgVolume * (0.5 + Math.random()));

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

function generateQuote(midpoint: number, spreadBps = 5): Quote {
	const halfSpread = (midpoint * spreadBps) / 20000;
	return {
		timestamp: Date.now(),
		bidPrice: midpoint - halfSpread,
		askPrice: midpoint + halfSpread,
		bidSize: Math.floor(100 + Math.random() * 900),
		askSize: Math.floor(100 + Math.random() * 900),
	};
}

function createRealWorldBars(count: number): { bars: OHLCVBar[]; lastPrice: number } {
	const bars: OHLCVBar[] = [];
	let price = 150;
	const baseTime = Date.now() - count * 86400000;

	for (let i = 0; i < count; i++) {
		const isOpenCloseSession = i % 10 < 2 || i % 10 > 7;
		const volume = isOpenCloseSession ? 2000000 : 1000000;
		const change = (Math.random() - 0.5) * 0.02;
		price *= 1 + change;

		bars.push({
			timestamp: baseTime + i * 86400000,
			open: price,
			high: price * 1.005,
			low: price * 0.995,
			close: price,
			volume,
		});
	}

	return { bars, lastPrice: price };
}

describe("createLiquidityCalculator", () => {
	test("returns a LiquidityCalculator instance", () => {
		const calculator = createLiquidityCalculator();
		expect(calculator).toBeInstanceOf(LiquidityCalculatorAdapter);
		expect(typeof calculator.calculate).toBe("function");
	});
});

describe("LiquidityCalculatorAdapter.calculate basics", () => {
	test("returns empty indicators for empty bars array", () => {
		const adapter = new LiquidityCalculatorAdapter();
		const result = adapter.calculate([], null);

		expect(result.bid_ask_spread).toBeNull();
		expect(result.bid_ask_spread_pct).toBeNull();
		expect(result.amihud_illiquidity).toBeNull();
		expect(result.vwap).toBeNull();
		expect(result.turnover_ratio).toBeNull();
		expect(result.volume_ratio).toBeNull();
	});

	test("handles insufficient bars for turnover", () => {
		const adapter = new LiquidityCalculatorAdapter();
		const bars = generateBars(10);
		const result = adapter.calculate(bars, null);

		expect(result.turnover_ratio).toBeNull();
		expect(result.volume_ratio).toBeNull();
	});
});

describe("LiquidityCalculatorAdapter.calculate populated data", () => {
	test("calculates all indicators with sufficient data", () => {
		const adapter = new LiquidityCalculatorAdapter();
		const bars = generateBars(50, 100, 1000000);
		const quote = generateQuote(100, 10);
		const result = adapter.calculate(bars, quote);

		expect(result.bid_ask_spread).toBeTypeOf("number");
		expect(result.bid_ask_spread).toBeGreaterThan(0);
		expect(result.bid_ask_spread_pct).toBeTypeOf("number");
		expect(result.bid_ask_spread_pct).toBeGreaterThan(0);
		expect(result.amihud_illiquidity).toBeTypeOf("number");
		expect(result.amihud_illiquidity).toBeGreaterThan(0);
		expect(result.vwap).toBeTypeOf("number");
		expect(result.vwap).toBeGreaterThan(0);
		expect(result.volume_ratio).toBeTypeOf("number");
		expect(result.volume_ratio).toBeGreaterThan(0);
	});

	test("handles missing quote gracefully", () => {
		const adapter = new LiquidityCalculatorAdapter();
		const bars = generateBars(50);
		const result = adapter.calculate(bars, null);

		expect(result.bid_ask_spread).toBeNull();
		expect(result.bid_ask_spread_pct).toBeNull();
		expect(result.amihud_illiquidity).toBeTypeOf("number");
		expect(result.vwap).toBeTypeOf("number");
		expect(result.volume_ratio).toBeTypeOf("number");
	});
});

describe("Bid-Ask Spread Calculation", () => {
	test("calculates spread correctly", () => {
		const adapter = new LiquidityCalculatorAdapter();
		const bars = generateBars(50);
		const quote: Quote = {
			timestamp: Date.now(),
			bidPrice: 100.0,
			askPrice: 100.1,
			bidSize: 100,
			askSize: 100,
		};
		const result = adapter.calculate(bars, quote);

		expect(result.bid_ask_spread).toBeCloseTo(0.1, 5);
		expect(result.bid_ask_spread_pct).toBeCloseTo(0.1, 1);
	});

	test("handles tight spreads", () => {
		const adapter = new LiquidityCalculatorAdapter();
		const bars = generateBars(50);
		const quote: Quote = {
			timestamp: Date.now(),
			bidPrice: 100.0,
			askPrice: 100.01,
			bidSize: 1000,
			askSize: 1000,
		};
		const result = adapter.calculate(bars, quote);

		expect(result.bid_ask_spread).toBeCloseTo(0.01, 5);
		expect(result.bid_ask_spread_pct).toBeLessThan(0.02);
	});

	test("rejects invalid quotes", () => {
		const adapter = new LiquidityCalculatorAdapter();
		const bars = generateBars(50);
		const invalidQuote: Quote = {
			timestamp: Date.now(),
			bidPrice: 100.1,
			askPrice: 100.0,
			bidSize: 100,
			askSize: 100,
		};
		const result = adapter.calculate(bars, invalidQuote);

		expect(result.bid_ask_spread).toBeNull();
		expect(result.bid_ask_spread_pct).toBeNull();
	});
});

describe("Amihud Illiquidity Calculation", () => {
	test("calculates illiquidity correctly", () => {
		const adapter = new LiquidityCalculatorAdapter();
		const bars = generateBars(50, 100, 1000000);
		const result = adapter.calculate(bars, null);

		expect(result.amihud_illiquidity).toBeTypeOf("number");
		expect(result.amihud_illiquidity).toBeGreaterThan(0);
		expect(requireValue(result.amihud_illiquidity, "amihud_illiquidity")).toBeLessThan(1);
	});

	test("higher illiquidity for low volume", () => {
		const adapter = new LiquidityCalculatorAdapter();
		const highVolBars = generateBars(50, 100, 10000000);
		const lowVolBars = generateBars(50, 100, 100000);

		const highVolResult = adapter.calculate(highVolBars, null);
		const lowVolResult = adapter.calculate(lowVolBars, null);

		expect(highVolResult.amihud_illiquidity).not.toBeNull();
		expect(lowVolResult.amihud_illiquidity).not.toBeNull();
		expect(
			requireValue(lowVolResult.amihud_illiquidity, "low vol amihud_illiquidity"),
		).toBeGreaterThan(
			requireValue(highVolResult.amihud_illiquidity, "high vol amihud_illiquidity"),
		);
	});
});

describe("VWAP Calculation", () => {
	test("calculates VWAP correctly", () => {
		const adapter = new LiquidityCalculatorAdapter();
		const bars = generateBars(50, 100);
		const result = adapter.calculate(bars, null);

		expect(result.vwap).toBeTypeOf("number");
		expect(result.vwap).toBeGreaterThan(0);
	});

	test("VWAP is within price range", () => {
		const adapter = new LiquidityCalculatorAdapter();
		const bars = generateBars(50, 100, 1000000);
		const result = adapter.calculate(bars, null);

		const prices = bars.map((b) => b.close);
		const minPrice = Math.min(...prices);
		const maxPrice = Math.max(...prices);

		expect(result.vwap).toBeGreaterThanOrEqual(minPrice * 0.9);
		expect(result.vwap).toBeLessThanOrEqual(maxPrice * 1.1);
	});

	test("handles zero volume bars", () => {
		const adapter = new LiquidityCalculatorAdapter();
		const bars = generateBars(50);

		for (let i = 0; i < 10; i++) {
			const bar = bars[i];
			if (bar) {
				bar.volume = 0;
			}
		}

		const result = adapter.calculate(bars, null);
		expect(result.vwap).toBeTypeOf("number");
		expect(result.vwap).toBeGreaterThan(0);
	});
});

describe("Volume Ratio Calculation", () => {
	test("calculates volume ratio correctly", () => {
		const adapter = new LiquidityCalculatorAdapter();
		const bars = generateBars(50, 100, 1000000);
		const result = adapter.calculate(bars, null);

		expect(result.volume_ratio).toBeTypeOf("number");
		expect(result.volume_ratio).toBeGreaterThan(0);
	});

	test("high volume ratio for above-average volume", () => {
		const adapter = new LiquidityCalculatorAdapter();
		const bars = generateBars(50, 100, 1000000);
		const lastBar = bars.at(-1);
		if (lastBar) {
			lastBar.volume = 3000000;
		}

		const result = adapter.calculate(bars, null);
		expect(result.volume_ratio).not.toBeNull();
		expect(requireValue(result.volume_ratio, "volume_ratio")).toBeGreaterThan(1.5);
	});

	test("low volume ratio for below-average volume", () => {
		const adapter = new LiquidityCalculatorAdapter();
		const bars = generateBars(50, 100, 1000000);
		const lastBar = bars.at(-1);
		if (lastBar) {
			lastBar.volume = 200000;
		}

		const result = adapter.calculate(bars, null);
		expect(result.volume_ratio).not.toBeNull();
		expect(requireValue(result.volume_ratio, "volume_ratio")).toBeLessThan(0.5);
	});
});

describe("Turnover Ratio Calculation", () => {
	test("returns normalized turnover ratio", () => {
		const adapter = new LiquidityCalculatorAdapter();
		const bars = generateBars(50);
		const result = adapter.calculate(bars, null);

		expect(result.turnover_ratio).toBeTypeOf("number");
		expect(result.turnover_ratio).toBeGreaterThanOrEqual(0);
		expect(result.turnover_ratio).toBeLessThanOrEqual(1);
	});

	test("caps turnover ratio at 1", () => {
		const adapter = new LiquidityCalculatorAdapter();
		const bars = generateBars(50, 100, 100000);
		const lastBar = bars.at(-1);
		if (lastBar) {
			lastBar.volume = 2000000;
		}

		const result = adapter.calculate(bars, null);
		expect(result.turnover_ratio).not.toBeNull();
		expect(result.turnover_ratio).toBeLessThanOrEqual(1);
	});
});

describe("LiquidityCalculatorAdapter integration shape", () => {
	test("output structure matches LiquidityIndicators type", () => {
		const adapter = new LiquidityCalculatorAdapter();
		const bars = generateBars(50);
		const quote = generateQuote(100);
		const result = adapter.calculate(bars, quote);

		for (const field of LIQUIDITY_FIELDS) {
			expect(field in result).toBe(true);
		}
	});
});

describe("LiquidityCalculatorAdapter integration behavior", () => {
	test("handles real-world data patterns", () => {
		const adapter = new LiquidityCalculatorAdapter();
		const { bars, lastPrice } = createRealWorldBars(50);
		const quote: Quote = {
			timestamp: Date.now(),
			bidPrice: lastPrice - 0.01,
			askPrice: lastPrice + 0.01,
			bidSize: 500,
			askSize: 500,
		};
		const result = adapter.calculate(bars, quote);

		expect(result.bid_ask_spread).not.toBeNull();
		expect(result.amihud_illiquidity).not.toBeNull();
		expect(result.vwap).not.toBeNull();
		expect(result.volume_ratio).not.toBeNull();
		expect(result.bid_ask_spread).toBeLessThan(1);

		const prices = bars.map((b) => b.close);
		const minPrice = Math.min(...prices);
		const maxPrice = Math.max(...prices);
		expect(requireValue(result.vwap, "vwap")).toBeGreaterThanOrEqual(minPrice);
		expect(requireValue(result.vwap, "vwap")).toBeLessThanOrEqual(maxPrice);
	});
});
