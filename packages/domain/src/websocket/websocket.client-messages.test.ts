import { describe, expect, it } from "bun:test";
import {
	ClientMessageSchema,
	PingMessageSchema,
	SubscribeMessageSchema,
	SubscribeSymbolsMessageSchema,
	UnsubscribeMessageSchema,
} from "./index.js";

describe("SubscribeMessage", () => {
	it("validates valid subscribe message", () => {
		const msg = { type: "subscribe", channels: ["quotes", "orders"] };
		expect(SubscribeMessageSchema.safeParse(msg).success).toBe(true);
	});

	it("rejects empty or invalid channels", () => {
		expect(SubscribeMessageSchema.safeParse({ type: "subscribe", channels: [] }).success).toBe(
			false,
		);
		expect(
			SubscribeMessageSchema.safeParse({ type: "subscribe", channels: ["invalid_channel"] })
				.success,
		).toBe(false);
	});
});

describe("UnsubscribeMessage", () => {
	it("validates valid unsubscribe message", () => {
		const msg = { type: "unsubscribe", channels: ["quotes"] };
		expect(UnsubscribeMessageSchema.safeParse(msg).success).toBe(true);
	});
});

describe("SubscribeSymbolsMessage", () => {
	it("validates valid symbol subscription", () => {
		const msg = { type: "subscribe_symbols", symbols: ["AAPL", "MSFT"] };
		expect(SubscribeSymbolsMessageSchema.safeParse(msg).success).toBe(true);
	});

	it("rejects too many or invalid symbols", () => {
		const symbols = Array.from({ length: 101 }, (_, index) => `SYM${index}`);
		expect(
			SubscribeSymbolsMessageSchema.safeParse({ type: "subscribe_symbols", symbols }).success,
		).toBe(false);
		expect(
			SubscribeSymbolsMessageSchema.safeParse({ type: "subscribe_symbols", symbols: [""] }).success,
		).toBe(false);
	});
});

describe("PingMessage", () => {
	it("validates ping message", () => {
		expect(PingMessageSchema.safeParse({ type: "ping" }).success).toBe(true);
	});
});

describe("ClientMessage discriminated union", () => {
	it("parses subscribe and ping messages", () => {
		const subscribeResult = ClientMessageSchema.safeParse({
			type: "subscribe",
			channels: ["quotes"],
		});
		expect(subscribeResult.success).toBe(true);
		if (subscribeResult.success) {
			expect(subscribeResult.data.type).toBe("subscribe");
		}

		const pingResult = ClientMessageSchema.safeParse({ type: "ping" });
		expect(pingResult.success).toBe(true);
	});

	it("rejects unknown message type", () => {
		expect(ClientMessageSchema.safeParse({ type: "unknown" }).success).toBe(false);
	});
});
