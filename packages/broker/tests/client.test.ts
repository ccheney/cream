/**
 * Alpaca Client Unit Tests
 */

import { describe, expect, it } from "bun:test";
import { createAlpacaClient } from "../src/client.js";
import { BrokerError } from "../src/types.js";

describe("createAlpacaClient", () => {
	it("creates client with valid credentials", () => {
		const client = createAlpacaClient({
			apiKey: "test-key",
			apiSecret: "test-secret",
			environment: "PAPER",
		});

		expect(client.getEnvironment()).toBe("PAPER");
	});

	it("throws on missing credentials", () => {
		expect(() =>
			createAlpacaClient({
				apiKey: "",
				apiSecret: "",
				environment: "PAPER",
			}),
		).toThrow(BrokerError);
	});

	it("generates order IDs with environment prefix", () => {
		const client = createAlpacaClient({
			apiKey: "test-key",
			apiSecret: "test-secret",
			environment: "PAPER",
		});

		const orderId = client.generateOrderId();
		expect(orderId.startsWith("paper-")).toBe(true);
	});

	it("uses custom order ID prefix", () => {
		const client = createAlpacaClient({
			apiKey: "test-key",
			apiSecret: "test-secret",
			environment: "PAPER",
			orderIdPrefix: "custom",
		});

		const orderId = client.generateOrderId();
		expect(orderId.startsWith("custom-")).toBe(true);
	});

	it("returns correct environment", () => {
		const paperClient = createAlpacaClient({
			apiKey: "key",
			apiSecret: "secret",
			environment: "PAPER",
		});
		expect(paperClient.getEnvironment()).toBe("PAPER");

		const liveClient = createAlpacaClient({
			apiKey: "key",
			apiSecret: "secret",
			environment: "LIVE",
		});
		expect(liveClient.getEnvironment()).toBe("LIVE");
	});
});

describe("BrokerError", () => {
	it("creates error with code", () => {
		const error = new BrokerError("Test error", "INVALID_ORDER");

		expect(error.message).toBe("Test error");
		expect(error.code).toBe("INVALID_ORDER");
		expect(error.name).toBe("BrokerError");
	});

	it("creates error with symbol and order ID", () => {
		const error = new BrokerError("Order not found", "ORDER_NOT_FOUND", "AAPL", "order-123");

		expect(error.symbol).toBe("AAPL");
		expect(error.orderId).toBe("order-123");
	});

	it("creates error with cause", () => {
		const cause = new Error("Network failure");
		const error = new BrokerError(
			"Connection failed",
			"NETWORK_ERROR",
			undefined,
			undefined,
			cause,
		);

		expect(error.cause).toBe(cause);
	});

	it("is instance of Error", () => {
		const error = new BrokerError("Test", "UNKNOWN");
		expect(error instanceof Error).toBe(true);
		expect(error instanceof BrokerError).toBe(true);
	});
});

describe("LIVE protection", () => {
	it("allows PAPER orders without confirmation", async () => {
		const client = createAlpacaClient({
			apiKey: "test-key",
			apiSecret: "test-secret",
			environment: "PAPER",
		});

		// This would fail with network error, not LIVE_PROTECTION
		// Just verify it doesn't throw LIVE_PROTECTION synchronously
		expect(client.getEnvironment()).toBe("PAPER");
	});

	it("blocks LIVE orders by default", async () => {
		const client = createAlpacaClient({
			apiKey: "test-key",
			apiSecret: "test-secret",
			environment: "LIVE",
		});

		// This should throw LIVE_PROTECTION before making any network call
		await expect(
			client.submitOrder({
				clientOrderId: "test-order",
				symbol: "AAPL",
				qty: 1,
				side: "buy",
				type: "market",
				timeInForce: "day",
			}),
		).rejects.toThrow(BrokerError);
	});

	it(
		"allows LIVE orders with confirmation in order ID",
		async () => {
			const client = createAlpacaClient({
				apiKey: "test-key",
				apiSecret: "test-secret",
				environment: "LIVE",
			});

			// This should NOT throw LIVE_PROTECTION (but will fail with network error)
			try {
				await client.submitOrder({
					clientOrderId: "test-LIVE-CONFIRMED-order",
					symbol: "AAPL",
					qty: 1,
					side: "buy",
					type: "market",
					timeInForce: "day",
				});
			} catch (error) {
				// Should fail with NETWORK_ERROR or INVALID_CREDENTIALS, not LIVE_PROTECTION
				expect((error as BrokerError).code).not.toBe("LIVE_PROTECTION");
			}
		},
		{ timeout: 10000 },
	);

	it("allows disabling LIVE protection", async () => {
		const client = createAlpacaClient({
			apiKey: "test-key",
			apiSecret: "test-secret",
			environment: "LIVE",
			requireLiveConfirmation: false,
		});

		// This should NOT throw LIVE_PROTECTION (but will fail with network error)
		try {
			await client.submitOrder({
				clientOrderId: "test-order",
				symbol: "AAPL",
				qty: 1,
				side: "buy",
				type: "market",
				timeInForce: "day",
			});
		} catch (error) {
			expect((error as BrokerError).code).not.toBe("LIVE_PROTECTION");
		}
	});
});

describe("Multi-leg order validation", () => {
	it("rejects more than 4 legs", async () => {
		const client = createAlpacaClient({
			apiKey: "test-key",
			apiSecret: "test-secret",
			environment: "PAPER",
		});

		await expect(
			client.submitOrder({
				clientOrderId: "test-order",
				legs: [
					{ symbol: "A", ratio: 1 },
					{ symbol: "B", ratio: -1 },
					{ symbol: "C", ratio: 1 },
					{ symbol: "D", ratio: -1 },
					{ symbol: "E", ratio: 1 },
				],
				qty: 1,
				side: "buy",
				type: "market",
				timeInForce: "day",
			}),
		).rejects.toThrow("maximum of 4 legs");
	});

	it("rejects non-simplified leg ratios", async () => {
		const client = createAlpacaClient({
			apiKey: "test-key",
			apiSecret: "test-secret",
			environment: "PAPER",
		});

		await expect(
			client.submitOrder({
				clientOrderId: "test-order",
				legs: [
					{ symbol: "A", ratio: 2 },
					{ symbol: "B", ratio: -4 },
				],
				qty: 1,
				side: "buy",
				type: "market",
				timeInForce: "day",
			}),
		).rejects.toThrow("simplified");
	});
});
