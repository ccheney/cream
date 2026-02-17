/**
 * Corporate Actions Batch Job Tests
 *
 * Tests for the CorporateActionsBatchJob calculation functions.
 */

import { describe, expect, test } from "bun:test";
import {
	type AlpacaCorporateAction,
	calculateDaysToExDividend,
	calculateDividendGrowth,
	calculateDividendIndicators,
	calculateSplitAdjustmentFactor,
	calculateTrailingDividendYield,
	hasPendingSplit,
	mapAlpacaActionType,
} from "./corporate-actions-batch.js";

// ============================================
// Calculation Function Tests
// ============================================

describe("mapAlpacaActionType", () => {
	test("maps dividend types correctly", () => {
		expect(mapAlpacaActionType("Dividend")).toBe("dividend");
		expect(mapAlpacaActionType("SpecialDividend")).toBe("special_dividend");
	});

	test("maps split types correctly", () => {
		expect(mapAlpacaActionType("Split")).toBe("split");
		expect(mapAlpacaActionType("ReverseSplit")).toBe("reverse_split");
	});

	test("maps other corporate actions correctly", () => {
		expect(mapAlpacaActionType("Spinoff")).toBe("spinoff");
		expect(mapAlpacaActionType("Merger")).toBe("merger");
		expect(mapAlpacaActionType("Acquisition")).toBe("acquisition");
		expect(mapAlpacaActionType("NameChange")).toBe("name_change");
	});
});

describe("calculateTrailingDividendYield", () => {
	test("calculates yield correctly", () => {
		// $2 annual dividend / $100 price = 2% yield
		const yield_ = calculateTrailingDividendYield([0.5, 0.5, 0.5, 0.5], 100);
		expect(yield_).toBe(0.02);
	});

	test("handles single dividend", () => {
		const yield_ = calculateTrailingDividendYield([1.0], 50);
		expect(yield_).toBe(0.02);
	});

	test("returns null for zero price", () => {
		expect(calculateTrailingDividendYield([0.5, 0.5], 0)).toBeNull();
	});

	test("returns null for negative price", () => {
		expect(calculateTrailingDividendYield([0.5], -10)).toBeNull();
	});

	test("returns null for null price", () => {
		expect(calculateTrailingDividendYield([0.5], null)).toBeNull();
	});

	test("returns null for empty dividends array", () => {
		expect(calculateTrailingDividendYield([], 100)).toBeNull();
	});

	test("handles large dividend amounts", () => {
		const yield_ = calculateTrailingDividendYield([10, 10, 10, 10], 100);
		expect(yield_).toBe(0.4); // 40% yield
	});
});

describe("calculateDaysToExDividend", () => {
	test("calculates days correctly for future date", () => {
		// Use dates relative to now to avoid timezone parsing issues
		const now = new Date();
		const futureDate = new Date(now);
		futureDate.setDate(futureDate.getDate() + 10);
		const exDateStr = futureDate.toISOString().slice(0, 10);
		const days = calculateDaysToExDividend(exDateStr, now);
		// Allow for minor variance due to time-of-day
		expect(days).toBeGreaterThanOrEqual(9);
		expect(days).toBeLessThanOrEqual(10);
	});

	test("returns 0 or positive for same day", () => {
		const now = new Date();
		const exDateStr = now.toISOString().slice(0, 10);
		const days = calculateDaysToExDividend(exDateStr, now);
		// On same day, should be 0 or possibly -1/+1 due to timezone
		expect(days === null || days >= 0).toBe(true);
	});

	test("returns null for clearly past date", () => {
		const now = new Date();
		const pastDate = new Date(now);
		pastDate.setDate(pastDate.getDate() - 10);
		const exDateStr = pastDate.toISOString().slice(0, 10);
		const days = calculateDaysToExDividend(exDateStr, now);
		expect(days).toBeNull();
	});

	test("returns null for null input", () => {
		expect(calculateDaysToExDividend(null)).toBeNull();
	});

	test("handles future dates consistently", () => {
		const now = new Date();
		const futureDate = new Date(now);
		futureDate.setDate(futureDate.getDate() + 30);
		const exDateStr = futureDate.toISOString().slice(0, 10);
		const days = calculateDaysToExDividend(exDateStr, now);
		expect(days).toBeGreaterThanOrEqual(29);
		expect(days).toBeLessThanOrEqual(30);
	});
});

describe("calculateDividendGrowth", () => {
	test("calculates positive growth correctly", () => {
		// $2.20 vs $2.00 = 10% growth
		const growth = calculateDividendGrowth(2.2, 2.0);
		expect(growth).toBeCloseTo(0.1, 5);
	});

	test("calculates negative growth correctly", () => {
		// $1.80 vs $2.00 = -10% decline
		const growth = calculateDividendGrowth(1.8, 2.0);
		expect(growth).toBeCloseTo(-0.1, 5);
	});

	test("calculates zero growth", () => {
		const growth = calculateDividendGrowth(2.0, 2.0);
		expect(growth).toBe(0);
	});

	test("returns null for zero prior dividends", () => {
		expect(calculateDividendGrowth(1.0, 0)).toBeNull();
	});

	test("returns null for negative prior dividends", () => {
		expect(calculateDividendGrowth(1.0, -1.0)).toBeNull();
	});

	test("handles 100% growth (dividend doubled)", () => {
		const growth = calculateDividendGrowth(4.0, 2.0);
		expect(growth).toBe(1.0);
	});
});

describe("calculateSplitAdjustmentFactor", () => {
	test("calculates forward split factor correctly", () => {
		// 2:1 split - stock price halves, so historical prices need to be multiplied by 2
		expect(calculateSplitAdjustmentFactor(2, false)).toBe(2);
	});

	test("calculates 3:1 split factor", () => {
		expect(calculateSplitAdjustmentFactor(3, false)).toBe(3);
	});

	test("calculates reverse split factor correctly", () => {
		// 1:2 reverse split - stock price doubles, so historical prices need to be multiplied by 0.5
		expect(calculateSplitAdjustmentFactor(2, true)).toBe(0.5);
	});

	test("calculates 1:10 reverse split factor", () => {
		expect(calculateSplitAdjustmentFactor(10, true)).toBe(0.1);
	});

	test("handles 1:1 (no split)", () => {
		expect(calculateSplitAdjustmentFactor(1, false)).toBe(1);
		expect(calculateSplitAdjustmentFactor(1, true)).toBe(1);
	});
});

function createAction(
	overrides: Partial<AlpacaCorporateAction>,
	corporate_action_type: AlpacaCorporateAction["corporate_action_type"] = "Split",
): AlpacaCorporateAction {
	return {
		corporate_action_type,
		symbol: "AAPL",
		ex_date: new Date().toISOString().slice(0, 10),
		record_date: null,
		payment_date: null,
		value: 4,
		...overrides,
	};
}

test("hasPendingSplit returns true for upcoming split", () => {
	const futureDate = new Date();
	futureDate.setDate(futureDate.getDate() + 15);
	const actions: AlpacaCorporateAction[] = [
		createAction({ ex_date: futureDate.toISOString().slice(0, 10) }, "Split"),
	];
	expect(hasPendingSplit(actions)).toBe(true);
});

test("hasPendingSplit returns true for upcoming reverse split", () => {
	const futureDate = new Date();
	futureDate.setDate(futureDate.getDate() + 10);
	const actions: AlpacaCorporateAction[] = [
		createAction(
			{
				symbol: "XYZ",
				ex_date: futureDate.toISOString().slice(0, 10),
				value: 0.1,
			},
			"ReverseSplit",
		),
	];
	expect(hasPendingSplit(actions)).toBe(true);
});

test("hasPendingSplit returns false for past split", () => {
	const pastDate = new Date();
	pastDate.setDate(pastDate.getDate() - 10);
	const actions: AlpacaCorporateAction[] = [
		createAction({ ex_date: pastDate.toISOString().slice(0, 10) }, "Split"),
	];
	expect(hasPendingSplit(actions)).toBe(false);
});

test("hasPendingSplit returns false for split beyond lookahead window", () => {
	const farFutureDate = new Date();
	farFutureDate.setDate(farFutureDate.getDate() + 60);
	const actions: AlpacaCorporateAction[] = [
		createAction({ ex_date: farFutureDate.toISOString().slice(0, 10) }, "Split"),
	];
	expect(hasPendingSplit(actions, new Date(), 30)).toBe(false);
});

test("hasPendingSplit returns false for non-split actions", () => {
	const futureDate = new Date();
	futureDate.setDate(futureDate.getDate() + 15);
	const actions: AlpacaCorporateAction[] = [
		createAction(
			{
				ex_date: futureDate.toISOString().slice(0, 10),
				value: 0.25,
			},
			"Dividend",
		),
	];
	expect(hasPendingSplit(actions)).toBe(false);
});

test("hasPendingSplit returns false for empty actions array", () => {
	expect(hasPendingSplit([])).toBe(false);
});

test("calculateDividendIndicators calculates all indicators correctly", () => {
	// Use dates relative to today to ensure they're within trailing 12 months
	const now = new Date();
	const formatDateStr = (d: Date) => d.toISOString().slice(0, 10);

	const q1 = new Date(now);
	q1.setMonth(q1.getMonth() - 1);
	const q2 = new Date(now);
	q2.setMonth(q2.getMonth() - 4);
	const q3 = new Date(now);
	q3.setMonth(q3.getMonth() - 7);
	const q4 = new Date(now);
	q4.setMonth(q4.getMonth() - 10);

	const dividends = [
		{ amount: 0.5, exDate: formatDateStr(q1) },
		{ amount: 0.5, exDate: formatDateStr(q2) },
		{ amount: 0.5, exDate: formatDateStr(q3) },
		{ amount: 0.5, exDate: formatDateStr(q4) },
	];

	const futureDate = new Date(now);
	futureDate.setDate(futureDate.getDate() + 30);

	const result = calculateDividendIndicators(
		dividends,
		100, // $100 stock price
		formatDateStr(futureDate), // Future ex-date
		1.8, // Prior year dividends
	);

	expect(result.trailingDividendYield).toBe(0.02); // 2% yield ($2 / $100)
	// Days to ex-dividend may vary slightly due to time-of-day
	expect(result.daysToExDividend).toBeGreaterThanOrEqual(29);
	expect(result.daysToExDividend).toBeLessThanOrEqual(30);
	expect(result.dividendGrowth).toBeCloseTo(0.1111, 3); // ~11% growth (2.0 vs 1.8)
	expect(result.lastDividendAmount).toBe(0.5);
	expect(result.annualDividend).toBe(2.0);
});

test("calculateDividendIndicators handles no dividends", () => {
	const result = calculateDividendIndicators([], 100, null, 0);

	expect(result.trailingDividendYield).toBeNull();
	expect(result.daysToExDividend).toBeNull();
	expect(result.dividendGrowth).toBeNull();
	expect(result.lastDividendAmount).toBeNull();
	expect(result.annualDividend).toBeNull();
});

test("calculateDividendIndicators handles null price", () => {
	const dividends = [{ amount: 0.5, exDate: new Date().toISOString().slice(0, 10) }];
	const result = calculateDividendIndicators(dividends, null, null, 0);

	expect(result.trailingDividendYield).toBeNull();
	expect(result.lastDividendAmount).toBe(0.5);
	expect(result.annualDividend).toBe(0.5);
});

test("calculateDividendIndicators filters out dividends older than 12 months", () => {
	const oldDate = new Date();
	oldDate.setFullYear(oldDate.getFullYear() - 2);
	const dividends = [
		{ amount: 0.5, exDate: new Date().toISOString().slice(0, 10) },
		{ amount: 10.0, exDate: oldDate.toISOString().slice(0, 10) }, // Old dividend should be excluded
	];

	const result = calculateDividendIndicators(dividends, 100, null, 0);
	expect(result.annualDividend).toBe(0.5); // Only recent dividend counted
});
