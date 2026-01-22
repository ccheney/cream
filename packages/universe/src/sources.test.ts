/**
 * Universe Source Resolvers Tests
 */

// Save original env vars for cleanup
const originalAlpacaKey = Bun.env.ALPACA_KEY;
const originalAlpacaSecret = Bun.env.ALPACA_SECRET;
const originalCreamEnv = Bun.env.CREAM_ENV;

// Set required environment variables before imports
Bun.env.CREAM_ENV = "PAPER";
Bun.env.ALPACA_KEY = "test-api-key";
Bun.env.ALPACA_SECRET = "test-api-secret";

import { afterAll, describe, expect, test } from "bun:test";

// Clean up env vars after all tests to avoid polluting other test files
afterAll(() => {
	if (originalAlpacaKey !== undefined) {
		Bun.env.ALPACA_KEY = originalAlpacaKey;
	} else {
		delete Bun.env.ALPACA_KEY;
	}
	if (originalAlpacaSecret !== undefined) {
		Bun.env.ALPACA_SECRET = originalAlpacaSecret;
	} else {
		delete Bun.env.ALPACA_SECRET;
	}
	if (originalCreamEnv !== undefined) {
		Bun.env.CREAM_ENV = originalCreamEnv;
	} else {
		delete Bun.env.CREAM_ENV;
	}
});

import type { ETFHoldingsSource, IndexSource, ScreenerSource, StaticSource } from "@cream/config";
import { resolveSource, resolveStaticSource } from "./sources.js";

describe("Source Resolvers", () => {
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

		test("throws for index source", async () => {
			const source: IndexSource = {
				name: "test-index",
				type: "index",
				index_id: "SP500",
				provider: "alpaca",
				point_in_time: false,
				enabled: true,
			};

			await expect(resolveSource(source)).rejects.toThrow(
				'Index source "test-index" is not supported. Use static source with explicit tickers instead.',
			);
		});

		test("throws for etf_holdings source", async () => {
			const source: ETFHoldingsSource = {
				name: "test-etf",
				type: "etf_holdings",
				etf_symbol: "SPY",
				provider: "alpaca",
				min_weight_pct: 0,
				enabled: true,
			};

			await expect(resolveSource(source)).rejects.toThrow(
				'ETF holdings source "test-etf" is not supported. Use static source with explicit tickers instead.',
			);
		});

		test("throws for screener source", async () => {
			const source: ScreenerSource = {
				name: "test-screener",
				type: "screener",
				provider: "alpaca",
				filters: {},
				limit: 100,
				enabled: true,
			};

			await expect(resolveSource(source)).rejects.toThrow(
				'Screener source "test-screener" is not supported. Use static source with explicit tickers instead.',
			);
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
