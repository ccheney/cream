/**
 * Tests for KalshiClient.getEventDetails method
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { KalshiClient } from "../client.js";
import { mockGetEvent, resetMocks, resetToDefaultImplementations } from "./fixtures.js";

const createClient = () =>
	new KalshiClient({
		apiKeyId: "test-key",
		privateKeyPem: "test-pem",
	});

beforeEach(() => {
	resetMocks();
	resetToDefaultImplementations();
});

describe("KalshiClient.getEventDetails lookup", () => {
	it("should fetch event details by ticker", async () => {
		const event = await createClient().getEventDetails("KXFED-26JAN29");
		expect(mockGetEvent).toHaveBeenCalledWith("KXFED-26JAN29", true);
		expect(event).not.toBeNull();
		expect(event?.event_ticker).toBe("KXFED-26JAN29");
		expect(event?.title).toBe("Federal Reserve January 2026 Decision");
	});

	it("should return null when event is not found", async () => {
		mockGetEvent.mockImplementation(() => Promise.resolve({ data: { event: null } }));
		expect(await createClient().getEventDetails("NONEXISTENT")).toBeNull();
	});

	it("should return null when event is undefined", async () => {
		mockGetEvent.mockImplementation(() => Promise.resolve({ data: { event: undefined } }));
		expect(await createClient().getEventDetails("MISSING")).toBeNull();
	});
});

describe("KalshiClient.getEventDetails validation", () => {
	it("should return null for invalid event data", async () => {
		mockGetEvent.mockImplementation(() =>
			Promise.resolve({
				data: { event: { invalid: "data" } },
			}),
		);
		expect(await createClient().getEventDetails("INVALID")).toBeNull();
	});

	it("should throw on API error", async () => {
		mockGetEvent.mockImplementation(() => Promise.reject(new Error("API Error")));
		await expect(createClient().getEventDetails("ERROR")).rejects.toThrow("API Error");
	});
});
