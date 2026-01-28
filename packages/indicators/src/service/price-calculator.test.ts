/**
 * Tests for PriceCalculatorAdapter
 */

import { describe, expect, test } from "bun:test";
import { requireValue } from "@cream/test-utils";
import type { OHLCVBar } from "../types";
import { createPriceCalculator, PriceCalculatorAdapter } from "./price-calculator";

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
		const high = price * (1 + Math.abs(change) + Math.random() * 0.005);
		const low = price * (1 - Math.abs(change) - Math.random() * 0.005);
		price = price * (1 + change);
		const close = price;
		const volume = Math.floor(1000000 + Math.random() * 500000);

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

function generateTrendingBars(count: number, direction: "up" | "down"): OHLCVBar[] {
	const bars: OHLCVBar[] = [];
	const startPrice = 100;
	const baseTime = Date.now() - count * 86400000;
	const dailyChange = direction === "up" ? 0.005 : -0.005;

	for (let i = 0; i < count; i++) {
		const price = startPrice * (1 + dailyChange) ** i;
		const noise = price * 0.002 * (Math.random() - 0.5);

		bars.push({
			timestamp: baseTime + i * 86400000,
			open: price - noise,
			high: price + Math.abs(noise) + price * 0.005,
			low: price - Math.abs(noise) - price * 0.005,
			close: price + noise,
			volume: Math.floor(1000000 + Math.random() * 500000),
		});
	}

	return bars;
}

// ============================================================
// Factory Tests
// ============================================================

describe("createPriceCalculator", () => {
	test("returns a PriceCalculator instance", () => {
		const calculator = createPriceCalculator();
		expect(calculator).toBeInstanceOf(PriceCalculatorAdapter);
		expect(typeof calculator.calculate).toBe("function");
	});
});

// ============================================================
// Basic Calculation Tests
// ============================================================

describe("PriceCalculatorAdapter", () => {
	describe("calculate", () => {
		test("returns empty indicators for empty bars array", () => {
			const adapter = new PriceCalculatorAdapter();
			const result = adapter.calculate([]);

			expect(result.rsi_14).toBeNull();
			expect(result.atr_14).toBeNull();
			expect(result.sma_20).toBeNull();
			expect(result.ema_9).toBeNull();
			expect(result.macd_line).toBeNull();
		});

		test("returns nulls for insufficient data", () => {
			const adapter = new PriceCalculatorAdapter();
			const bars = generateBars(10);
			const result = adapter.calculate(bars);

			// Need 15+ bars for RSI-14
			expect(result.rsi_14).toBeNull();
			// Need 15+ bars for ATR-14
			expect(result.atr_14).toBeNull();
			// Need 20 bars for SMA-20
			expect(result.sma_20).toBeNull();
			// EMA-9 only needs 9 bars
			expect(result.ema_9).toBeTypeOf("number");
		});

		test("calculates all indicators with sufficient data", () => {
			const adapter = new PriceCalculatorAdapter();
			const bars = generateBars(300);
			const result = adapter.calculate(bars);

			// RSI
			expect(result.rsi_14).toBeTypeOf("number");
			expect(result.rsi_14).toBeGreaterThanOrEqual(0);
			expect(result.rsi_14).toBeLessThanOrEqual(100);

			// ATR
			expect(result.atr_14).toBeTypeOf("number");
			expect(result.atr_14).toBeGreaterThan(0);

			// SMAs
			expect(result.sma_20).toBeTypeOf("number");
			expect(result.sma_50).toBeTypeOf("number");
			expect(result.sma_200).toBeTypeOf("number");

			// EMAs
			expect(result.ema_9).toBeTypeOf("number");
			expect(result.ema_12).toBeTypeOf("number");
			expect(result.ema_21).toBeTypeOf("number");
			expect(result.ema_26).toBeTypeOf("number");

			// MACD
			expect(result.macd_line).toBeTypeOf("number");
			expect(result.macd_signal).toBeTypeOf("number");
			expect(result.macd_histogram).toBeTypeOf("number");

			// Bollinger Bands
			expect(result.bollinger_upper).toBeTypeOf("number");
			expect(result.bollinger_middle).toBeTypeOf("number");
			expect(result.bollinger_lower).toBeTypeOf("number");
			expect(result.bollinger_bandwidth).toBeTypeOf("number");
			expect(result.bollinger_percentb).toBeTypeOf("number");

			// Stochastic
			expect(result.stochastic_k).toBeTypeOf("number");
			expect(result.stochastic_d).toBeTypeOf("number");

			// Momentum
			expect(result.momentum_1m).toBeTypeOf("number");
			expect(result.momentum_3m).toBeTypeOf("number");
			expect(result.momentum_6m).toBeTypeOf("number");
			expect(result.momentum_12m).toBeTypeOf("number");

			// Volatility
			expect(result.realized_vol_20d).toBeTypeOf("number");
			expect(result.parkinson_vol_20d).toBeTypeOf("number");
		});
	});
});

// ============================================================
// RSI Tests
// ============================================================

describe("RSI Calculation", () => {
	test("RSI is high for strong uptrend", () => {
		const adapter = new PriceCalculatorAdapter();
		const bars = generateTrendingBars(50, "up");
		const result = adapter.calculate(bars);

		expect(result.rsi_14).not.toBeNull();
		expect(requireValue(result.rsi_14, "rsi_14")).toBeGreaterThan(50);
	});

	test("RSI is low for strong downtrend", () => {
		const adapter = new PriceCalculatorAdapter();
		const bars = generateTrendingBars(50, "down");
		const result = adapter.calculate(bars);

		expect(result.rsi_14).not.toBeNull();
		expect(requireValue(result.rsi_14, "rsi_14")).toBeLessThan(50);
	});
});

// ============================================================
// Moving Average Tests
// ============================================================

describe("Moving Averages", () => {
	test("SMAs are ordered correctly in uptrend", () => {
		const adapter = new PriceCalculatorAdapter();
		const bars = generateTrendingBars(250, "up");
		const result = adapter.calculate(bars);

		// In uptrend: price > SMA20 > SMA50 > SMA200
		const currentPrice = requireValue(bars.at(-1), "last bar").close;

		expect(result.sma_20).not.toBeNull();
		expect(result.sma_50).not.toBeNull();
		expect(result.sma_200).not.toBeNull();

		expect(currentPrice).toBeGreaterThan(requireValue(result.sma_20, "sma_20"));
		expect(requireValue(result.sma_20, "sma_20")).toBeGreaterThan(
			requireValue(result.sma_50, "sma_50"),
		);
		expect(requireValue(result.sma_50, "sma_50")).toBeGreaterThan(
			requireValue(result.sma_200, "sma_200"),
		);
	});

	test("EMA is more responsive than SMA", () => {
		const adapter = new PriceCalculatorAdapter();

		// Create deterministic bars: flat price followed by sustained uptrend
		// This guarantees EMA will be closer to current price than SMA
		const bars: OHLCVBar[] = [];
		const baseTime = Date.now() - 50 * 86400000;

		// First 30 bars at flat price of 100
		for (let i = 0; i < 30; i++) {
			bars.push({
				timestamp: baseTime + i * 86400000,
				open: 100,
				high: 101,
				low: 99,
				close: 100,
				volume: 1000000,
			});
		}

		// Last 20 bars trending up strongly to 150
		for (let i = 0; i < 20; i++) {
			const price = 100 + (i + 1) * 2.5; // Goes from 102.5 to 150
			bars.push({
				timestamp: baseTime + (30 + i) * 86400000,
				open: price - 1,
				high: price + 1,
				low: price - 2,
				close: price,
				volume: 1000000,
			});
		}

		const result = adapter.calculate(bars);
		const currentPrice = requireValue(bars.at(-1), "last bar").close; // 150

		expect(result.ema_21).not.toBeNull();
		expect(result.sma_20).not.toBeNull();

		// EMA-21 should be closer to current price (150) than SMA-20
		// because EMA weights recent prices more heavily
		const emaDiff = Math.abs(currentPrice - requireValue(result.ema_21, "ema_21"));
		const smaDiff = Math.abs(currentPrice - requireValue(result.sma_20, "sma_20"));

		expect(emaDiff).toBeLessThan(smaDiff);
	});
});

// ============================================================
// MACD Tests
// ============================================================

describe("MACD Calculation", () => {
	test("MACD histogram equals line minus signal", () => {
		const adapter = new PriceCalculatorAdapter();
		const bars = generateBars(100);
		const result = adapter.calculate(bars);

		if (result.macd_line !== null && result.macd_signal !== null) {
			const expectedHistogram = result.macd_line - result.macd_signal;
			expect(result.macd_histogram).toBeCloseTo(expectedHistogram, 10);
		}
	});

	test("MACD line is positive in strong uptrend", () => {
		const adapter = new PriceCalculatorAdapter();
		const bars = generateTrendingBars(100, "up");
		const result = adapter.calculate(bars);

		expect(result.macd_line).not.toBeNull();
		expect(requireValue(result.macd_line, "macd_line")).toBeGreaterThan(0);
	});
});

// ============================================================
// Bollinger Bands Tests
// ============================================================

describe("Bollinger Bands", () => {
	test("bands are ordered correctly", () => {
		const adapter = new PriceCalculatorAdapter();
		const bars = generateBars(100);
		const result = adapter.calculate(bars);

		expect(result.bollinger_lower).not.toBeNull();
		expect(result.bollinger_middle).not.toBeNull();
		expect(result.bollinger_upper).not.toBeNull();

		expect(requireValue(result.bollinger_lower, "bollinger_lower")).toBeLessThan(
			requireValue(result.bollinger_middle, "bollinger_middle"),
		);
		expect(requireValue(result.bollinger_middle, "bollinger_middle")).toBeLessThan(
			requireValue(result.bollinger_upper, "bollinger_upper"),
		);
	});

	test("percentB is 0-1 when price is within bands", () => {
		const adapter = new PriceCalculatorAdapter();
		const bars = generateBars(100, 100, 0.01); // Low volatility for tight bands
		const result = adapter.calculate(bars);

		expect(result.bollinger_percentb).not.toBeNull();
		// percentB can be outside 0-1 if price breaks bands
		expect(requireValue(result.bollinger_percentb, "bollinger_percentb")).toBeGreaterThanOrEqual(
			-0.5,
		);
		expect(requireValue(result.bollinger_percentb, "bollinger_percentb")).toBeLessThanOrEqual(1.5);
	});

	test("bandwidth is positive", () => {
		const adapter = new PriceCalculatorAdapter();
		const bars = generateBars(100);
		const result = adapter.calculate(bars);

		expect(result.bollinger_bandwidth).not.toBeNull();
		expect(requireValue(result.bollinger_bandwidth, "bollinger_bandwidth")).toBeGreaterThan(0);
	});
});

// ============================================================
// Stochastic Tests
// ============================================================

describe("Stochastic Oscillator", () => {
	test("%K and %D are in valid range", () => {
		const adapter = new PriceCalculatorAdapter();
		const bars = generateBars(50);
		const result = adapter.calculate(bars);

		expect(result.stochastic_k).not.toBeNull();
		expect(result.stochastic_d).not.toBeNull();

		expect(requireValue(result.stochastic_k, "stochastic_k")).toBeGreaterThanOrEqual(0);
		expect(requireValue(result.stochastic_k, "stochastic_k")).toBeLessThanOrEqual(100);
		expect(requireValue(result.stochastic_d, "stochastic_d")).toBeGreaterThanOrEqual(0);
		expect(requireValue(result.stochastic_d, "stochastic_d")).toBeLessThanOrEqual(100);
	});

	test("stochastic is high in uptrend", () => {
		const adapter = new PriceCalculatorAdapter();
		const bars = generateTrendingBars(50, "up");
		const result = adapter.calculate(bars);

		expect(result.stochastic_k).not.toBeNull();
		expect(requireValue(result.stochastic_k, "stochastic_k")).toBeGreaterThan(50);
	});
});

// ============================================================
// Momentum Tests
// ============================================================

describe("Momentum", () => {
	test("momentum is positive for price increase", () => {
		const adapter = new PriceCalculatorAdapter();
		const bars = generateTrendingBars(300, "up");
		const result = adapter.calculate(bars);

		expect(result.momentum_1m).not.toBeNull();
		expect(result.momentum_3m).not.toBeNull();

		expect(requireValue(result.momentum_1m, "momentum_1m")).toBeGreaterThan(0);
		expect(requireValue(result.momentum_3m, "momentum_3m")).toBeGreaterThan(0);
	});

	test("momentum is negative for price decrease", () => {
		const adapter = new PriceCalculatorAdapter();
		const bars = generateTrendingBars(300, "down");
		const result = adapter.calculate(bars);

		expect(result.momentum_1m).not.toBeNull();
		expect(requireValue(result.momentum_3m, "momentum_3m")).toBeLessThan(0);
	});

	test("requires sufficient bars for each period", () => {
		const adapter = new PriceCalculatorAdapter();
		const bars = generateBars(50); // Not enough for 3m (63 days)
		const result = adapter.calculate(bars);

		expect(result.momentum_1m).not.toBeNull(); // 21 days OK
		expect(result.momentum_3m).toBeNull(); // 63 days - not enough
		expect(result.momentum_6m).toBeNull(); // 126 days - not enough
		expect(result.momentum_12m).toBeNull(); // 252 days - not enough
	});
});

// ============================================================
// Volatility Tests
// ============================================================

describe("Volatility", () => {
	test("volatility is positive", () => {
		const adapter = new PriceCalculatorAdapter();
		const bars = generateBars(50);
		const result = adapter.calculate(bars);

		expect(result.realized_vol_20d).not.toBeNull();
		expect(result.parkinson_vol_20d).not.toBeNull();

		expect(requireValue(result.realized_vol_20d, "realized_vol_20d")).toBeGreaterThan(0);
		expect(requireValue(result.parkinson_vol_20d, "parkinson_vol_20d")).toBeGreaterThan(0);
	});

	test("higher volatility for more volatile data", () => {
		const adapter = new PriceCalculatorAdapter();

		const lowVolBars = generateBars(50, 100, 0.005); // 0.5% daily vol
		const highVolBars = generateBars(50, 100, 0.03); // 3% daily vol

		const lowVolResult = adapter.calculate(lowVolBars);
		const highVolResult = adapter.calculate(highVolBars);

		expect(lowVolResult.realized_vol_20d).not.toBeNull();
		expect(highVolResult.realized_vol_20d).not.toBeNull();

		// High volatility data should show higher volatility indicator
		const highVol = requireValue(highVolResult.realized_vol_20d, "high volatility");
		const lowVol = requireValue(lowVolResult.realized_vol_20d, "low volatility");
		expect(highVol).toBeGreaterThan(lowVol);
	});

	test("volatility is annualized", () => {
		const adapter = new PriceCalculatorAdapter();
		const bars = generateBars(50, 100, 0.01); // ~1% daily vol
		const result = adapter.calculate(bars);

		// Annualized vol should be roughly sqrt(252) * daily vol
		// For 1% daily, expected ~15-16% annualized
		expect(result.realized_vol_20d).not.toBeNull();
		expect(requireValue(result.realized_vol_20d, "realized_vol_20d")).toBeGreaterThan(0.05); // At least 5%
		expect(requireValue(result.realized_vol_20d, "realized_vol_20d")).toBeLessThan(0.5); // Less than 50%
	});
});

// ============================================================
// Integration with IndicatorService
// ============================================================

describe("Integration", () => {
	test("output structure matches PriceIndicators type", () => {
		const adapter = new PriceCalculatorAdapter();
		const bars = generateBars(300);
		const result = adapter.calculate(bars);

		// All required fields should exist
		const expectedFields = [
			"rsi_14",
			"atr_14",
			"sma_20",
			"sma_50",
			"sma_200",
			"ema_9",
			"ema_12",
			"ema_21",
			"ema_26",
			"macd_line",
			"macd_signal",
			"macd_histogram",
			"bollinger_upper",
			"bollinger_middle",
			"bollinger_lower",
			"bollinger_bandwidth",
			"bollinger_percentb",
			"stochastic_k",
			"stochastic_d",
			"momentum_1m",
			"momentum_3m",
			"momentum_6m",
			"momentum_12m",
			"realized_vol_20d",
			"parkinson_vol_20d",
		];

		for (const field of expectedFields) {
			expect(field in result).toBe(true);
		}
	});
});
