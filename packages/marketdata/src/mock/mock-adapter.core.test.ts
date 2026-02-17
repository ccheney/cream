/**
 * Mock Adapter Core Tests
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { requireValue } from "@cream/test-utils";
import { MockAdapter } from "./mock-adapter";

let adapter: MockAdapter;

beforeEach(() => {
	adapter = new MockAdapter();
});

describe("MockAdapter Candle Data", () => {
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

		const startTs = requireValue(allCandles[2], "start candle").timestamp;
		const endTs = requireValue(allCandles[5], "end candle").timestamp;

		const filtered = await adapter.getCandlesInRange("AAPL", "1h", startTs, endTs);
		expect(filtered.length).toBeLessThanOrEqual(allCandles.length);
		expect(filtered.every((c) => c.timestamp >= startTs && c.timestamp <= endTs)).toBe(true);
	});

	it("should return recent candles", async () => {
		const recent = await adapter.getRecentCandles("AAPL", "1h", 3);
		expect(recent.length).toBeLessThanOrEqual(3);
	});
});

describe("MockAdapter Quote Data", () => {
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

describe("MockAdapter Trade Data", () => {
	it("should return trades for AAPL", async () => {
		const trades = await adapter.getTrades("AAPL");
		expect(trades.length).toBeGreaterThan(0);
		expect(trades[0]).toHaveProperty("symbol");
		expect(trades[0]).toHaveProperty("timestamp");
		expect(trades[0]).toHaveProperty("price");
		expect(trades[0]).toHaveProperty("size");
	});
});

describe("MockAdapter Account Data", () => {
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

describe("MockAdapter Snapshot Builder", () => {
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
