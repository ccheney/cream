/**
 * Corporate Actions Tests
 */

import { describe, expect, it } from "bun:test";
import type {
	AlpacaCorporateActionDividend,
	AlpacaCorporateActionSplit,
} from "../providers/alpaca";
import {
	adjustCandleForSplits,
	adjustCandlesForSplits,
	adjustPrice,
	adjustPriceForDividend,
	adjustVolume,
	calculateAnnualizedYield,
	calculateCumulativeAdjustmentFactor,
	calculateDividendAdjustedReturn,
	calculateDividendYield,
	calculateDRIPShares,
	// Split functions
	calculateSplitRatio,
	type DividendInfo,
	getApplicableSplits,
	getDividendsFromDate,
	getDividendsGoingExWithin,
	getDividendsInRange,
	getRegularDividends,
	getSpecialDividends,
	getUpcomingDividends,
	isSpecialDividend,
	type SplitAdjustment,
	sumDividends,
	// Dividend functions
	toDividendInfo,
	toSplitAdjustment,
	unadjustPrice,
} from "./index";

// ============================================
// Split Tests
// ============================================

describe("Stock Splits", () => {
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
			expect(applicable[0]!.executionDate).toBe("2020-08-01");
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

			// Old candle should be adjusted
			expect(adjusted[0]!.close).toBe(102.5);
			expect(adjusted[0]!.splitAdjusted).toBe(true);

			// New candle should not be adjusted (after split)
			expect(adjusted[1]!.close).toBe(105);
			expect(adjusted[1]!.splitAdjusted).toBe(false);
		});
	});

	describe("unadjustPrice", () => {
		it("should reverse split adjustment", () => {
			expect(unadjustPrice(100, 4)).toBe(400);
		});
	});
});

// ============================================
// Dividend Tests
// ============================================

describe("Dividends", () => {
	describe("toDividendInfo", () => {
		it("should convert Alpaca dividend to DividendInfo", () => {
			const alpacaDiv: AlpacaCorporateActionDividend = {
				symbol: "AAPL",
				rate: 0.24,
				exDate: "2024-02-09",
				recordDate: "2024-02-12",
				payableDate: "2024-02-15",
				special: false,
			};

			const result = toDividendInfo(alpacaDiv);

			expect(result.symbol).toBe("AAPL");
			expect(result.cashAmount).toBe(0.24);
			expect(result.currency).toBe("USD");
			expect(result.exDividendDate).toBe("2024-02-09");
			expect(result.dividendType).toBe("CD");
			expect(result.frequency).toBeNull();
		});

		it("should handle special dividend", () => {
			const alpacaDiv: AlpacaCorporateActionDividend = {
				symbol: "MSFT",
				rate: 3.0,
				exDate: "2024-03-01",
				special: true,
			};

			const result = toDividendInfo(alpacaDiv);

			expect(result.currency).toBe("USD");
			expect(result.recordDate).toBeNull();
			expect(result.payDate).toBeNull();
			expect(result.dividendType).toBe("SC");
		});
	});

	describe("calculateDividendYield", () => {
		it("should calculate yield correctly", () => {
			expect(calculateDividendYield(0.24, 100)).toBe(0.0024);
		});

		it("should return 0 for zero price", () => {
			expect(calculateDividendYield(0.24, 0)).toBe(0);
		});
	});

	describe("calculateAnnualizedYield", () => {
		it("should calculate quarterly annualized yield", () => {
			const yield_ = calculateAnnualizedYield(0.24, 4, 100);
			expect(yield_).toBeCloseTo(0.0096, 6);
		});

		it("should handle zero price", () => {
			expect(calculateAnnualizedYield(0.24, 4, 0)).toBe(0);
		});

		it("should handle zero frequency", () => {
			expect(calculateAnnualizedYield(0.24, 0, 100)).toBe(0);
		});
	});

	describe("getDividendsFromDate", () => {
		it("should filter dividends after date", () => {
			const dividends: DividendInfo[] = [
				{
					symbol: "AAPL",
					cashAmount: 0.24,
					currency: "USD",
					exDividendDate: "2024-01-01",
					recordDate: null,
					payDate: null,
					declarationDate: null,
					dividendType: "CD",
					frequency: 4,
				},
				{
					symbol: "AAPL",
					cashAmount: 0.24,
					currency: "USD",
					exDividendDate: "2024-04-01",
					recordDate: null,
					payDate: null,
					declarationDate: null,
					dividendType: "CD",
					frequency: 4,
				},
				{
					symbol: "AAPL",
					cashAmount: 0.24,
					currency: "USD",
					exDividendDate: "2024-07-01",
					recordDate: null,
					payDate: null,
					declarationDate: null,
					dividendType: "CD",
					frequency: 4,
				},
			];

			const result = getDividendsFromDate(dividends, "2024-03-01");

			expect(result.length).toBe(2);
			expect(result[0]!.exDividendDate).toBe("2024-04-01");
		});
	});

	describe("getDividendsInRange", () => {
		it("should filter dividends in date range", () => {
			const dividends: DividendInfo[] = [
				{
					symbol: "AAPL",
					cashAmount: 0.24,
					currency: "USD",
					exDividendDate: "2024-01-01",
					recordDate: null,
					payDate: null,
					declarationDate: null,
					dividendType: "CD",
					frequency: 4,
				},
				{
					symbol: "AAPL",
					cashAmount: 0.24,
					currency: "USD",
					exDividendDate: "2024-04-01",
					recordDate: null,
					payDate: null,
					declarationDate: null,
					dividendType: "CD",
					frequency: 4,
				},
				{
					symbol: "AAPL",
					cashAmount: 0.24,
					currency: "USD",
					exDividendDate: "2024-07-01",
					recordDate: null,
					payDate: null,
					declarationDate: null,
					dividendType: "CD",
					frequency: 4,
				},
			];

			const result = getDividendsInRange(dividends, "2024-02-01", "2024-06-01");

			expect(result.length).toBe(1);
			expect(result[0]!.exDividendDate).toBe("2024-04-01");
		});
	});

	describe("sumDividends", () => {
		it("should sum cash amounts", () => {
			const dividends: DividendInfo[] = [
				{
					symbol: "AAPL",
					cashAmount: 0.24,
					currency: "USD",
					exDividendDate: "2024-01-01",
					recordDate: null,
					payDate: null,
					declarationDate: null,
					dividendType: "CD",
					frequency: 4,
				},
				{
					symbol: "AAPL",
					cashAmount: 0.24,
					currency: "USD",
					exDividendDate: "2024-04-01",
					recordDate: null,
					payDate: null,
					declarationDate: null,
					dividendType: "CD",
					frequency: 4,
				},
			];

			expect(sumDividends(dividends)).toBe(0.48);
		});

		it("should return 0 for empty array", () => {
			expect(sumDividends([])).toBe(0);
		});
	});

	describe("calculateDividendAdjustedReturn", () => {
		it("should calculate total return with dividends", () => {
			const dividends: DividendInfo[] = [
				{
					symbol: "AAPL",
					cashAmount: 0.5,
					currency: "USD",
					exDividendDate: "2024-01-15",
					recordDate: null,
					payDate: null,
					declarationDate: null,
					dividendType: "CD",
					frequency: 4,
				},
			];

			const result = calculateDividendAdjustedReturn(100, 102, dividends);

			expect(result.priceReturn).toBeCloseTo(0.02, 6);
			expect(result.dividendReturn).toBeCloseTo(0.005, 6);
			expect(result.totalReturn).toBeCloseTo(0.025, 6);
		});

		it("should handle zero previous close", () => {
			const result = calculateDividendAdjustedReturn(0, 100, []);

			expect(result.priceReturn).toBe(0);
			expect(result.dividendReturn).toBe(0);
			expect(result.totalReturn).toBe(0);
		});
	});

	describe("adjustPriceForDividend", () => {
		it("should subtract dividend from price", () => {
			expect(adjustPriceForDividend(100, 0.5)).toBe(99.5);
		});
	});

	describe("calculateDRIPShares", () => {
		it("should calculate additional shares from dividend reinvestment", () => {
			const newShares = calculateDRIPShares(100, 0.5, 100);

			expect(newShares).toBeCloseTo(100.5, 4);
		});

		it("should handle zero price", () => {
			expect(calculateDRIPShares(0, 0.5, 100)).toBe(100);
		});
	});

	describe("isSpecialDividend", () => {
		it("should detect special dividends", () => {
			const special: DividendInfo = {
				symbol: "MSFT",
				cashAmount: 3.0,
				currency: "USD",
				exDividendDate: "2024-01-01",
				recordDate: null,
				payDate: null,
				declarationDate: null,
				dividendType: "SC",
				frequency: null,
			};

			expect(isSpecialDividend(special)).toBe(true);
		});

		it("should not flag regular dividends", () => {
			const regular: DividendInfo = {
				symbol: "MSFT",
				cashAmount: 0.75,
				currency: "USD",
				exDividendDate: "2024-01-01",
				recordDate: null,
				payDate: null,
				declarationDate: null,
				dividendType: "CD",
				frequency: 4,
			};

			expect(isSpecialDividend(regular)).toBe(false);
		});
	});

	describe("getRegularDividends", () => {
		it("should filter for CD type only", () => {
			const dividends: DividendInfo[] = [
				{
					symbol: "AAPL",
					cashAmount: 0.24,
					currency: "USD",
					exDividendDate: "2024-01-01",
					recordDate: null,
					payDate: null,
					declarationDate: null,
					dividendType: "CD",
					frequency: 4,
				},
				{
					symbol: "AAPL",
					cashAmount: 3.0,
					currency: "USD",
					exDividendDate: "2024-01-15",
					recordDate: null,
					payDate: null,
					declarationDate: null,
					dividendType: "SC",
					frequency: null,
				},
			];

			const result = getRegularDividends(dividends);

			expect(result.length).toBe(1);
			expect(result[0]!.dividendType).toBe("CD");
		});
	});

	describe("getSpecialDividends", () => {
		it("should filter for SC type only", () => {
			const dividends: DividendInfo[] = [
				{
					symbol: "AAPL",
					cashAmount: 0.24,
					currency: "USD",
					exDividendDate: "2024-01-01",
					recordDate: null,
					payDate: null,
					declarationDate: null,
					dividendType: "CD",
					frequency: 4,
				},
				{
					symbol: "AAPL",
					cashAmount: 3.0,
					currency: "USD",
					exDividendDate: "2024-01-15",
					recordDate: null,
					payDate: null,
					declarationDate: null,
					dividendType: "SC",
					frequency: null,
				},
			];

			const result = getSpecialDividends(dividends);

			expect(result.length).toBe(1);
			expect(result[0]!.dividendType).toBe("SC");
		});
	});

	describe("getUpcomingDividends", () => {
		it("should return dividends with ex-date in the future", () => {
			const today = new Date("2024-06-01");
			const dividends: DividendInfo[] = [
				{
					symbol: "AAPL",
					cashAmount: 0.24,
					currency: "USD",
					exDividendDate: "2024-05-15",
					recordDate: null,
					payDate: null,
					declarationDate: null,
					dividendType: "CD",
					frequency: 4,
				},
				{
					symbol: "AAPL",
					cashAmount: 0.24,
					currency: "USD",
					exDividendDate: "2024-07-15",
					recordDate: null,
					payDate: null,
					declarationDate: null,
					dividendType: "CD",
					frequency: 4,
				},
			];

			const result = getUpcomingDividends(dividends, today);

			expect(result.length).toBe(1);
			expect(result[0]!.exDividendDate).toBe("2024-07-15");
		});
	});

	describe("getDividendsGoingExWithin", () => {
		it("should return dividends going ex within N days", () => {
			const today = new Date("2024-06-01");
			const dividends: DividendInfo[] = [
				{
					symbol: "AAPL",
					cashAmount: 0.24,
					currency: "USD",
					exDividendDate: "2024-06-05",
					recordDate: null,
					payDate: null,
					declarationDate: null,
					dividendType: "CD",
					frequency: 4,
				},
				{
					symbol: "AAPL",
					cashAmount: 0.24,
					currency: "USD",
					exDividendDate: "2024-06-15",
					recordDate: null,
					payDate: null,
					declarationDate: null,
					dividendType: "CD",
					frequency: 4,
				},
				{
					symbol: "AAPL",
					cashAmount: 0.24,
					currency: "USD",
					exDividendDate: "2024-07-15",
					recordDate: null,
					payDate: null,
					declarationDate: null,
					dividendType: "CD",
					frequency: 4,
				},
			];

			const result = getDividendsGoingExWithin(dividends, 10, today);

			expect(result.length).toBe(1);
			expect(result[0]!.exDividendDate).toBe("2024-06-05");
		});
	});
});
