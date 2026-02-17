/**
 * Alpaca Screener schema tests
 */

import { describe, expect, test } from "bun:test";
import {
	MostActiveStockSchema,
	MostActivesResponseSchema,
	MoverSchema,
	MoversResponseSchema,
} from "./alpaca-screener";

describe("Most actives schemas", () => {
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
			symbol: 123,
			volume: "high",
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
});

describe("Movers schemas", () => {
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
			losers: [{ symbol: "INTC", percent_change: -3.5, change: -1.5, price: 42 }],
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
