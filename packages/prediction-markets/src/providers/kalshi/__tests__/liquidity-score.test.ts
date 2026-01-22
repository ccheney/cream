/**
 * Tests for KalshiClient liquidity score calculation (via fetchMarkets)
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { KalshiClient } from "../client.js";
import { mockGetMarkets, mockKalshiMarket, resetMocks } from "./fixtures.js";

describe("KalshiClient calculateLiquidityScore", () => {
	beforeEach(() => {
		resetMocks();
	});

	it("should calculate high liquidity for high volume tight spread", async () => {
		const highLiquidityMarket = {
			...mockKalshiMarket,
			volume_24h: 200000,
			yes_bid: 55,
			yes_ask: 56,
		};

		mockGetMarkets.mockImplementation(() =>
			Promise.resolve({
				data: { markets: [highLiquidityMarket] },
			}),
		);

		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		const events = await client.fetchMarkets(["FED_RATE"]);
		const liquidityScore = events[0]?.payload.liquidityScore ?? 0;
		expect(liquidityScore).toBeGreaterThan(0.8);
	});

	it("should calculate low liquidity for low volume wide spread", async () => {
		const lowLiquidityMarket = {
			...mockKalshiMarket,
			volume_24h: 1000,
			yes_bid: 45,
			yes_ask: 55,
		};

		mockGetMarkets.mockImplementation(() =>
			Promise.resolve({
				data: { markets: [lowLiquidityMarket] },
			}),
		);

		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		const events = await client.fetchMarkets(["FED_RATE"]);
		const liquidityScore = events[0]?.payload.liquidityScore ?? 0;
		expect(liquidityScore).toBeLessThan(0.2);
	});

	it("should handle market with no volume", async () => {
		const noVolumeMarket = {
			...mockKalshiMarket,
			volume_24h: undefined,
			yes_bid: 55,
			yes_ask: 57,
		};

		mockGetMarkets.mockImplementation(() =>
			Promise.resolve({
				data: { markets: [noVolumeMarket] },
			}),
		);

		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		const events = await client.fetchMarkets(["FED_RATE"]);
		expect(events[0]?.payload.liquidityScore).toBeDefined();
		expect(events[0]?.payload.liquidityScore).toBeLessThan(0.5);
	});

	it("should handle market with zero volume", async () => {
		const zeroVolumeMarket = {
			...mockKalshiMarket,
			volume_24h: 0,
			yes_bid: 50,
			yes_ask: 52,
		};

		mockGetMarkets.mockImplementation(() =>
			Promise.resolve({
				data: { markets: [zeroVolumeMarket] },
			}),
		);

		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		const events = await client.fetchMarkets(["FED_RATE"]);
		expect(events[0]?.payload.liquidityScore).toBeDefined();
	});

	it("should handle market with no bid/ask", async () => {
		const noBidAskMarket = {
			...mockKalshiMarket,
			volume_24h: 50000,
			yes_bid: undefined,
			yes_ask: undefined,
		};

		mockGetMarkets.mockImplementation(() =>
			Promise.resolve({
				data: { markets: [noBidAskMarket] },
			}),
		);

		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		const events = await client.fetchMarkets(["FED_RATE"]);
		expect(events[0]?.payload.liquidityScore).toBeDefined();
		expect(events[0]?.payload.liquidityScore).toBe(0.5);
	});

	it("should cap liquidity score at 1.0", async () => {
		const superLiquidMarket = {
			...mockKalshiMarket,
			volume_24h: 500000,
			yes_bid: 50,
			yes_ask: 50,
		};

		mockGetMarkets.mockImplementation(() =>
			Promise.resolve({
				data: { markets: [superLiquidMarket] },
			}),
		);

		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		const events = await client.fetchMarkets(["FED_RATE"]);
		expect(events[0]?.payload.liquidityScore).toBe(1);
	});
});
