/**
 * Shared test fixtures for backtest adapter tests
 */

import type { createBacktestAdapter } from "../src/adapters/backtest.js";

export type BacktestAdapter = ReturnType<typeof createBacktestAdapter>;

/**
 * Standard price provider for tests with common symbols
 */
export function createStandardPriceProvider(): (symbol: string) => number | undefined {
	const prices: Record<string, number> = {
		AAPL: 150,
		MSFT: 400,
		GOOGL: 140,
		TEST: 100,
	};
	return (symbol: string) => prices[symbol];
}

/**
 * Fixed price provider that always returns the same price
 */
export function createFixedPriceProvider(price: number): () => number {
	return () => price;
}

/**
 * Symbol-based price provider for specific symbol pricing
 */
export function createSymbolPriceProvider(
	prices: Record<string, number>
): (symbol: string) => number | undefined {
	return (symbol: string) => prices[symbol];
}

/**
 * Default adapter configuration for order tests
 */
export const DEFAULT_ORDER_TEST_CONFIG = {
	initialCash: 100000,
	fillMode: "immediate" as const,
};

/**
 * Create a standard buy order request
 */
export function createBuyOrderRequest(
	adapter: BacktestAdapter,
	symbol: string,
	qty: number,
	type: "market" | "limit" | "stop" | "stop_limit" = "market",
	options: { limitPrice?: number; stopPrice?: number } = {}
): Parameters<BacktestAdapter["submitOrder"]>[0] {
	return {
		clientOrderId: adapter.generateOrderId(),
		symbol,
		qty,
		side: "buy",
		type,
		timeInForce: "day",
		...options,
	};
}

/**
 * Create a standard sell order request
 */
export function createSellOrderRequest(
	adapter: BacktestAdapter,
	symbol: string,
	qty: number,
	type: "market" | "limit" | "stop" | "stop_limit" = "market",
	options: { limitPrice?: number; stopPrice?: number } = {}
): Parameters<BacktestAdapter["submitOrder"]>[0] {
	return {
		clientOrderId: adapter.generateOrderId(),
		symbol,
		qty,
		side: "sell",
		type,
		timeInForce: "day",
		...options,
	};
}
