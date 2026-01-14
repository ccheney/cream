/**
 * Backtest Adapter Account Operations Tests
 */

import { describe, expect, test } from "bun:test";
import { createBacktestAdapter } from "../src/adapters/backtest.js";

describe("BacktestAdapter Account operations", () => {
	test("returns account information", async () => {
		const adapter = createBacktestAdapter({ initialCash: 100000 });
		const account = await adapter.getAccount();

		expect(account.id).toBe("backtest-account");
		expect(account.status).toBe("ACTIVE");
		expect(account.currency).toBe("USD");
		expect(account.cash).toBe(100000);
		expect(account.portfolioValue).toBe(100000);
		expect(account.buyingPower).toBe(400000);
		expect(account.shortingEnabled).toBe(true);
	});

	test("market is always open in backtest", async () => {
		const adapter = createBacktestAdapter();
		expect(await adapter.isMarketOpen()).toBe(true);
	});
});
