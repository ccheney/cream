/**
 * Corporate Actions Dividend Tests
 */

import { describe, expect, it } from "bun:test";
import { requireValue } from "@cream/test-utils";
import type { AlpacaCorporateActionDividend } from "../providers/alpaca";
import {
	adjustPriceForDividend,
	calculateAnnualizedYield,
	calculateDividendAdjustedReturn,
	calculateDividendYield,
	calculateDRIPShares,
	type DividendInfo,
	getDividendsFromDate,
	getDividendsGoingExWithin,
	getDividendsInRange,
	getRegularDividends,
	getSpecialDividends,
	getUpcomingDividends,
	isSpecialDividend,
	sumDividends,
	toDividendInfo,
} from "./index";

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
			rate: 3,
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
		const firstResult = requireValue(result[0], "dividend result");
		expect(firstResult.exDividendDate).toBe("2024-04-01");
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
		const firstResult = requireValue(result[0], "dividend result");
		expect(firstResult.exDividendDate).toBe("2024-04-01");
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
			cashAmount: 3,
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
				cashAmount: 3,
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
		const firstResult = requireValue(result[0], "dividend result");
		expect(firstResult.dividendType).toBe("CD");
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
				cashAmount: 3,
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
		const firstResult = requireValue(result[0], "dividend result");
		expect(firstResult.dividendType).toBe("SC");
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
		const firstResult = requireValue(result[0], "dividend result");
		expect(firstResult.exDividendDate).toBe("2024-07-15");
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
		const firstResult = requireValue(result[0], "dividend result");
		expect(firstResult.exDividendDate).toBe("2024-06-05");
	});
});
