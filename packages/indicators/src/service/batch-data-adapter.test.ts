/**
 * Fundamental adapter tests for BatchDataAdapter
 */

import { expect, test } from "bun:test";
import { requireValue } from "@cream/test-utils";
import {
	createFundamentalRepositoryAdapter,
	FundamentalRepositoryAdapter,
	type StorageFundamentalRow,
} from "./batch-data-adapter";
import { createMockFundamentalsRepo } from "./batch-data-adapter.test-helpers";

const fullFundamentalRow: StorageFundamentalRow = {
	id: "test-1",
	symbol: "AAPL",
	date: "2026-01-10",
	peRatioTtm: 25.5,
	peRatioForward: 22.3,
	pbRatio: 8.2,
	evEbitda: 15.8,
	earningsYield: 0.039,
	dividendYield: 0.0052,
	cape10yr: 28.5,
	grossProfitability: 0.43,
	roe: 0.85,
	roa: 0.21,
	assetGrowth: 0.08,
	accrualsRatio: -0.02,
	cashFlowQuality: 0.92,
	beneishMScore: -2.5,
	marketCap: 3000000000000,
	sector: "Technology",
	industry: "Consumer Electronics",
	source: "test",
	computedAt: "2026-01-10T12:00:00Z",
};

const nullsFundamentalRow: StorageFundamentalRow = {
	id: "test-2",
	symbol: "TSLA",
	date: "2026-01-10",
	peRatioTtm: null,
	peRatioForward: 45.0,
	pbRatio: null,
	evEbitda: null,
	earningsYield: null,
	dividendYield: null,
	cape10yr: null,
	grossProfitability: 0.25,
	roe: null,
	roa: null,
	assetGrowth: 0.15,
	accrualsRatio: null,
	cashFlowQuality: null,
	beneishMScore: null,
	marketCap: 800000000000,
	sector: "Consumer Cyclical",
	industry: "Auto Manufacturers",
	source: "test",
	computedAt: "2026-01-10T12:00:00Z",
};

test("FundamentalRepositoryAdapter returns null when no data exists", async () => {
	const mockRepo = createMockFundamentalsRepo(new Map());
	const adapter = new FundamentalRepositoryAdapter(mockRepo);

	const result = await adapter.getLatest("AAPL");

	expect(result).toBeNull();
});

test("FundamentalRepositoryAdapter transforms row to value and quality indicators", async () => {
	const mockRepo = createMockFundamentalsRepo(new Map([["AAPL", fullFundamentalRow]]));
	const adapter = new FundamentalRepositoryAdapter(mockRepo);

	const result = await adapter.getLatest("AAPL");
	const latest = requireValue(result, "result");

	expect(latest.value.pe_ratio_ttm).toBe(25.5);
	expect(latest.value.pe_ratio_forward).toBe(22.3);
	expect(latest.value.pb_ratio).toBe(8.2);
	expect(latest.value.ev_ebitda).toBe(15.8);
	expect(latest.value.earnings_yield).toBe(0.039);
	expect(latest.value.dividend_yield).toBe(0.0052);
	expect(latest.value.cape_10yr).toBe(28.5);
	expect(latest.quality.gross_profitability).toBe(0.43);
	expect(latest.quality.roe).toBe(0.85);
	expect(latest.quality.roa).toBe(0.21);
	expect(latest.quality.asset_growth).toBe(0.08);
	expect(latest.quality.accruals_ratio).toBe(-0.02);
	expect(latest.quality.cash_flow_quality).toBe(0.92);
	expect(latest.quality.beneish_m_score).toBe(-2.5);
	expect(latest.quality.earnings_quality).toBeNull();
});

test("FundamentalRepositoryAdapter handles null values in row", async () => {
	const mockRepo = createMockFundamentalsRepo(new Map([["TSLA", nullsFundamentalRow]]));
	const adapter = new FundamentalRepositoryAdapter(mockRepo);

	const result = await adapter.getLatest("TSLA");
	const latest = requireValue(result, "result");

	expect(latest.value.pe_ratio_ttm).toBeNull();
	expect(latest.value.pe_ratio_forward).toBe(45.0);
	expect(latest.value.pb_ratio).toBeNull();
	expect(latest.quality.gross_profitability).toBe(0.25);
	expect(latest.quality.roe).toBeNull();
});

test("createFundamentalRepositoryAdapter creates adapter from factory", async () => {
	const mockRepo = createMockFundamentalsRepo(new Map());
	const adapter = createFundamentalRepositoryAdapter(mockRepo);

	expect(adapter).toBeInstanceOf(FundamentalRepositoryAdapter);
	expect(typeof adapter.getLatest).toBe("function");
});
