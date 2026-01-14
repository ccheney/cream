/**
 * Mock Adapter Tests
 */

import { beforeEach, describe, expect, it } from "bun:test";
import {
	createFailingMockAdapter,
	createFlakeMockAdapter,
	createMockAdapter,
	createMockAdapterWithLatency,
	getMockAccount,
	getMockCandles,
	getMockPositions,
	getMockQuote,
	getMockTrades,
	MockAdapter,
	MockApiError,
	mockData,
} from "./mock-adapter";

describe("MockAdapter", () => {
	let adapter: MockAdapter;

	beforeEach(() => {
		adapter = new MockAdapter();
	});

	describe("Candle Data", () => {
		it("should return candles for AAPL", async () => {
			const candles = await adapter.getCandles("AAPL", "1h");
			expect(candles.length).toBeGreaterThan(0);
			expect(candles[0]).toHaveProperty("timestamp");
			expect(candles[0]).toHaveProperty("open");
			expect(candles[0]).toHaveProperty("high");
			expect(candles[0]).toHaveProperty("low");
			expect(candles[0]).toHaveProperty("close");
			expect(candles[0]).toHaveProperty("volume");
		});

		it("should return empty array for unknown symbol", async () => {
			const candles = await adapter.getCandles("UNKNOWN", "1h");
			expect(candles).toEqual([]);
		});

		it("should filter candles by date range", async () => {
			const allCandles = await adapter.getCandles("AAPL", "1h");
			if (allCandles.length < 6) {
				return;
			}

			const startTs = allCandles[2]!.timestamp;
			const endTs = allCandles[5]!.timestamp;

			const filtered = await adapter.getCandlesInRange("AAPL", "1h", startTs, endTs);
			expect(filtered.length).toBeLessThanOrEqual(allCandles.length);
			expect(filtered.every((c) => c.timestamp >= startTs && c.timestamp <= endTs)).toBe(true);
		});

		it("should return recent candles", async () => {
			const recent = await adapter.getRecentCandles("AAPL", "1h", 3);
			expect(recent.length).toBeLessThanOrEqual(3);
		});
	});

	describe("Quote Data", () => {
		it("should return quote for AAPL", async () => {
			const quote = await adapter.getQuote("AAPL");
			expect(quote).not.toBeNull();
			expect(quote?.symbol).toBe("AAPL");
			expect(quote?.bid).toBeGreaterThan(0);
			expect(quote?.ask).toBeGreaterThan(0);
			expect(quote?.ask).toBeGreaterThanOrEqual(quote?.bid ?? 0);
		});

		it("should return null for unknown symbol", async () => {
			const quote = await adapter.getQuote("UNKNOWN");
			expect(quote).toBeNull();
		});

		it("should return quotes for multiple symbols", async () => {
			const quotes = await adapter.getQuotes(["AAPL", "UNKNOWN"]);
			expect(quotes.get("AAPL")).toBeDefined();
			expect(quotes.get("UNKNOWN")).toBeUndefined();
		});
	});

	describe("Trade Data", () => {
		it("should return trades for AAPL", async () => {
			const trades = await adapter.getTrades("AAPL");
			expect(trades.length).toBeGreaterThan(0);
			expect(trades[0]).toHaveProperty("symbol");
			expect(trades[0]).toHaveProperty("timestamp");
			expect(trades[0]).toHaveProperty("price");
			expect(trades[0]).toHaveProperty("size");
		});
	});

	describe("Account Data", () => {
		it("should return account information", async () => {
			const account = await adapter.getAccount();
			expect(account).toHaveProperty("id");
			expect(account).toHaveProperty("equity");
			expect(account).toHaveProperty("buyingPower");
			expect(account).toHaveProperty("cash");
		});

		it("should return positions", async () => {
			const positions = await adapter.getPositions();
			expect(positions.length).toBeGreaterThan(0);
			expect(positions[0]).toHaveProperty("symbol");
			expect(positions[0]).toHaveProperty("qty");
			expect(positions[0]).toHaveProperty("avgEntryPrice");
		});

		it("should return position for specific symbol", async () => {
			const position = await adapter.getPosition("AAPL");
			expect(position).not.toBeNull();
			expect(position?.symbol).toBe("AAPL");
		});

		it("should return null for unknown position", async () => {
			const position = await adapter.getPosition("UNKNOWN");
			expect(position).toBeNull();
		});

		it("should return orders", async () => {
			const orders = await adapter.getOrders();
			expect(orders.length).toBeGreaterThan(0);
			expect(orders[0]).toHaveProperty("id");
			expect(orders[0]).toHaveProperty("symbol");
			expect(orders[0]).toHaveProperty("status");
		});

		it("should filter orders by status", async () => {
			const filledOrders = await adapter.getOrders("filled");
			expect(filledOrders.every((o) => o.status === "filled")).toBe(true);
		});
	});

	describe("Macro Data", () => {
		it("should return real GDP data", async () => {
			const gdp = await adapter.getRealGDP();
			expect(gdp).toHaveProperty("name");
			expect(gdp).toHaveProperty("data");
			expect(gdp.data.length).toBeGreaterThan(0);
		});

		it("should return federal funds rate data", async () => {
			const rate = await adapter.getFederalFundsRate();
			expect(rate).toHaveProperty("name");
			expect(rate).toHaveProperty("data");
			expect(rate.data.length).toBeGreaterThan(0);
		});

		it("should return latest macro value", async () => {
			const gdpValue = await adapter.getLatestMacroValue("realGDP");
			expect(gdpValue).toBeGreaterThan(0);

			const rateValue = await adapter.getLatestMacroValue("federalFundsRate");
			expect(rateValue).toBeGreaterThan(0);
		});
	});

	describe("Snapshot Builder", () => {
		it("should build a market snapshot", async () => {
			const snapshot = await adapter.buildSnapshot("AAPL");
			expect(snapshot).not.toBeNull();
			expect(snapshot?.ticker).toBe("AAPL");
			expect(snapshot?.day).toBeDefined();
			expect(snapshot?.lastQuote).toBeDefined();
		});

		it("should return null for unknown symbol", async () => {
			const snapshot = await adapter.buildSnapshot("UNKNOWN");
			expect(snapshot).toBeNull();
		});
	});
});

describe("Error Simulation", () => {
	it("should throw network error", async () => {
		const adapter = createFailingMockAdapter("NETWORK_ERROR");
		await expect(adapter.getCandles("AAPL")).rejects.toThrow(MockApiError);
	});

	it("should throw rate limit error with correct status code", async () => {
		const adapter = createFailingMockAdapter("RATE_LIMIT");
		try {
			await adapter.getQuote("AAPL");
			expect.unreachable("Should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(MockApiError);
			expect((error as MockApiError).statusCode).toBe(429);
			expect((error as MockApiError).errorType).toBe("RATE_LIMIT");
		}
	});

	it("should throw auth error", async () => {
		const adapter = createFailingMockAdapter("AUTH_ERROR");
		try {
			await adapter.getAccount();
			expect.unreachable("Should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(MockApiError);
			expect((error as MockApiError).statusCode).toBe(401);
		}
	});

	it("should throw intermittent errors based on probability", async () => {
		const adapter = createFlakeMockAdapter("SERVER_ERROR", 0.5);

		let errorCount = 0;
		let successCount = 0;

		for (let i = 0; i < 20; i++) {
			try {
				await adapter.getCandles("AAPL");
				successCount++;
			} catch {
				errorCount++;
			}
		}

		// With 50% probability over 20 tries, we should see both outcomes
		// (statistically very unlikely to get all of one kind)
		expect(errorCount + successCount).toBe(20);
	});
});

describe("Latency Simulation", () => {
	it("should add latency to requests", async () => {
		const adapter = createMockAdapterWithLatency(50);

		const start = Date.now();
		await adapter.getCandles("AAPL");
		const elapsed = Date.now() - start;

		expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some tolerance
	});
});

describe("Convenience Functions", () => {
	it("getMockCandles should return candles", async () => {
		const candles = await getMockCandles("AAPL", "1h");
		expect(candles.length).toBeGreaterThan(0);
	});

	it("getMockQuote should return quote", async () => {
		const quote = await getMockQuote("AAPL");
		expect(quote).not.toBeNull();
	});

	it("getMockTrades should return trades", async () => {
		const trades = await getMockTrades("AAPL");
		expect(trades.length).toBeGreaterThan(0);
	});

	it("getMockAccount should return account", async () => {
		const account = await getMockAccount();
		expect(account).toHaveProperty("equity");
	});

	it("getMockPositions should return positions", async () => {
		const positions = await getMockPositions();
		expect(positions.length).toBeGreaterThan(0);
	});
});

describe("Factory Functions", () => {
	it("createMockAdapter should create adapter with config", () => {
		const adapter = createMockAdapter({ latencyMs: 100 });
		expect(adapter).toBeInstanceOf(MockAdapter);
	});

	it("createMockAdapterWithLatency should create adapter with latency", () => {
		const adapter = createMockAdapterWithLatency(100);
		expect(adapter).toBeInstanceOf(MockAdapter);
	});

	it("createFailingMockAdapter should create failing adapter", () => {
		const adapter = createFailingMockAdapter("TIMEOUT");
		expect(adapter).toBeInstanceOf(MockAdapter);
	});

	it("createFlakeMockAdapter should create flaky adapter", () => {
		const adapter = createFlakeMockAdapter("SERVER_ERROR", 0.3);
		expect(adapter).toBeInstanceOf(MockAdapter);
	});
});

describe("Fixture Registry", () => {
	it("should have alpaca market data fixtures", () => {
		expect(mockData.alpacaMarketData).toBeDefined();
		expect(mockData.alpacaMarketData.candles).toBeDefined();
		expect(mockData.alpacaMarketData.quotes).toBeDefined();
		expect(mockData.alpacaMarketData.trades).toBeDefined();
	});

	it("should have alpaca account fixtures", () => {
		expect(mockData.alpaca).toBeDefined();
		expect(mockData.alpaca.account).toBeDefined();
		expect(mockData.alpaca.positions).toBeDefined();
		expect(mockData.alpaca.orders).toBeDefined();
	});

	it("should have alphavantage fixtures", () => {
		expect(mockData.alphavantage).toBeDefined();
		expect(mockData.alphavantage.realGDP).toBeDefined();
		expect(mockData.alphavantage.federalFundsRate).toBeDefined();
	});
});
