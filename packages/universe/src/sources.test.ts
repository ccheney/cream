/**
 * Universe Source Resolvers Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";
process.env.FMP_KEY = "test-api-key";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { ETFHoldingsSource, IndexSource, ScreenerSource, StaticSource } from "@cream/config";
import {
	resolveETFHoldingsSource,
	resolveIndexSource,
	resolveScreenerSource,
	resolveSource,
	resolveStaticSource,
} from "./sources.js";

// Mock FMP client responses
const mockConstituents = [
	{ symbol: "AAPL", name: "Apple Inc.", sector: "Technology" },
	{ symbol: "MSFT", name: "Microsoft Corporation", sector: "Technology" },
	{ symbol: "GOOGL", name: "Alphabet Inc.", sector: "Communication Services" },
];

const mockETFHoldings = [
	{ asset: "AAPL", name: "Apple Inc.", sharesNumber: 1000000, weightPercentage: 7.5 },
	{ asset: "MSFT", name: "Microsoft Corp", sharesNumber: 800000, weightPercentage: 6.2 },
	{ asset: "NVDA", name: "NVIDIA Corp", sharesNumber: 500000, weightPercentage: 4.8 },
	{ asset: "SMALL", name: "Small Corp", sharesNumber: 10000, weightPercentage: 0.1 },
];

const mockScreenerResults = [
	{
		symbol: "AAPL",
		companyName: "Apple Inc.",
		marketCap: 3000000000000,
		sector: "Technology",
		industry: "Consumer Electronics",
		beta: 1.2,
		price: 195.5,
		lastAnnualDividend: 0.96,
		volume: 50000000,
		exchange: "NASDAQ",
		exchangeShortName: "NASDAQ",
		country: "US",
		isActivelyTrading: true,
		isEtf: false,
	},
	{
		symbol: "MSFT",
		companyName: "Microsoft Corporation",
		marketCap: 2800000000000,
		sector: "Technology",
		industry: "Software",
		beta: 0.9,
		price: 420.0,
		lastAnnualDividend: 3.0,
		volume: 25000000,
		exchange: "NASDAQ",
		exchangeShortName: "NASDAQ",
		country: "US",
		isActivelyTrading: true,
		isEtf: false,
	},
];

describe("Source Resolvers", () => {
	let originalFetch: typeof global.fetch;
	let mockFetch: ReturnType<typeof mock>;

	beforeEach(() => {
		originalFetch = global.fetch;
		mockFetch = mock(() =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve([]),
			} as Response)
		);
		global.fetch = mockFetch;
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	// ========================================
	// Static Source
	// ========================================

	describe("resolveStaticSource", () => {
		test("resolves static source with tickers", async () => {
			const source: StaticSource = {
				name: "my-watchlist",
				type: "static",
				tickers: ["AAPL", "msft", "GOOGL"],
				enabled: true,
			};

			const result = await resolveStaticSource(source);

			expect(result.sourceName).toBe("my-watchlist");
			expect(result.instruments).toHaveLength(3);
			expect(result.instruments[0]!.symbol).toBe("AAPL");
			expect(result.instruments[1]!.symbol).toBe("MSFT"); // Should be uppercased
			expect(result.instruments[2]!.symbol).toBe("GOOGL");
			expect(result.instruments[0]!.source).toBe("my-watchlist");
			expect(result.warnings).toHaveLength(0);
			expect(result.resolvedAt).toBeDefined();
		});

		test("resolves empty static source", async () => {
			const source: StaticSource = {
				name: "empty",
				type: "static",
				tickers: [],
				enabled: true,
			};

			const result = await resolveStaticSource(source);

			expect(result.instruments).toHaveLength(0);
		});
	});

	// ========================================
	// Index Source
	// ========================================

	describe("resolveIndexSource", () => {
		test("resolves index source with current constituents", async () => {
			mockFetch.mockImplementation(() =>
				Promise.resolve({
					ok: true,
					json: () => Promise.resolve(mockConstituents),
				} as Response)
			);

			const source: IndexSource = {
				name: "sp500",
				type: "index",
				index_id: "SP500",
				provider: "fmp",
				point_in_time: false,
				enabled: true,
			};

			const result = await resolveIndexSource(source);

			expect(result.sourceName).toBe("sp500");
			expect(result.instruments).toHaveLength(3);
			expect(result.instruments[0]!.symbol).toBe("AAPL");
			expect(result.instruments[0]!.name).toBe("Apple Inc.");
			expect(result.instruments[0]!.sector).toBe("Technology");
			expect(result.instruments[0]!.source).toBe("sp500");
		});

		test("resolves index source with point-in-time constituents", async () => {
			let callCount = 0;
			mockFetch.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(mockConstituents),
					} as Response);
				}
				return Promise.resolve({
					ok: true,
					json: () =>
						Promise.resolve([
							{
								dateAdded: "2024-06-24",
								symbol: "GOOGL",
								removedTicker: "META",
								addedSecurity: "Alphabet",
								removedSecurity: "Meta",
								reason: "Change",
							},
						]),
				} as Response);
			});

			const source: IndexSource = {
				name: "sp500-historical",
				type: "index",
				index_id: "SP500",
				provider: "fmp",
				point_in_time: true,
				enabled: true,
			};

			const result = await resolveIndexSource(source, { asOfDate: new Date("2023-01-01") });

			expect(result.warnings).toHaveLength(1);
			expect(result.warnings[0]).toContain("point-in-time");
		});

		test("throws for unsupported provider", async () => {
			const source: IndexSource = {
				name: "bad-provider",
				type: "index",
				index_id: "SP500",
				provider: "unknown" as any,
				point_in_time: false,
				enabled: true,
			};

			await expect(resolveIndexSource(source)).rejects.toThrow(
				"Unsupported provider for index source: unknown"
			);
		});
	});

	// ========================================
	// ETF Holdings Source
	// ========================================

	describe("resolveETFHoldingsSource", () => {
		test("resolves ETF holdings with single symbol", async () => {
			mockFetch.mockImplementation(() =>
				Promise.resolve({
					ok: true,
					json: () => Promise.resolve(mockETFHoldings),
				} as Response)
			);

			const source: ETFHoldingsSource = {
				name: "spy-holdings",
				type: "etf_holdings",
				etf_symbol: "SPY",
				provider: "fmp",
				min_weight_pct: 1.0,
				enabled: true,
			};

			const result = await resolveETFHoldingsSource(source);

			expect(result.sourceName).toBe("spy-holdings");
			// Should exclude SMALL with 0.1% weight (below 1.0% threshold)
			expect(result.instruments).toHaveLength(3);
			expect(result.instruments.map((i) => i.symbol)).toContain("AAPL");
			expect(result.instruments.map((i) => i.symbol)).toContain("MSFT");
			expect(result.instruments.map((i) => i.symbol)).toContain("NVDA");
			expect(result.instruments.map((i) => i.symbol)).not.toContain("SMALL");
		});

		test("resolves ETF holdings with top_n limit", async () => {
			mockFetch.mockImplementation(() =>
				Promise.resolve({
					ok: true,
					json: () => Promise.resolve(mockETFHoldings),
				} as Response)
			);

			const source: ETFHoldingsSource = {
				name: "spy-top2",
				type: "etf_holdings",
				etf_symbol: "SPY",
				provider: "fmp",
				min_weight_pct: 0,
				top_n: 2,
				enabled: true,
			};

			const result = await resolveETFHoldingsSource(source);

			expect(result.instruments).toHaveLength(2);
			// Should be sorted by weight descending
			expect(result.instruments[0]!.symbol).toBe("AAPL");
			expect(result.instruments[1]!.symbol).toBe("MSFT");
		});

		test("resolves ETF holdings with multiple ETFs", async () => {
			mockFetch.mockImplementation(() =>
				Promise.resolve({
					ok: true,
					json: () =>
						Promise.resolve([
							{ asset: "AAPL", name: "Apple", sharesNumber: 100, weightPercentage: 10 },
							{ asset: "UNIQUE", name: "Unique Corp", sharesNumber: 50, weightPercentage: 5 },
						]),
				} as Response)
			);

			const source: ETFHoldingsSource = {
				name: "multi-etf",
				type: "etf_holdings",
				etf_symbols: ["SPY", "QQQ"],
				provider: "fmp",
				min_weight_pct: 0,
				enabled: true,
			};

			const result = await resolveETFHoldingsSource(source);

			// Should deduplicate AAPL (appears in both)
			const aaplCount = result.instruments.filter((i) => i.symbol === "AAPL").length;
			expect(aaplCount).toBe(1);
		});

		test("throws for missing ETF symbol", async () => {
			const source: ETFHoldingsSource = {
				name: "no-etf",
				type: "etf_holdings",
				provider: "fmp",
				min_weight_pct: 0,
				enabled: true,
			} as ETFHoldingsSource;

			await expect(resolveETFHoldingsSource(source)).rejects.toThrow(
				"ETF holdings source requires etf_symbol or etf_symbols"
			);
		});

		test("throws for unsupported provider", async () => {
			const source: ETFHoldingsSource = {
				name: "bad-provider",
				type: "etf_holdings",
				etf_symbol: "SPY",
				provider: "unknown" as any,
				min_weight_pct: 0,
				enabled: true,
			};

			await expect(resolveETFHoldingsSource(source)).rejects.toThrow(
				"Unsupported provider for ETF holdings: unknown"
			);
		});
	});

	// ========================================
	// Screener Source
	// ========================================

	describe("resolveScreenerSource", () => {
		test("resolves screener source with filters", async () => {
			mockFetch.mockImplementation(() =>
				Promise.resolve({
					ok: true,
					json: () => Promise.resolve(mockScreenerResults),
				} as Response)
			);

			const source: ScreenerSource = {
				name: "tech-screener",
				type: "screener",
				provider: "fmp",
				filters: {
					market_cap_min: 1000000000,
					market_cap_max: 100000000000,
					volume_avg_min: 1000000,
					price_min: 10,
					price_max: 500,
					sector: "Technology",
					is_etf: false,
					is_actively_trading: true,
					exchange: ["NASDAQ", "NYSE"],
				},
				limit: 100,
				enabled: true,
			};

			const result = await resolveScreenerSource(source);

			expect(result.sourceName).toBe("tech-screener");
			expect(result.instruments).toHaveLength(2);
			expect(result.instruments[0]!.symbol).toBe("AAPL");
			expect(result.instruments[0]!.name).toBe("Apple Inc.");
			expect(result.instruments[0]!.sector).toBe("Technology");
			expect(result.instruments[0]!.industry).toBe("Consumer Electronics");
			expect(result.instruments[0]!.marketCap).toBe(3000000000000);
			expect(result.instruments[0]!.price).toBe(195.5);
		});

		test("resolves screener with sort_by volume desc", async () => {
			mockFetch.mockImplementation(() =>
				Promise.resolve({
					ok: true,
					json: () => Promise.resolve(mockScreenerResults),
				} as Response)
			);

			const source: ScreenerSource = {
				name: "high-volume",
				type: "screener",
				provider: "fmp",
				filters: {},
				limit: 100,
				sort_by: "volume",
				sort_order: "desc",
				enabled: true,
			};

			const result = await resolveScreenerSource(source);

			// AAPL has 50M volume, MSFT has 25M
			expect(result.instruments[0]!.symbol).toBe("AAPL");
			expect(result.instruments[1]!.symbol).toBe("MSFT");
		});

		test("resolves screener with sort_by market_cap asc", async () => {
			mockFetch.mockImplementation(() =>
				Promise.resolve({
					ok: true,
					json: () => Promise.resolve(mockScreenerResults),
				} as Response)
			);

			const source: ScreenerSource = {
				name: "small-cap",
				type: "screener",
				provider: "fmp",
				filters: {},
				limit: 100,
				sort_by: "market_cap",
				sort_order: "asc",
				enabled: true,
			};

			const result = await resolveScreenerSource(source);

			// MSFT has lower market cap
			expect(result.instruments[0]!.symbol).toBe("MSFT");
			expect(result.instruments[1]!.symbol).toBe("AAPL");
		});

		test("throws for unsupported provider", async () => {
			const source: ScreenerSource = {
				name: "bad-provider",
				type: "screener",
				provider: "unknown" as any,
				filters: {},
				limit: 100,
				enabled: true,
			};

			await expect(resolveScreenerSource(source)).rejects.toThrow(
				"Unsupported provider for screener: unknown"
			);
		});
	});

	// ========================================
	// Generic resolveSource
	// ========================================

	describe("resolveSource", () => {
		test("resolves static source", async () => {
			const source: StaticSource = {
				name: "test-static",
				type: "static",
				tickers: ["AAPL"],
				enabled: true,
			};

			const result = await resolveSource(source);
			expect(result.sourceName).toBe("test-static");
		});

		test("resolves index source", async () => {
			mockFetch.mockImplementation(() =>
				Promise.resolve({
					ok: true,
					json: () => Promise.resolve(mockConstituents),
				} as Response)
			);

			const source: IndexSource = {
				name: "test-index",
				type: "index",
				index_id: "SP500",
				provider: "fmp",
				point_in_time: false,
				enabled: true,
			};

			const result = await resolveSource(source);
			expect(result.sourceName).toBe("test-index");
		});

		test("resolves etf_holdings source", async () => {
			mockFetch.mockImplementation(() =>
				Promise.resolve({
					ok: true,
					json: () => Promise.resolve(mockETFHoldings),
				} as Response)
			);

			const source: ETFHoldingsSource = {
				name: "test-etf",
				type: "etf_holdings",
				etf_symbol: "SPY",
				provider: "fmp",
				min_weight_pct: 0,
				enabled: true,
			};

			const result = await resolveSource(source);
			expect(result.sourceName).toBe("test-etf");
		});

		test("resolves screener source", async () => {
			mockFetch.mockImplementation(() =>
				Promise.resolve({
					ok: true,
					json: () => Promise.resolve(mockScreenerResults),
				} as Response)
			);

			const source: ScreenerSource = {
				name: "test-screener",
				type: "screener",
				provider: "fmp",
				filters: {},
				limit: 100,
				enabled: true,
			};

			const result = await resolveSource(source);
			expect(result.sourceName).toBe("test-screener");
		});

		test("throws for unknown source type", async () => {
			const source = {
				name: "unknown",
				type: "unknown",
				enabled: true,
			};

			await expect(resolveSource(source as any)).rejects.toThrow("Unknown source type: unknown");
		});
	});
});
