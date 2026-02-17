/**
 * Tests for KalshiClient liquidity score calculation (via fetchMarkets)
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { KalshiClient } from "../client.js";
import { mockGetMarkets, mockKalshiMarket, resetMocks } from "./fixtures.js";

const createClient = () =>
	new KalshiClient({
		apiKeyId: "test-key",
		privateKeyPem: "test-pem",
	});

async function fetchLiquidityScore(overrides: Partial<typeof mockKalshiMarket>): Promise<number> {
	mockGetMarkets.mockImplementation(() =>
		Promise.resolve({
			data: { markets: [{ ...mockKalshiMarket, ...overrides }] },
		}),
	);
	const events = await createClient().fetchMarkets(["FED_RATE"]);
	return events[0]?.payload.liquidityScore ?? 0;
}

beforeEach(() => {
	resetMocks();
});

describe("KalshiClient.calculateLiquidityScore volume and spread", () => {
	it("should calculate high liquidity for high volume tight spread", async () => {
		const liquidityScore = await fetchLiquidityScore({
			volume_24h: 200000,
			yes_bid: 55,
			yes_ask: 56,
		});
		expect(liquidityScore).toBeGreaterThan(0.8);
	});

	it("should calculate low liquidity for low volume wide spread", async () => {
		const liquidityScore = await fetchLiquidityScore({
			volume_24h: 1000,
			yes_bid: 45,
			yes_ask: 55,
		});
		expect(liquidityScore).toBeLessThan(0.2);
	});
});

describe("KalshiClient.calculateLiquidityScore missing fields", () => {
	it("should handle market with no volume", async () => {
		const liquidityScore = await fetchLiquidityScore({
			volume_24h: undefined,
			yes_bid: 55,
			yes_ask: 57,
		});
		expect(liquidityScore).toBeLessThan(0.5);
	});

	it("should handle market with no bid/ask", async () => {
		const liquidityScore = await fetchLiquidityScore({
			volume_24h: 50000,
			yes_bid: undefined,
			yes_ask: undefined,
		});
		expect(liquidityScore).toBe(0.5);
	});
});

describe("KalshiClient.calculateLiquidityScore bounds", () => {
	it("should handle market with zero volume", async () => {
		const liquidityScore = await fetchLiquidityScore({ volume_24h: 0, yes_bid: 50, yes_ask: 52 });
		expect(liquidityScore).toBeDefined();
	});

	it("should cap liquidity score at 1.0", async () => {
		const liquidityScore = await fetchLiquidityScore({
			volume_24h: 500000,
			yes_bid: 50,
			yes_ask: 50,
		});
		expect(liquidityScore).toBe(1);
	});
});
