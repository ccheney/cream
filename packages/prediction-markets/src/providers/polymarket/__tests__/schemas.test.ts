/**
 * Tests for Polymarket Zod schemas
 */

import { describe, expect, it } from "bun:test";
import {
	ClobOrderbookSchema,
	ClobPriceSchema,
	PolymarketEventSchema,
	PolymarketMarketSchema,
} from "../client.js";

describe("PolymarketMarketSchema", () => {
	it("should parse valid market data", () => {
		const market = {
			id: "0x1234",
			question: "Will there be a recession in 2026?",
			slug: "recession-2026",
			outcomes: ["Yes", "No"],
			outcomePrices: ["0.25", "0.75"],
			volume: "1000000",
			volume24hr: "50000",
			liquidity: "25000",
			active: true,
			closed: false,
			endDate: "2026-12-31T23:59:59Z",
		};

		const result = PolymarketMarketSchema.parse(market);
		expect(result.id).toBe("0x1234");
		expect(result.question).toBe("Will there be a recession in 2026?");
		expect(result.outcomes).toEqual(["Yes", "No"]);
		expect(result.outcomePrices).toEqual(["0.25", "0.75"]);
	});

	it("should handle minimal market data", () => {
		const market = {
			id: "0xabcd",
			question: "Test market?",
		};

		const result = PolymarketMarketSchema.parse(market);
		expect(result.id).toBe("0xabcd");
		expect(result.outcomes).toBeUndefined();
	});
});

describe("PolymarketEventSchema", () => {
	it("should parse valid event data", () => {
		const event = {
			id: "evt_123",
			title: "US Recession 2026",
			slug: "us-recession-2026",
			description: "Will the US enter a recession in 2026?",
			markets: [
				{
					id: "0x1234",
					question: "Will there be a recession?",
				},
			],
			active: true,
		};

		const result = PolymarketEventSchema.parse(event);
		expect(result.id).toBe("evt_123");
		expect(result.title).toBe("US Recession 2026");
		expect(result.markets).toHaveLength(1);
	});

	it("should handle event without markets", () => {
		const event = {
			id: "evt_456",
			title: "Empty event",
		};

		const result = PolymarketEventSchema.parse(event);
		expect(result.id).toBe("evt_456");
		expect(result.markets).toBeUndefined();
	});
});

describe("ClobPriceSchema", () => {
	it("should parse price response", () => {
		const price = {
			price: "0.45",
			side: "buy",
		};

		const result = ClobPriceSchema.parse(price);
		expect(result.price).toBe("0.45");
		expect(result.side).toBe("buy");
	});
});

describe("ClobOrderbookSchema", () => {
	it("should parse orderbook response", () => {
		const orderbook = {
			market: "0x1234",
			asset_id: "0xabcd",
			hash: "0xhash",
			bids: [
				{ price: "0.45", size: "100" },
				{ price: "0.44", size: "200" },
			],
			asks: [
				{ price: "0.46", size: "150" },
				{ price: "0.47", size: "250" },
			],
		};

		const result = ClobOrderbookSchema.parse(orderbook);
		expect(result.bids).toHaveLength(2);
		expect(result.asks).toHaveLength(2);
		expect(result.bids?.[0]?.price).toBe("0.45");
	});
});
