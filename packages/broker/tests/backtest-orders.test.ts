/**
 * Backtest Adapter Order Operations Tests
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBacktestAdapter } from "../src/adapters/backtest.js";
import {
	type BacktestAdapter,
	createBuyOrderRequest,
	createSellOrderRequest,
	createStandardPriceProvider,
} from "./fixtures.js";

describe("BacktestAdapter Order operations", () => {
	let adapter: BacktestAdapter;

	beforeEach(() => {
		adapter = createBacktestAdapter({
			initialCash: 100000,
			fillMode: "immediate",
			priceProvider: createStandardPriceProvider(),
		});
	});

	describe("Market orders", () => {
		test("submits and fills market buy order immediately", async () => {
			const order = await adapter.submitOrder(createBuyOrderRequest(adapter, "AAPL", 10));

			expect(order.status).toBe("filled");
			expect(order.filledQty).toBe(10);
			expect(order.filledAvgPrice).toBe(150);
		});

		test("creates position after buy order", async () => {
			await adapter.submitOrder(createBuyOrderRequest(adapter, "AAPL", 10));

			const position = await adapter.getPosition("AAPL");
			expect(position).not.toBeNull();
			expect(position?.qty).toBe(10);
			expect(position?.side).toBe("long");
			expect(position?.avgEntryPrice).toBe(150);
		});

		test("updates position on additional buy", async () => {
			await adapter.submitOrder(createBuyOrderRequest(adapter, "AAPL", 10));
			await adapter.submitOrder(createBuyOrderRequest(adapter, "AAPL", 10));

			const position = await adapter.getPosition("AAPL");
			expect(position?.qty).toBe(20);
		});

		test("closes position on sell order", async () => {
			await adapter.submitOrder(createBuyOrderRequest(adapter, "AAPL", 10));
			await adapter.submitOrder(createSellOrderRequest(adapter, "AAPL", 10));

			const position = await adapter.getPosition("AAPL");
			expect(position).toBeNull();
		});

		test("rejects sell order without position", async () => {
			const order = await adapter.submitOrder(createSellOrderRequest(adapter, "AAPL", 10));
			expect(order.status).toBe("rejected");
		});

		test("rejects buy order with insufficient funds", async () => {
			const lowCashAdapter = createBacktestAdapter({
				initialCash: 100,
				priceProvider: () => 150,
			});

			const order = await lowCashAdapter.submitOrder(
				createBuyOrderRequest(lowCashAdapter, "AAPL", 10)
			);
			expect(order.status).toBe("rejected");
		});
	});

	describe("Limit orders", () => {
		test("submits and fills limit buy order immediately", async () => {
			const order = await adapter.submitOrder(
				createBuyOrderRequest(adapter, "AAPL", 5, "limit", { limitPrice: 155 })
			);

			expect(order.status).toBe("filled");
			expect(order.filledQty).toBe(5);
		});
	});

	describe("Stop orders", () => {
		test("stop orders are accepted but not filled in immediate mode", async () => {
			const order = await adapter.submitOrder(
				createBuyOrderRequest(adapter, "AAPL", 10, "stop", { stopPrice: 145 })
			);

			expect(order.status).toBe("accepted");
			expect(order.filledQty).toBe(0);
		});

		test("stop_limit orders are accepted but not filled in immediate mode", async () => {
			const order = await adapter.submitOrder(
				createBuyOrderRequest(adapter, "AAPL", 10, "stop_limit", {
					stopPrice: 145,
					limitPrice: 146,
				})
			);

			expect(order.status).toBe("accepted");
			expect(order.filledQty).toBe(0);
		});
	});

	describe("Order cancellation", () => {
		test("cancels pending order", async () => {
			const delayedAdapter = createBacktestAdapter({ fillMode: "delayed" });

			const order = await delayedAdapter.submitOrder(
				createBuyOrderRequest(delayedAdapter, "AAPL", 10)
			);
			expect(order.status).toBe("accepted");

			await delayedAdapter.cancelOrder(order.id);
			const canceledOrder = await delayedAdapter.getOrder(order.id);
			expect(canceledOrder?.status).toBe("canceled");
		});

		test("cancels order by client order ID", async () => {
			const delayedAdapter = createBacktestAdapter({ fillMode: "delayed" });
			const clientOrderId = delayedAdapter.generateOrderId();

			await delayedAdapter.submitOrder({
				clientOrderId,
				symbol: "AAPL",
				qty: 10,
				side: "buy",
				type: "market",
				timeInForce: "day",
			});

			await delayedAdapter.cancelOrder(clientOrderId);
			const order = await delayedAdapter.getOrder(clientOrderId);
			expect(order?.status).toBe("canceled");
		});

		test("throws when canceling non-existent order", async () => {
			await expect(adapter.cancelOrder("non-existent-order")).rejects.toThrow("Order not found");
		});

		test("throws when canceling already filled order", async () => {
			const order = await adapter.submitOrder(createBuyOrderRequest(adapter, "AAPL", 10));
			expect(order.status).toBe("filled");

			await expect(adapter.cancelOrder(order.id)).rejects.toThrow("Cannot cancel completed order");
		});
	});

	describe("Order retrieval", () => {
		test("gets order by ID", async () => {
			const order = await adapter.submitOrder(createBuyOrderRequest(adapter, "AAPL", 10));

			const fetched = await adapter.getOrder(order.id);
			expect(fetched).not.toBeNull();
			expect(fetched?.id).toBe(order.id);
		});

		test("gets order by client order ID", async () => {
			const clientOrderId = adapter.generateOrderId();
			await adapter.submitOrder({
				clientOrderId,
				symbol: "AAPL",
				qty: 10,
				side: "buy",
				type: "market",
				timeInForce: "day",
			});

			const fetched = await adapter.getOrder(clientOrderId);
			expect(fetched).not.toBeNull();
			expect(fetched?.clientOrderId).toBe(clientOrderId);
		});

		test("returns null for non-existent order", async () => {
			const order = await adapter.getOrder("non-existent");
			expect(order).toBeNull();
		});

		test("getOrder finds by clientOrderId when not found by ID", async () => {
			const clientOrderId = adapter.generateOrderId();
			await adapter.submitOrder({
				clientOrderId,
				symbol: "AAPL",
				qty: 10,
				side: "buy",
				type: "market",
				timeInForce: "day",
			});

			const order = await adapter.getOrder(clientOrderId);
			expect(order).not.toBeNull();
			expect(order?.clientOrderId).toBe(clientOrderId);
		});
	});

	describe("Order listing", () => {
		test("lists open orders", async () => {
			const delayedAdapter = createBacktestAdapter({ fillMode: "delayed" });

			await delayedAdapter.submitOrder(createBuyOrderRequest(delayedAdapter, "AAPL", 10));

			const openOrders = await delayedAdapter.getOrders("open");
			expect(openOrders.length).toBe(1);
		});

		test("lists closed orders", async () => {
			await adapter.submitOrder(createBuyOrderRequest(adapter, "AAPL", 10));

			const closedOrders = await adapter.getOrders("closed");
			expect(closedOrders.length).toBe(1);
			expect(closedOrders[0]?.status).toBe("filled");
		});

		test("lists all orders", async () => {
			await adapter.submitOrder(createBuyOrderRequest(adapter, "AAPL", 10));
			await adapter.submitOrder(
				createBuyOrderRequest(adapter, "GOOGL", 5, "stop", { stopPrice: 130 })
			);

			const allOrders = await adapter.getOrders("all");
			expect(allOrders.length).toBe(2);
		});
	});

	describe("Multi-leg orders", () => {
		test("handles multi-leg orders using legs array", async () => {
			const order = await adapter.submitOrder({
				clientOrderId: adapter.generateOrderId(),
				legs: [{ symbol: "AAPL", ratio: 1 }],
				qty: 10,
				side: "buy",
				type: "market",
				timeInForce: "day",
			});

			expect(order.symbol).toBe("AAPL");
		});
	});

	describe("Price provider edge cases", () => {
		test("uses default price when priceProvider returns undefined", async () => {
			const undefinedPriceAdapter = createBacktestAdapter({
				initialCash: 100000,
				priceProvider: () => undefined,
			});

			const order = await undefinedPriceAdapter.submitOrder(
				createBuyOrderRequest(undefinedPriceAdapter, "UNKNOWN", 10)
			);

			expect(order.filledAvgPrice).toBe(100);
		});
	});
});
