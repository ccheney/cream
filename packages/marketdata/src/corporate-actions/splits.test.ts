/**
 * Corporate Actions Split Tests
 */

import { describe, expect, it } from "bun:test";
import { requireValue } from "@cream/test-utils";
import type { AlpacaCorporateActionSplit } from "../providers/alpaca";
import {
	adjustCandleForSplits,
	adjustCandlesForSplits,
	adjustPrice,
	adjustVolume,
	calculateCumulativeAdjustmentFactor,
	calculateSplitRatio,
	getApplicableSplits,
	type SplitAdjustment,
	toSplitAdjustment,
	unadjustPrice,
} from "./index";

describe("calculateSplitRatio", () => {
	it("should calculate 4:1 split ratio", () => {
		expect(calculateSplitRatio(4, 1)).toBe(4);
	});

	it("should calculate 2:1 split ratio", () => {
		expect(calculateSplitRatio(2, 1)).toBe(2);
	});

	it("should calculate 3:2 split ratio", () => {
		expect(calculateSplitRatio(3, 2)).toBe(1.5);
	});

	it("should calculate 1:10 reverse split ratio", () => {
		expect(calculateSplitRatio(1, 10)).toBe(0.1);
	});

	it("should throw for zero splitFrom", () => {
		expect(() => calculateSplitRatio(4, 0)).toThrow("splitFrom cannot be zero");
	});
});

describe("toSplitAdjustment", () => {
	it("should convert Alpaca split to SplitAdjustment", () => {
		const alpacaSplit: AlpacaCorporateActionSplit = {
			symbol: "AAPL",
			exDate: "2024-08-01",
			processDate: "2024-08-01",
			oldRate: 1,
			newRate: 4,
		};

		const result = toSplitAdjustment(alpacaSplit);

		expect(result.symbol).toBe("AAPL");
		expect(result.executionDate).toBe("2024-08-01");
		expect(result.ratio).toBe(4);
		expect(result.splitTo).toBe(4);
		expect(result.splitFrom).toBe(1);
		expect(result.isReverse).toBe(false);
	});

	it("should detect reverse split", () => {
		const alpacaSplit: AlpacaCorporateActionSplit = {
			symbol: "GE",
			exDate: "2021-08-02",
			processDate: "2021-08-02",
			oldRate: 8,
			newRate: 1,
		};

		const result = toSplitAdjustment(alpacaSplit);

		expect(result.ratio).toBe(0.125);
		expect(result.isReverse).toBe(true);
	});
});

describe("adjustPrice", () => {
	it("should divide price by ratio for forward split", () => {
		expect(adjustPrice(400, 4)).toBe(100);
	});

	it("should multiply price for reverse split (ratio < 1)", () => {
		expect(adjustPrice(10, 0.1)).toBe(100);
	});
});

describe("adjustVolume", () => {
	it("should multiply volume by ratio for forward split", () => {
		expect(adjustVolume(1000000, 4)).toBe(4000000);
	});

	it("should divide volume for reverse split", () => {
		expect(adjustVolume(1000000, 0.1)).toBe(100000);
	});
});

describe("calculateCumulativeAdjustmentFactor", () => {
	it("should multiply ratios for multiple splits", () => {
		const splits: SplitAdjustment[] = [
			{
				symbol: "AAPL",
				executionDate: "2020-08-01",
				ratio: 4,
				splitTo: 4,
				splitFrom: 1,
				isReverse: false,
			},
			{
				symbol: "AAPL",
				executionDate: "2014-06-09",
				ratio: 7,
				splitTo: 7,
				splitFrom: 1,
				isReverse: false,
			},
		];

		expect(calculateCumulativeAdjustmentFactor(splits)).toBe(28);
	});

	it("should return 1 for empty splits", () => {
		expect(calculateCumulativeAdjustmentFactor([])).toBe(1);
	});
});

describe("getApplicableSplits", () => {
	it("should return splits after candle date", () => {
		const splits: SplitAdjustment[] = [
			{
				symbol: "AAPL",
				executionDate: "2020-08-01",
				ratio: 4,
				splitTo: 4,
				splitFrom: 1,
				isReverse: false,
			},
			{
				symbol: "AAPL",
				executionDate: "2014-06-09",
				ratio: 7,
				splitTo: 7,
				splitFrom: 1,
				isReverse: false,
			},
		];

		const applicable = getApplicableSplits(splits, "2018-01-01");

		expect(applicable.length).toBe(1);
		const firstApplicable = requireValue(applicable[0], "applicable split");
		expect(firstApplicable.executionDate).toBe("2020-08-01");
	});

	it("should return all splits for old candle", () => {
		const splits: SplitAdjustment[] = [
			{
				symbol: "AAPL",
				executionDate: "2020-08-01",
				ratio: 4,
				splitTo: 4,
				splitFrom: 1,
				isReverse: false,
			},
			{
				symbol: "AAPL",
				executionDate: "2014-06-09",
				ratio: 7,
				splitTo: 7,
				splitFrom: 1,
				isReverse: false,
			},
		];

		const applicable = getApplicableSplits(splits, "2010-01-01");

		expect(applicable.length).toBe(2);
	});
});

describe("adjustCandleForSplits", () => {
	it("should adjust candle prices and volume", () => {
		const candle = {
			timestamp: "2019-01-01T12:00:00Z",
			open: 400,
			high: 420,
			low: 390,
			close: 410,
			volume: 1000000,
		};

		const splits: SplitAdjustment[] = [
			{
				symbol: "AAPL",
				executionDate: "2020-08-01",
				ratio: 4,
				splitTo: 4,
				splitFrom: 1,
				isReverse: false,
			},
		];

		const adjusted = adjustCandleForSplits(candle, splits);

		expect(adjusted.open).toBe(100);
		expect(adjusted.high).toBe(105);
		expect(adjusted.low).toBe(97.5);
		expect(adjusted.close).toBe(102.5);
		expect(adjusted.volume).toBe(4000000);
		expect(adjusted.splitAdjusted).toBe(true);
		expect(adjusted.adjustmentFactor).toBe(4);
	});

	it("should not adjust if no splits", () => {
		const candle = {
			timestamp: "2021-01-01T12:00:00Z",
			open: 100,
			high: 105,
			low: 95,
			close: 102,
			volume: 1000000,
		};

		const adjusted = adjustCandleForSplits(candle, []);

		expect(adjusted.open).toBe(100);
		expect(adjusted.splitAdjusted).toBe(false);
		expect(adjusted.adjustmentFactor).toBe(1);
	});
});

describe("adjustCandlesForSplits", () => {
	it("should adjust multiple candles correctly", () => {
		const candles = [
			{
				timestamp: "2019-01-01T12:00:00Z",
				open: 400,
				high: 420,
				low: 390,
				close: 410,
				volume: 1000000,
			},
			{
				timestamp: "2021-01-01T12:00:00Z",
				open: 100,
				high: 110,
				low: 95,
				close: 105,
				volume: 500000,
			},
		];

		const splits: SplitAdjustment[] = [
			{
				symbol: "AAPL",
				executionDate: "2020-08-01",
				ratio: 4,
				splitTo: 4,
				splitFrom: 1,
				isReverse: false,
			},
		];

		const adjusted = adjustCandlesForSplits(candles, splits);

		const firstAdjusted = requireValue(adjusted[0], "adjusted candle");
		expect(firstAdjusted.close).toBe(102.5);
		expect(firstAdjusted.splitAdjusted).toBe(true);

		const secondAdjusted = requireValue(adjusted[1], "adjusted candle");
		expect(secondAdjusted.close).toBe(105);
		expect(secondAdjusted.splitAdjusted).toBe(false);
	});
});

describe("unadjustPrice", () => {
	it("should reverse split adjustment", () => {
		expect(unadjustPrice(100, 4)).toBe(400);
	});
});
