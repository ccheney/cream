import { describe, expect, test } from "bun:test";

import { compareFillModels, type FillRecord } from "../parity";

describe("compareFillModels", () => {
	test("returns high match score for similar fills", () => {
		const researchFills: FillRecord[] = [
			{
				orderId: "order-1",
				symbol: "AAPL",
				side: "buy",
				requestedQty: 100,
				filledQty: 100,
				requestedPrice: 150,
				fillPrice: 150.05,
				orderType: "limit",
				slippageBps: 3,
			},
		];
		const liveFills: FillRecord[] = [
			{
				orderId: "order-1",
				symbol: "AAPL",
				side: "buy",
				requestedQty: 100,
				filledQty: 100,
				requestedPrice: 150,
				fillPrice: 150.08,
				orderType: "limit",
				slippageBps: 5,
			},
		];

		const result = compareFillModels(researchFills, liveFills);

		expect(result.matchScore).toBeGreaterThanOrEqual(0.8);
		expect(result.totalFills).toBe(1);
		expect(result.matchedFills).toBe(1);
	});
});

describe("compareFillModels", () => {
	test("detects slippage discrepancies", () => {
		const researchFills: FillRecord[] = [
			{
				orderId: "order-1",
				symbol: "AAPL",
				side: "buy",
				requestedQty: 100,
				filledQty: 100,
				orderType: "market",
				slippageBps: 2,
			},
		];
		const liveFills: FillRecord[] = [
			{
				orderId: "order-1",
				symbol: "AAPL",
				side: "buy",
				requestedQty: 100,
				filledQty: 100,
				orderType: "market",
				slippageBps: 50,
			},
		];

		const result = compareFillModels(researchFills, liveFills);

		expect(result.discrepancies.length).toBeGreaterThan(0);
		expect(result.stats.avgSlippageLive).toBeGreaterThan(result.stats.avgSlippageResearch);
	});
});

describe("compareFillModels", () => {
	test("calculates fill rates correctly", () => {
		const researchFills: FillRecord[] = [
			{
				orderId: "1",
				symbol: "AAPL",
				side: "buy",
				requestedQty: 100,
				filledQty: 100,
				orderType: "limit",
			},
			{
				orderId: "2",
				symbol: "AAPL",
				side: "buy",
				requestedQty: 100,
				filledQty: 0,
				orderType: "limit",
			},
		];
		const liveFills: FillRecord[] = [
			{
				orderId: "1",
				symbol: "AAPL",
				side: "buy",
				requestedQty: 100,
				filledQty: 100,
				orderType: "limit",
			},
			{
				orderId: "2",
				symbol: "AAPL",
				side: "buy",
				requestedQty: 100,
				filledQty: 100,
				orderType: "limit",
			},
		];

		const result = compareFillModels(researchFills, liveFills);

		expect(result.stats.fillRateResearch).toBe(0.5);
		expect(result.stats.fillRateLive).toBe(1);
	});
});
