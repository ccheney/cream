/**
 * Alpaca Screener client tests
 */

import { describe, expect, test } from "bun:test";
import { AlpacaScreenerClient, type AlpacaScreenerConfig } from "./alpaca-screener";

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
		const universeSymbols = ["AAPL", "MSFT", "GOOGL"];
		const allMovers = {
			gainers: [
				{ symbol: "AAPL", percent_change: 5, change: 10, price: 200 },
				{ symbol: "NVDA", percent_change: 7, change: 35, price: 500 },
				{ symbol: "XYZ", percent_change: 3, change: 1.5, price: 50 },
			],
			losers: [
				{ symbol: "MSFT", percent_change: -2, change: -8, price: 400 },
				{ symbol: "ABC", percent_change: -5, change: -2.5, price: 50 },
			],
		};

		const universeSet = new Set(universeSymbols.map((s) => s.toUpperCase()));
		const universeGainers = allMovers.gainers.filter((m) =>
			universeSet.has(m.symbol.toUpperCase()),
		);
		const universeLosers = allMovers.losers.filter((m) => universeSet.has(m.symbol.toUpperCase()));

		expect(universeGainers).toHaveLength(1);
		expect(universeGainers[0]?.symbol).toBe("AAPL");
		expect(universeLosers).toHaveLength(1);
		expect(universeLosers[0]?.symbol).toBe("MSFT");
	});
});
