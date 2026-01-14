/**
 * Tests for BatchDataAdapter
 */

import { describe, expect, test } from "bun:test";
import {
	CorporateActionsRepositoryAdapter,
	createBatchRepositoryAdapters,
	createCorporateActionsRepositoryAdapter,
	createFundamentalRepositoryAdapter,
	createSentimentRepositoryAdapter,
	createShortInterestRepositoryAdapter,
	FundamentalRepositoryAdapter,
	SentimentRepositoryAdapter,
	ShortInterestRepositoryAdapter,
	type TursoCorporateActionRow,
	type TursoCorporateActionsRepository,
	type TursoFundamentalRow,
	type TursoFundamentalsRepository,
	type TursoSentimentRepository,
	type TursoSentimentRow,
	type TursoShortInterestRepository,
	type TursoShortInterestRow,
} from "./batch-data-adapter";

// ============================================================
// Mock Implementations
// ============================================================

function createMockFundamentalsRepo(
	data: Map<string, TursoFundamentalRow>
): TursoFundamentalsRepository {
	return {
		async findLatestBySymbol(symbol: string) {
			return data.get(symbol) ?? null;
		},
	};
}

function createMockShortInterestRepo(
	data: Map<string, TursoShortInterestRow>
): TursoShortInterestRepository {
	return {
		async findLatestBySymbol(symbol: string) {
			return data.get(symbol) ?? null;
		},
	};
}

function createMockSentimentRepo(data: Map<string, TursoSentimentRow>): TursoSentimentRepository {
	return {
		async findLatestBySymbol(symbol: string) {
			return data.get(symbol) ?? null;
		},
	};
}

function createMockCorporateActionsRepo(
	dividends: Map<string, TursoCorporateActionRow[]>,
	splits: Map<string, TursoCorporateActionRow[]>
): TursoCorporateActionsRepository {
	return {
		async getForSymbol(symbol: string) {
			return [...(dividends.get(symbol) ?? []), ...(splits.get(symbol) ?? [])];
		},
		async getDividends(symbol: string) {
			return dividends.get(symbol) ?? [];
		},
		async getSplits(symbol: string) {
			return splits.get(symbol) ?? [];
		},
	};
}

// ============================================================
// FundamentalRepositoryAdapter Tests
// ============================================================

describe("FundamentalRepositoryAdapter", () => {
	test("returns null when no data exists", async () => {
		const mockRepo = createMockFundamentalsRepo(new Map());
		const adapter = new FundamentalRepositoryAdapter(mockRepo);

		const result = await adapter.getLatest("AAPL");

		expect(result).toBeNull();
	});

	test("transforms fundamental row to value and quality indicators", async () => {
		const row: TursoFundamentalRow = {
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
			source: "FMP",
			computedAt: "2026-01-10T12:00:00Z",
		};

		const mockRepo = createMockFundamentalsRepo(new Map([["AAPL", row]]));
		const adapter = new FundamentalRepositoryAdapter(mockRepo);

		const result = await adapter.getLatest("AAPL");

		expect(result).not.toBeNull();
		expect(result!.value.pe_ratio_ttm).toBe(25.5);
		expect(result!.value.pe_ratio_forward).toBe(22.3);
		expect(result!.value.pb_ratio).toBe(8.2);
		expect(result!.value.ev_ebitda).toBe(15.8);
		expect(result!.value.earnings_yield).toBe(0.039);
		expect(result!.value.dividend_yield).toBe(0.0052);
		expect(result!.value.cape_10yr).toBe(28.5);

		expect(result!.quality.gross_profitability).toBe(0.43);
		expect(result!.quality.roe).toBe(0.85);
		expect(result!.quality.roa).toBe(0.21);
		expect(result!.quality.asset_growth).toBe(0.08);
		expect(result!.quality.accruals_ratio).toBe(-0.02);
		expect(result!.quality.cash_flow_quality).toBe(0.92);
		expect(result!.quality.beneish_m_score).toBe(-2.5);
		expect(result!.quality.earnings_quality).toBeNull();
	});

	test("handles null values in fundamental row", async () => {
		const row: TursoFundamentalRow = {
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
			source: "FMP",
			computedAt: "2026-01-10T12:00:00Z",
		};

		const mockRepo = createMockFundamentalsRepo(new Map([["TSLA", row]]));
		const adapter = new FundamentalRepositoryAdapter(mockRepo);

		const result = await adapter.getLatest("TSLA");

		expect(result).not.toBeNull();
		expect(result!.value.pe_ratio_ttm).toBeNull();
		expect(result!.value.pe_ratio_forward).toBe(45.0);
		expect(result!.value.pb_ratio).toBeNull();
		expect(result!.quality.gross_profitability).toBe(0.25);
		expect(result!.quality.roe).toBeNull();
	});
});

describe("createFundamentalRepositoryAdapter", () => {
	test("creates adapter from factory function", async () => {
		const mockRepo = createMockFundamentalsRepo(new Map());
		const adapter = createFundamentalRepositoryAdapter(mockRepo);

		expect(adapter).toBeInstanceOf(FundamentalRepositoryAdapter);
		expect(typeof adapter.getLatest).toBe("function");
	});
});

// ============================================================
// ShortInterestRepositoryAdapter Tests
// ============================================================

describe("ShortInterestRepositoryAdapter", () => {
	test("returns null when no data exists", async () => {
		const mockRepo = createMockShortInterestRepo(new Map());
		const adapter = new ShortInterestRepositoryAdapter(mockRepo);

		const result = await adapter.getLatest("GME");

		expect(result).toBeNull();
	});

	test("transforms short interest row to indicators", async () => {
		const row: TursoShortInterestRow = {
			id: "si-1",
			symbol: "GME",
			settlementDate: "2026-01-08",
			shortInterest: 50000000,
			shortInterestRatio: 5.2,
			daysToCover: 3.5,
			shortPctFloat: 0.25,
			shortInterestChange: 0.05,
			source: "FINRA",
			fetchedAt: "2026-01-10T12:00:00Z",
		};

		const mockRepo = createMockShortInterestRepo(new Map([["GME", row]]));
		const adapter = new ShortInterestRepositoryAdapter(mockRepo);

		const result = await adapter.getLatest("GME");

		expect(result).not.toBeNull();
		expect(result!.short_interest_ratio).toBe(5.2);
		expect(result!.days_to_cover).toBe(3.5);
		expect(result!.short_pct_float).toBe(0.25);
		expect(result!.short_interest_change).toBe(0.05);
		expect(result!.settlement_date).toBe("2026-01-08");
	});

	test("handles null values in short interest row", async () => {
		const row: TursoShortInterestRow = {
			id: "si-2",
			symbol: "AMC",
			settlementDate: "2026-01-08",
			shortInterest: 30000000,
			shortInterestRatio: null,
			daysToCover: null,
			shortPctFloat: 0.15,
			shortInterestChange: null,
			source: "FINRA",
			fetchedAt: "2026-01-10T12:00:00Z",
		};

		const mockRepo = createMockShortInterestRepo(new Map([["AMC", row]]));
		const adapter = new ShortInterestRepositoryAdapter(mockRepo);

		const result = await adapter.getLatest("AMC");

		expect(result).not.toBeNull();
		expect(result!.short_interest_ratio).toBeNull();
		expect(result!.days_to_cover).toBeNull();
		expect(result!.short_pct_float).toBe(0.15);
	});
});

describe("createShortInterestRepositoryAdapter", () => {
	test("creates adapter from factory function", async () => {
		const mockRepo = createMockShortInterestRepo(new Map());
		const adapter = createShortInterestRepositoryAdapter(mockRepo);

		expect(adapter).toBeInstanceOf(ShortInterestRepositoryAdapter);
		expect(typeof adapter.getLatest).toBe("function");
	});
});

// ============================================================
// SentimentRepositoryAdapter Tests
// ============================================================

describe("SentimentRepositoryAdapter", () => {
	test("returns null when no data exists", async () => {
		const mockRepo = createMockSentimentRepo(new Map());
		const adapter = new SentimentRepositoryAdapter(mockRepo);

		const result = await adapter.getLatest("AAPL");

		expect(result).toBeNull();
	});

	test("transforms sentiment row to indicators", async () => {
		const row: TursoSentimentRow = {
			id: "sent-1",
			symbol: "AAPL",
			date: "2026-01-10",
			sentimentScore: 0.65,
			sentimentStrength: 0.8,
			newsVolume: 150,
			sentimentMomentum: 0.1,
			eventRiskFlag: false,
			newsSentiment: 0.7,
			socialSentiment: 0.6,
			analystSentiment: 0.65,
			computedAt: "2026-01-10T12:00:00Z",
		};

		const mockRepo = createMockSentimentRepo(new Map([["AAPL", row]]));
		const adapter = new SentimentRepositoryAdapter(mockRepo);

		const result = await adapter.getLatest("AAPL");

		expect(result).not.toBeNull();
		expect(result!.overall_score).toBe(0.65);
		expect(result!.sentiment_strength).toBe(0.8);
		expect(result!.news_volume).toBe(150);
		expect(result!.sentiment_momentum).toBe(0.1);
		expect(result!.event_risk).toBe(false);
		expect(result!.classification).toBe("STRONG_BULLISH");
	});

	test("classifies sentiment correctly for different score ranges", async () => {
		const testCases: Array<{
			score: number;
			expected: "STRONG_BULLISH" | "BULLISH" | "NEUTRAL" | "BEARISH" | "STRONG_BEARISH";
		}> = [
			{ score: 0.8, expected: "STRONG_BULLISH" },
			{ score: 0.6, expected: "STRONG_BULLISH" },
			{ score: 0.4, expected: "BULLISH" },
			{ score: 0.2, expected: "BULLISH" },
			{ score: 0.0, expected: "NEUTRAL" },
			{ score: -0.1, expected: "NEUTRAL" },
			{ score: -0.2, expected: "NEUTRAL" },
			{ score: -0.3, expected: "BEARISH" },
			{ score: -0.5, expected: "BEARISH" },
			{ score: -0.6, expected: "BEARISH" },
			{ score: -0.7, expected: "STRONG_BEARISH" },
			{ score: -1.0, expected: "STRONG_BEARISH" },
		];

		for (const { score, expected } of testCases) {
			const row: TursoSentimentRow = {
				id: "sent-test",
				symbol: "TEST",
				date: "2026-01-10",
				sentimentScore: score,
				sentimentStrength: 0.5,
				newsVolume: 10,
				sentimentMomentum: 0,
				eventRiskFlag: false,
				newsSentiment: null,
				socialSentiment: null,
				analystSentiment: null,
				computedAt: "2026-01-10T12:00:00Z",
			};

			const mockRepo = createMockSentimentRepo(new Map([["TEST", row]]));
			const adapter = new SentimentRepositoryAdapter(mockRepo);

			const result = await adapter.getLatest("TEST");

			expect(result!.classification).toBe(expected);
		}
	});

	test("returns null classification for null sentiment score", async () => {
		const row: TursoSentimentRow = {
			id: "sent-null",
			symbol: "NULL",
			date: "2026-01-10",
			sentimentScore: null,
			sentimentStrength: null,
			newsVolume: 0,
			sentimentMomentum: null,
			eventRiskFlag: false,
			newsSentiment: null,
			socialSentiment: null,
			analystSentiment: null,
			computedAt: "2026-01-10T12:00:00Z",
		};

		const mockRepo = createMockSentimentRepo(new Map([["NULL", row]]));
		const adapter = new SentimentRepositoryAdapter(mockRepo);

		const result = await adapter.getLatest("NULL");

		expect(result!.overall_score).toBeNull();
		expect(result!.classification).toBeNull();
	});
});

describe("createSentimentRepositoryAdapter", () => {
	test("creates adapter from factory function", async () => {
		const mockRepo = createMockSentimentRepo(new Map());
		const adapter = createSentimentRepositoryAdapter(mockRepo);

		expect(adapter).toBeInstanceOf(SentimentRepositoryAdapter);
		expect(typeof adapter.getLatest).toBe("function");
	});
});

// ============================================================
// CorporateActionsRepositoryAdapter Tests
// ============================================================

describe("CorporateActionsRepositoryAdapter", () => {
	test("returns null when no data exists", async () => {
		const mockRepo = createMockCorporateActionsRepo(new Map(), new Map());
		const adapter = new CorporateActionsRepositoryAdapter(mockRepo);

		const result = await adapter.getLatest("AAPL");

		expect(result).toBeNull();
	});

	test("calculates trailing dividend yield from past year", async () => {
		const today = new Date();
		const sixMonthsAgo = new Date(today);
		sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
		const nineMonthsAgo = new Date(today);
		nineMonthsAgo.setMonth(nineMonthsAgo.getMonth() - 9);

		const dividends: TursoCorporateActionRow[] = [
			{
				symbol: "AAPL",
				actionType: "dividend",
				exDate: sixMonthsAgo.toISOString().split("T")[0]!,
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
				exDate: nineMonthsAgo.toISOString().split("T")[0]!,
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

		expect(result).not.toBeNull();
		expect(result!.trailing_dividend_yield).toBeCloseTo(0.47, 2);
	});

	test("detects recent split within 6 months", async () => {
		const today = new Date();
		const threeMonthsAgo = new Date(today);
		threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

		const splits: TursoCorporateActionRow[] = [
			{
				symbol: "GOOGL",
				actionType: "split",
				exDate: threeMonthsAgo.toISOString().split("T")[0]!,
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

		expect(result).not.toBeNull();
		expect(result!.recent_split).toBe(true);
	});

	test("does not detect old split as recent", async () => {
		const today = new Date();
		const oneYearAgo = new Date(today);
		oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

		const splits: TursoCorporateActionRow[] = [
			{
				symbol: "TSLA",
				actionType: "split",
				exDate: oneYearAgo.toISOString().split("T")[0]!,
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

		expect(result).not.toBeNull();
		expect(result!.recent_split).toBe(false);
	});

	test("calculates days until ex-dividend for upcoming dividend", async () => {
		const today = new Date();
		const tenDaysFromNow = new Date(today);
		tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);

		const dividends: TursoCorporateActionRow[] = [
			{
				symbol: "MSFT",
				actionType: "dividend",
				exDate: tenDaysFromNow.toISOString().split("T")[0]!,
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

		expect(result).not.toBeNull();
		expect(result!.ex_dividend_days).toBeGreaterThanOrEqual(9);
		expect(result!.ex_dividend_days).toBeLessThanOrEqual(11);
	});

	test("returns null for ex_dividend_days when no upcoming dividends", async () => {
		const today = new Date();
		const oneMonthAgo = new Date(today);
		oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

		const dividends: TursoCorporateActionRow[] = [
			{
				symbol: "IBM",
				actionType: "dividend",
				exDate: oneMonthAgo.toISOString().split("T")[0]!,
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

		expect(result).not.toBeNull();
		expect(result!.ex_dividend_days).toBeNull();
	});
});

describe("createCorporateActionsRepositoryAdapter", () => {
	test("creates adapter from factory function", async () => {
		const mockRepo = createMockCorporateActionsRepo(new Map(), new Map());
		const adapter = createCorporateActionsRepositoryAdapter(mockRepo);

		expect(adapter).toBeInstanceOf(CorporateActionsRepositoryAdapter);
		expect(typeof adapter.getLatest).toBe("function");
	});
});

// ============================================================
// createBatchRepositoryAdapters Tests
// ============================================================

describe("createBatchRepositoryAdapters", () => {
	test("creates all adapters when all repositories provided", () => {
		const adapters = createBatchRepositoryAdapters({
			fundamentals: createMockFundamentalsRepo(new Map()),
			shortInterest: createMockShortInterestRepo(new Map()),
			sentiment: createMockSentimentRepo(new Map()),
			corporateActions: createMockCorporateActionsRepo(new Map(), new Map()),
		});

		expect(adapters.fundamentalRepo).toBeDefined();
		expect(adapters.shortInterestRepo).toBeDefined();
		expect(adapters.sentimentRepo).toBeDefined();
		expect(adapters.corporateActionsRepo).toBeDefined();
	});

	test("creates only provided adapters", () => {
		const adapters = createBatchRepositoryAdapters({
			fundamentals: createMockFundamentalsRepo(new Map()),
			sentiment: createMockSentimentRepo(new Map()),
		});

		expect(adapters.fundamentalRepo).toBeDefined();
		expect(adapters.shortInterestRepo).toBeUndefined();
		expect(adapters.sentimentRepo).toBeDefined();
		expect(adapters.corporateActionsRepo).toBeUndefined();
	});

	test("returns empty object when no repositories provided", () => {
		const adapters = createBatchRepositoryAdapters({});

		expect(adapters.fundamentalRepo).toBeUndefined();
		expect(adapters.shortInterestRepo).toBeUndefined();
		expect(adapters.sentimentRepo).toBeUndefined();
		expect(adapters.corporateActionsRepo).toBeUndefined();
	});
});
