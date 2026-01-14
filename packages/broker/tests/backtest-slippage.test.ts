/**
 * Backtest Adapter Slippage and Commission Tests
 */

import { describe, expect, test } from "bun:test";
import { createBacktestAdapter } from "../src/adapters/backtest.js";
import {
	createBuyOrderRequest,
	createFixedPriceProvider,
	createSellOrderRequest,
} from "./fixtures.js";

describe("BacktestAdapter Slippage and commission", () => {
	describe("Slippage", () => {
		test("applies slippage to buy orders", async () => {
			const adapter = createBacktestAdapter({
				initialCash: 100000,
				slippageBps: 10, // 0.1%
				priceProvider: createFixedPriceProvider(100),
			});

			const order = await adapter.submitOrder(createBuyOrderRequest(adapter, "TEST", 10));

			// Price should be 100 * 1.001 = 100.1
			expect(order.filledAvgPrice).toBeCloseTo(100.1, 2);
		});

		test("applies slippage to sell orders", async () => {
			const adapter = createBacktestAdapter({
				initialCash: 100000,
				slippageBps: 10, // 0.1%
				priceProvider: createFixedPriceProvider(100),
			});

			await adapter.submitOrder(createBuyOrderRequest(adapter, "TEST", 10));

			const sellOrder = await adapter.submitOrder(createSellOrderRequest(adapter, "TEST", 10));

			// Price should be 100 * 0.999 = 99.9
			expect(sellOrder.filledAvgPrice).toBeCloseTo(99.9, 2);
		});
	});

	describe("Commission", () => {
		test("deducts commission from cash", async () => {
			const adapter = createBacktestAdapter({
				initialCash: 10000,
				commission: 5,
				priceProvider: createFixedPriceProvider(100),
			});

			await adapter.submitOrder(createBuyOrderRequest(adapter, "TEST", 10));

			const account = await adapter.getAccount();
			// Initial 10000 - (100 * 10) - 5 commission = 8995
			expect(account.cash).toBe(8995);
		});
	});
});
