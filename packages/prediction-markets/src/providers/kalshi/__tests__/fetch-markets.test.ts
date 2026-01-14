/**
 * Tests for KalshiClient.fetchMarkets method
 */

import { beforeEach, describe, expect, it } from "bun:test";
import type { AuthenticationError, RateLimitError } from "../../../index.js";
import { KalshiClient } from "../client.js";
import {
	mockGetMarkets,
	mockKalshiMarket,
	resetMocks,
	resetToDefaultImplementations,
} from "./fixtures.js";

describe("KalshiClient.fetchMarkets", () => {
	beforeEach(() => {
		resetMocks();
		resetToDefaultImplementations();
	});

	it("should fetch markets for FED_RATE market type", async () => {
		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		const events = await client.fetchMarkets(["FED_RATE"]);

		expect(mockGetMarkets).toHaveBeenCalled();
		expect(events.length).toBeGreaterThan(0);
	});

	it("should fetch markets for multiple market types", async () => {
		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		const _events = await client.fetchMarkets(["FED_RATE", "RECESSION"]);

		expect(mockGetMarkets.mock.calls.length).toBeGreaterThanOrEqual(3);
	});

	it("should return empty array for market types with no series", async () => {
		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		const events = await client.fetchMarkets(["GEOPOLITICAL"]);

		expect(events).toEqual([]);
		expect(mockGetMarkets).not.toHaveBeenCalled();
	});

	it("should throw on API error", async () => {
		mockGetMarkets.mockImplementation(() => Promise.reject(new Error("API Error")));

		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		await expect(client.fetchMarkets(["FED_RATE"])).rejects.toThrow("API Error");
	});

	it("should throw AuthenticationError on 401", async () => {
		mockGetMarkets.mockImplementation(() => Promise.reject(new Error("401 Unauthorized")));

		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		try {
			await client.fetchMarkets(["FED_RATE"]);
			expect.unreachable("Should have thrown");
		} catch (error) {
			expect((error as Error).name).toBe("PredictionMarketError");
			expect((error as AuthenticationError).code).toBe("AUTH_ERROR");
		}
	});

	it("should throw RateLimitError on 429", async () => {
		mockGetMarkets.mockImplementation(() => Promise.reject(new Error("429 rate limit exceeded")));

		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		try {
			await client.fetchMarkets(["FED_RATE"]);
			expect.unreachable("Should have thrown");
		} catch (error) {
			expect((error as Error).name).toBe("PredictionMarketError");
			expect((error as RateLimitError).code).toBe("RATE_LIMIT");
		}
	});

	it("should skip invalid market data during parsing", async () => {
		mockGetMarkets.mockImplementation(() =>
			Promise.resolve({
				data: {
					markets: [{ invalid: "data" }, mockKalshiMarket],
				},
			})
		);

		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		const events = await client.fetchMarkets(["FED_RATE"]);
		expect(events.length).toBeGreaterThan(0);
	});

	it("should handle empty markets response", async () => {
		mockGetMarkets.mockImplementation(() =>
			Promise.resolve({
				data: { markets: [] },
			})
		);

		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		const events = await client.fetchMarkets(["FED_RATE"]);
		expect(events).toEqual([]);
	});

	it("should handle null markets response", async () => {
		mockGetMarkets.mockImplementation(() =>
			Promise.resolve({
				data: { markets: null },
			})
		);

		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		const events = await client.fetchMarkets(["FED_RATE"]);
		expect(events).toEqual([]);
	});
});
