import { describe, expect, it } from "bun:test";
import { OrderDataSchema, QuoteDataSchema } from "./index.js";

describe("QuoteData", () => {
	it("validates complete quote data", () => {
		const data = {
			symbol: "AAPL",
			bid: 185,
			ask: 185.05,
			last: 185.02,
			bidSize: 100,
			askSize: 200,
			volume: 1000000,
			prevClose: 184,
			changePercent: 0.55,
			timestamp: "2026-01-04T14:00:00Z",
		};
		expect(QuoteDataSchema.safeParse(data).success).toBe(true);
	});

	it("validates minimal quote data", () => {
		const data = {
			symbol: "AAPL",
			bid: 185,
			ask: 185.05,
			last: 185.02,
			volume: 1000000,
			timestamp: "2026-01-04T14:00:00Z",
		};
		expect(QuoteDataSchema.safeParse(data).success).toBe(true);
	});

	it("rejects empty symbol", () => {
		const data = {
			symbol: "",
			bid: 185,
			ask: 185.05,
			last: 185.02,
			volume: 1000000,
			timestamp: "2026-01-04T14:00:00Z",
		};
		expect(QuoteDataSchema.safeParse(data).success).toBe(false);
	});
});

describe("OrderData", () => {
	it("validates complete order data", () => {
		const data = {
			id: "550e8400-e29b-41d4-a716-446655440000",
			clientOrderId: "client-123",
			symbol: "AAPL",
			side: "buy",
			orderType: "limit",
			status: "filled",
			quantity: 100,
			filledQty: 100,
			remainingQty: 0,
			limitPrice: 185,
			avgPrice: 184.98,
			timeInForce: "day",
			timestamp: "2026-01-04T14:00:00Z",
		};
		expect(OrderDataSchema.safeParse(data).success).toBe(true);
	});

	it("rejects negative quantity", () => {
		const data = {
			id: "550e8400-e29b-41d4-a716-446655440000",
			symbol: "AAPL",
			side: "buy",
			orderType: "market",
			status: "pending",
			quantity: -10,
			filledQty: 0,
			timestamp: "2026-01-04T14:00:00Z",
		};
		expect(OrderDataSchema.safeParse(data).success).toBe(false);
	});
});
