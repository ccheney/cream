/**
 * Mock Adapter Convenience/Factory/Fixture Tests
 */

import { describe, expect, it } from "bun:test";
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
	mockData,
} from "./mock-adapter";

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
});
