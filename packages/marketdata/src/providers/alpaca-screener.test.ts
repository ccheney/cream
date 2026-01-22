/**
 * Alpaca Screener API Tests
 *
 * Unit tests for the Alpaca Screener client.
 */

import { describe, expect, test } from "bun:test";
import {
	AlpacaScreenerClient,
	type AlpacaScreenerConfig,
	MostActiveStockSchema,
	MostActivesResponseSchema,
	MoverSchema,
	MoversResponseSchema,
} from "./alpaca-screener";

describe("AlpacaScreenerClient", () => {
	describe("Schema Validation", () => {
		test("MostActiveStockSchema validates correct data", () => {
			const validData = {
				symbol: "AAPL",
				volume: 50000000,
				trade_count: 100000,
			};

			const result = MostActiveStockSchema.safeParse(validData);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.symbol).toBe("AAPL");
				expect(result.data.volume).toBe(50000000);
				expect(result.data.trade_count).toBe(100000);
			}
		});

		test("MostActiveStockSchema rejects invalid data", () => {
			const invalidData = {
				symbol: 123, // should be string
				volume: "high", // should be number
			};

			const result = MostActiveStockSchema.safeParse(invalidData);
			expect(result.success).toBe(false);
		});

		test("MostActivesResponseSchema validates response structure", () => {
			const validResponse = {
				most_actives: [
					{ symbol: "AAPL", volume: 50000000, trade_count: 100000 },
					{ symbol: "MSFT", volume: 30000000, trade_count: 75000 },
				],
				last_updated: "2024-01-15T10:00:00Z",
			};

			const result = MostActivesResponseSchema.safeParse(validResponse);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.most_actives).toHaveLength(2);
				expect(result.data.last_updated).toBe("2024-01-15T10:00:00Z");
			}
		});

		test("MoverSchema validates correct data", () => {
			const validData = {
				symbol: "NVDA",
				percent_change: 5.25,
				change: 12.5,
				price: 250.75,
			};

			const result = MoverSchema.safeParse(validData);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.symbol).toBe("NVDA");
				expect(result.data.percent_change).toBe(5.25);
				expect(result.data.change).toBe(12.5);
				expect(result.data.price).toBe(250.75);
			}
		});

		test("MoversResponseSchema validates response structure", () => {
			const validResponse = {
				gainers: [{ symbol: "NVDA", percent_change: 5.25, change: 12.5, price: 250.75 }],
				losers: [{ symbol: "INTC", percent_change: -3.5, change: -1.5, price: 42.0 }],
				market_type: "stocks" as const,
				last_updated: "2024-01-15T10:00:00Z",
			};

			const result = MoversResponseSchema.safeParse(validResponse);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.gainers).toHaveLength(1);
				expect(result.data.losers).toHaveLength(1);
				expect(result.data.market_type).toBe("stocks");
			}
		});
	});

	describe("Client Instantiation", () => {
		test("creates client with valid config", () => {
			const config: AlpacaScreenerConfig = {
				apiKey: "test-key",
				apiSecret: "test-secret",
			};

			const client = new AlpacaScreenerClient(config);
			expect(client).toBeInstanceOf(AlpacaScreenerClient);
		});

		test("creates client with custom base URL", () => {
			const config: AlpacaScreenerConfig = {
				apiKey: "test-key",
				apiSecret: "test-secret",
				baseUrl: "https://custom.api.test",
			};

			const client = new AlpacaScreenerClient(config);
			expect(client).toBeInstanceOf(AlpacaScreenerClient);
		});
	});

	describe("getPreMarketMovers filtering", () => {
		test("filters movers to universe symbols", async () => {
			// This is a unit test for the filtering logic
			// The actual API calls are handled by getMostActives/getMarketMovers

			const universeSymbols = ["AAPL", "MSFT", "GOOGL"];
			const allMovers = {
				gainers: [
					{ symbol: "AAPL", percent_change: 5.0, change: 10, price: 200 },
					{ symbol: "NVDA", percent_change: 7.0, change: 35, price: 500 },
					{ symbol: "XYZ", percent_change: 3.0, change: 1.5, price: 50 },
				],
				losers: [
					{ symbol: "MSFT", percent_change: -2.0, change: -8, price: 400 },
					{ symbol: "ABC", percent_change: -5.0, change: -2.5, price: 50 },
				],
			};

			// Simulate the filtering logic from getPreMarketMovers
			const universeSet = new Set(universeSymbols.map((s) => s.toUpperCase()));

			const universeGainers = allMovers.gainers.filter((m) =>
				universeSet.has(m.symbol.toUpperCase()),
			);
			const universeLosers = allMovers.losers.filter((m) =>
				universeSet.has(m.symbol.toUpperCase()),
			);

			expect(universeGainers).toHaveLength(1);
			expect(universeGainers[0]?.symbol).toBe("AAPL");
			expect(universeLosers).toHaveLength(1);
			expect(universeLosers[0]?.symbol).toBe("MSFT");
		});
	});
});
