/**
 * Tests for KalshiClient market transformation logic (via fetchMarkets)
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { KalshiClient } from "../client.js";
import { mockGetMarkets, mockKalshiMarket, resetMocks } from "./fixtures.js";

const createClient = () =>
	new KalshiClient({
		apiKeyId: "test-key",
		privateKeyPem: "test-pem",
	});

async function fetchSingleEvent(overrides: Partial<typeof mockKalshiMarket>) {
	mockGetMarkets.mockImplementation(() =>
		Promise.resolve({
			data: { markets: [{ ...mockKalshiMarket, ...overrides }] },
		}),
	);
	const [event] = await createClient().fetchMarkets(["FED_RATE"]);
	return event;
}

beforeEach(() => {
	resetMocks();
});

describe("KalshiClient.transformMarket outcomes", () => {
	it("should transform market with yes/no prices", async () => {
		const event = await fetchSingleEvent({
			yes_bid: 55,
			yes_ask: 57,
			no_bid: 43,
			no_ask: 45,
			last_price: 56,
		});
		expect(event?.payload.outcomes).toBeDefined();
		const yesOutcome = event?.payload.outcomes.find((outcome) => outcome.outcome === "Yes");
		expect(yesOutcome?.probability).toBe(0.56);
		expect(yesOutcome?.price).toBe(0.56);
	});

	it("should handle market with only yes_bid (no last_price)", async () => {
		const event = await fetchSingleEvent({
			yes_bid: 60,
			yes_ask: 62,
			no_bid: 38,
			no_ask: 40,
			last_price: undefined,
		});
		const yesOutcome = event?.payload.outcomes.find((outcome) => outcome.outcome === "Yes");
		expect(yesOutcome?.probability).toBe(0.6);
	});

	it("should create No outcome with inverse price", async () => {
		const event = await fetchSingleEvent({ yes_bid: 70, no_bid: 30, last_price: 70 });
		const noOutcome = event?.payload.outcomes.find((outcome) => outcome.outcome === "No");
		expect(noOutcome?.probability).toBe(0.3);
	});
});

describe("KalshiClient.transformMarket event time", () => {
	it("should use expiration_time for eventTime", async () => {
		const event = await fetchSingleEvent({
			expiration_time: "2026-01-29T21:00:00Z",
			close_time: "2026-01-29T19:00:00Z",
		});
		expect(event?.eventTime).toBe("2026-01-29T21:00:00Z");
	});

	it("should fall back to close_time when no expiration_time", async () => {
		const event = await fetchSingleEvent({
			expiration_time: undefined,
			close_time: "2026-01-29T19:00:00Z",
		});
		expect(event?.eventTime).toBe("2026-01-29T19:00:00Z");
	});

	it("should use current date when no time fields", async () => {
		const event = await fetchSingleEvent({ expiration_time: undefined, close_time: undefined });
		expect(event?.eventTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});
});

describe("KalshiClient.transformMarket additional payload fields", () => {
	it("should include volume24h in Yes outcome", async () => {
		const event = await fetchSingleEvent({ volume_24h: 25000 });
		const yesOutcome = event?.payload.outcomes.find((outcome) => outcome.outcome === "Yes");
		expect(yesOutcome?.volume24h).toBe(25000);
	});
});
