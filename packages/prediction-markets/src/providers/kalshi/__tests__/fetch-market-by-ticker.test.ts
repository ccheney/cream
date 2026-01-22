/**
 * Tests for KalshiClient.fetchMarketByTicker method
 */

import { beforeEach, describe, expect, it } from "bun:test";
import type { AuthenticationError } from "../../../index.js";
import { KalshiClient } from "../client.js";
import { mockGetMarket, resetMocks, resetToDefaultImplementations } from "./fixtures.js";

describe("KalshiClient.fetchMarketByTicker", () => {
	beforeEach(() => {
		resetMocks();
		resetToDefaultImplementations();
	});

	it("should fetch a specific market by ticker", async () => {
		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		const event = await client.fetchMarketByTicker("KXFED-26JAN29-T50");

		expect(mockGetMarket).toHaveBeenCalledWith("KXFED-26JAN29-T50");
		expect(event).not.toBeNull();
		expect(event?.eventId).toBe("pm_kalshi_KXFED-26JAN29-T50");
		expect(event?.payload.platform).toBe("KALSHI");
		expect(event?.payload.marketTicker).toBe("KXFED-26JAN29-T50");
	});

	it("should return null for invalid market data", async () => {
		mockGetMarket.mockImplementation(() =>
			Promise.resolve({
				data: { market: { invalid: "data" } },
			}),
		);

		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		const event = await client.fetchMarketByTicker("INVALID");
		expect(event).toBeNull();
	});

	it("should throw on API error", async () => {
		mockGetMarket.mockImplementation(() => Promise.reject(new Error("Not found")));

		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		await expect(client.fetchMarketByTicker("NOTFOUND")).rejects.toThrow("Not found");
	});

	it("should throw AuthenticationError on unauthorized", async () => {
		mockGetMarket.mockImplementation(() => Promise.reject(new Error("unauthorized request")));

		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		try {
			await client.fetchMarketByTicker("TEST");
			expect.unreachable("Should have thrown");
		} catch (error) {
			expect((error as AuthenticationError).code).toBe("AUTH_ERROR");
		}
	});
});
