/**
 * Tests for WebSocket message schemas
 */

import { describe, expect, it } from "bun:test";
import {
	MarketLifecycleMessageSchema,
	OrderbookDeltaMessageSchema,
	SubscribeCommandSchema,
	TickerMessageSchema,
	TradeMessageSchema,
	UnsubscribeCommandSchema,
} from "../index.js";

describe("SubscribeCommandSchema", () => {
	it("should validate subscribe command", () => {
		const command = {
			id: 1704067200000,
			cmd: "subscribe",
			params: {
				channels: ["ticker", "orderbook_delta"],
				market_tickers: ["KXFED-26JAN29"],
			},
		};

		const result = SubscribeCommandSchema.safeParse(command);
		expect(result.success).toBe(true);
	});

	it("should allow subscribe without market_tickers", () => {
		const command = {
			id: 1,
			cmd: "subscribe",
			params: {
				channels: ["trade"],
			},
		};

		const result = SubscribeCommandSchema.safeParse(command);
		expect(result.success).toBe(true);
	});
});

describe("UnsubscribeCommandSchema", () => {
	it("should validate unsubscribe command", () => {
		const command = {
			id: 2,
			cmd: "unsubscribe",
			params: {
				channels: ["ticker"],
				market_tickers: ["KXFED-26JAN29"],
			},
		};

		const result = UnsubscribeCommandSchema.safeParse(command);
		expect(result.success).toBe(true);
	});
});

describe("TickerMessageSchema", () => {
	it("should validate ticker message", () => {
		const message = {
			type: "ticker",
			msg: {
				market_ticker: "KXFED-26JAN29",
				yes_bid: 0.55,
				yes_ask: 0.57,
				no_bid: 0.43,
				no_ask: 0.45,
				last_price: 0.56,
				volume: 10000,
				open_interest: 5000,
				timestamp: "2026-01-06T12:00:00Z",
			},
		};

		const result = TickerMessageSchema.safeParse(message);
		expect(result.success).toBe(true);
	});

	it("should allow partial ticker message", () => {
		const message = {
			type: "ticker",
			msg: {
				market_ticker: "KXFED-26JAN29",
				last_price: 0.56,
				timestamp: "2026-01-06T12:00:00Z",
			},
		};

		const result = TickerMessageSchema.safeParse(message);
		expect(result.success).toBe(true);
	});
});

describe("OrderbookDeltaMessageSchema", () => {
	it("should validate orderbook delta message", () => {
		const message = {
			type: "orderbook_delta",
			msg: {
				market_ticker: "KXFED-26JAN29",
				side: "yes",
				price: 0.55,
				delta: 100,
				timestamp: "2026-01-06T12:00:00Z",
			},
		};

		const result = OrderbookDeltaMessageSchema.safeParse(message);
		expect(result.success).toBe(true);
	});
});

describe("TradeMessageSchema", () => {
	it("should validate trade message", () => {
		const message = {
			type: "trade",
			msg: {
				trade_id: "trade123",
				market_ticker: "KXFED-26JAN29",
				side: "yes",
				count: 10,
				yes_price: 0.56,
				no_price: 0.44,
				taker_side: "yes",
				timestamp: "2026-01-06T12:00:00Z",
			},
		};

		const result = TradeMessageSchema.safeParse(message);
		expect(result.success).toBe(true);
	});
});

describe("MarketLifecycleMessageSchema", () => {
	it("should validate market lifecycle message", () => {
		const message = {
			type: "market_lifecycle_v2",
			msg: {
				market_ticker: "KXFED-26JAN29",
				status: "active",
				timestamp: "2026-01-06T12:00:00Z",
			},
		};

		const result = MarketLifecycleMessageSchema.safeParse(message);
		expect(result.success).toBe(true);
	});
});
