/**
 * Corporate actions adapter tests for BatchDataAdapter
 */

import { expect, test } from "bun:test";
import { requireValue } from "@cream/test-utils";
import {
	CorporateActionsRepositoryAdapter,
	createCorporateActionsRepositoryAdapter,
	type StorageCorporateActionRow,
} from "./batch-data-adapter";
import { createMockCorporateActionsRepo } from "./batch-data-adapter.test-helpers";

test("CorporateActionsRepositoryAdapter returns null when no data exists", async () => {
	const mockRepo = createMockCorporateActionsRepo(new Map(), new Map());
	const adapter = new CorporateActionsRepositoryAdapter(mockRepo);

	const result = await adapter.getLatest("AAPL");

	expect(result).toBeNull();
});

test("CorporateActionsRepositoryAdapter calculates trailing dividend yield", async () => {
	const today = new Date();
	const sixMonthsAgo = new Date(today);
	sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
	const nineMonthsAgo = new Date(today);
	nineMonthsAgo.setMonth(nineMonthsAgo.getMonth() - 9);

	const dividends: StorageCorporateActionRow[] = [
		{
			symbol: "AAPL",
			actionType: "dividend",
			exDate: sixMonthsAgo.toISOString().slice(0, 10),
			recordDate: null,
			payDate: null,
			ratio: null,
			amount: 0.24,
			details: null,
			provider: "polygon",
		},
		{
			symbol: "AAPL",
			actionType: "dividend",
			exDate: nineMonthsAgo.toISOString().slice(0, 10),
			recordDate: null,
			payDate: null,
			ratio: null,
			amount: 0.23,
			details: null,
			provider: "polygon",
		},
	];

	const mockRepo = createMockCorporateActionsRepo(new Map([["AAPL", dividends]]), new Map());
	const adapter = new CorporateActionsRepositoryAdapter(mockRepo);
	const result = await adapter.getLatest("AAPL");

	expect(requireValue(result, "result").trailing_dividend_yield).toBeCloseTo(0.47, 2);
});

test("CorporateActionsRepositoryAdapter detects a recent split within 6 months", async () => {
	const today = new Date();
	const threeMonthsAgo = new Date(today);
	threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

	const splits: StorageCorporateActionRow[] = [
		{
			symbol: "GOOGL",
			actionType: "split",
			exDate: threeMonthsAgo.toISOString().slice(0, 10),
			recordDate: null,
			payDate: null,
			ratio: 20,
			amount: null,
			details: null,
			provider: "polygon",
		},
	];

	const mockRepo = createMockCorporateActionsRepo(new Map(), new Map([["GOOGL", splits]]));
	const adapter = new CorporateActionsRepositoryAdapter(mockRepo);
	const result = await adapter.getLatest("GOOGL");

	expect(requireValue(result, "result").recent_split).toBe(true);
});

test("CorporateActionsRepositoryAdapter excludes old split from recent flag", async () => {
	const today = new Date();
	const oneYearAgo = new Date(today);
	oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

	const splits: StorageCorporateActionRow[] = [
		{
			symbol: "TSLA",
			actionType: "split",
			exDate: oneYearAgo.toISOString().slice(0, 10),
			recordDate: null,
			payDate: null,
			ratio: 3,
			amount: null,
			details: null,
			provider: "polygon",
		},
	];

	const mockRepo = createMockCorporateActionsRepo(new Map(), new Map([["TSLA", splits]]));
	const adapter = new CorporateActionsRepositoryAdapter(mockRepo);
	const result = await adapter.getLatest("TSLA");

	expect(requireValue(result, "result").recent_split).toBe(false);
});

test("CorporateActionsRepositoryAdapter calculates days until ex-dividend", async () => {
	const today = new Date();
	const tenDaysFromNow = new Date(today);
	tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);

	const dividends: StorageCorporateActionRow[] = [
		{
			symbol: "MSFT",
			actionType: "dividend",
			exDate: tenDaysFromNow.toISOString().slice(0, 10),
			recordDate: null,
			payDate: null,
			ratio: null,
			amount: 0.75,
			details: null,
			provider: "polygon",
		},
	];

	const mockRepo = createMockCorporateActionsRepo(new Map([["MSFT", dividends]]), new Map());
	const adapter = new CorporateActionsRepositoryAdapter(mockRepo);
	const result = await adapter.getLatest("MSFT");
	const exDividendDays = requireValue(result, "result").ex_dividend_days;

	expect(exDividendDays).toBeGreaterThanOrEqual(9);
	expect(exDividendDays).toBeLessThanOrEqual(11);
});

test("CorporateActionsRepositoryAdapter returns null ex-dividend days when no upcoming dividend", async () => {
	const today = new Date();
	const oneMonthAgo = new Date(today);
	oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

	const dividends: StorageCorporateActionRow[] = [
		{
			symbol: "IBM",
			actionType: "dividend",
			exDate: oneMonthAgo.toISOString().slice(0, 10),
			recordDate: null,
			payDate: null,
			ratio: null,
			amount: 1.66,
			details: null,
			provider: "polygon",
		},
	];

	const mockRepo = createMockCorporateActionsRepo(new Map([["IBM", dividends]]), new Map());
	const adapter = new CorporateActionsRepositoryAdapter(mockRepo);
	const result = await adapter.getLatest("IBM");

	expect(requireValue(result, "result").ex_dividend_days).toBeNull();
});

test("createCorporateActionsRepositoryAdapter creates adapter from factory", async () => {
	const mockRepo = createMockCorporateActionsRepo(new Map(), new Map());
	const adapter = createCorporateActionsRepositoryAdapter(mockRepo);

	expect(adapter).toBeInstanceOf(CorporateActionsRepositoryAdapter);
	expect(typeof adapter.getLatest).toBe("function");
});
