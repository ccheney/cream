/**
 * Tests for KalshiClient.getEventDetails method
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { KalshiClient } from "../client.js";
import { mockGetEvent, resetMocks, resetToDefaultImplementations } from "./fixtures.js";

describe("KalshiClient.getEventDetails", () => {
	beforeEach(() => {
		resetMocks();
		resetToDefaultImplementations();
	});

	it("should fetch event details by ticker", async () => {
		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		const event = await client.getEventDetails("KXFED-26JAN29");

		expect(mockGetEvent).toHaveBeenCalledWith("KXFED-26JAN29", true);
		expect(event).not.toBeNull();
		expect(event?.event_ticker).toBe("KXFED-26JAN29");
		expect(event?.title).toBe("Federal Reserve January 2026 Decision");
	});

	it("should return null when event is not found", async () => {
		mockGetEvent.mockImplementation(() =>
			Promise.resolve({
				data: { event: null },
			})
		);

		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		const event = await client.getEventDetails("NONEXISTENT");
		expect(event).toBeNull();
	});

	it("should return null when event is undefined", async () => {
		mockGetEvent.mockImplementation(() =>
			Promise.resolve({
				data: { event: undefined },
			})
		);

		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		const event = await client.getEventDetails("MISSING");
		expect(event).toBeNull();
	});

	it("should return null for invalid event data", async () => {
		mockGetEvent.mockImplementation(() =>
			Promise.resolve({
				data: { event: { invalid: "data" } },
			})
		);

		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		const event = await client.getEventDetails("INVALID");
		expect(event).toBeNull();
	});

	it("should throw on API error", async () => {
		mockGetEvent.mockImplementation(() => Promise.reject(new Error("API Error")));

		const client = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
		});

		await expect(client.getEventDetails("ERROR")).rejects.toThrow("API Error");
	});
});
