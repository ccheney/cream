/**
 * Tests for PolymarketClient.fetchMarkets method
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { AuthenticationError, RateLimitError } from "../../../index.js";
import { PolymarketClient } from "../client.js";
import {
	createFetchMock,
	type FetchMockContext,
	mockPolymarketEvent,
	restoreFetch,
} from "./fixtures.js";

describe("PolymarketClient.fetchMarkets", () => {
	let ctx: FetchMockContext;

	beforeEach(() => {
		ctx = createFetchMock();
	});

	afterEach(() => {
		restoreFetch(ctx);
	});

	it("should fetch markets for FED_RATE type", async () => {
		ctx.mockFetch.mockImplementation(() =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ events: [mockPolymarketEvent] }),
			} as Response)
		);

		const client = new PolymarketClient();
		const events = await client.fetchMarkets(["FED_RATE"]);

		expect(events.length).toBeGreaterThan(0);
		expect(events[0]?.payload.platform).toBe("POLYMARKET");
		expect(events[0]?.payload.marketType).toBe("FED_RATE");
	});

	it("should fetch markets for multiple types", async () => {
		let callCount = 0;
		ctx.mockFetch.mockImplementation(() => {
			callCount++;
			return Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						events: [
							{
								...mockPolymarketEvent,
								id: `event-${callCount}`,
								markets: [{ ...mockPolymarketEvent.markets[0], id: `market-${callCount}` }],
							},
						],
					}),
			} as Response);
		});

		const client = new PolymarketClient();
		const events = await client.fetchMarkets(["FED_RATE", "ECONOMIC_DATA"]);

		expect(events.length).toBeGreaterThan(0);
		expect(callCount).toBeGreaterThan(1);
	});

	it("should use default search queries when market type has no queries", async () => {
		ctx.mockFetch.mockImplementation(() =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ events: [mockPolymarketEvent] }),
			} as Response)
		);

		const client = new PolymarketClient({
			searchQueries: ["default query"],
		});
		await client.fetchMarkets(["GEOPOLITICAL"]);

		expect(ctx.mockFetch).toHaveBeenCalled();
	});

	it("should deduplicate events by eventId", async () => {
		ctx.mockFetch.mockImplementation(() =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ events: [mockPolymarketEvent] }),
			} as Response)
		);

		const client = new PolymarketClient();
		const events = await client.fetchMarkets(["FED_RATE"]);

		const eventIds = events.map((e) => e.eventId);
		const uniqueIds = [...new Set(eventIds)];
		expect(eventIds.length).toBe(uniqueIds.length);
	});

	it("should throw AuthenticationError on 401", async () => {
		ctx.mockFetch.mockImplementation(() => {
			throw new Error("HTTP 401: Unauthorized");
		});

		const client = new PolymarketClient();

		try {
			await client.fetchMarkets(["FED_RATE"]);
			expect.unreachable("Should have thrown");
		} catch (error) {
			expect((error as Error).name).toBe("PredictionMarketError");
			expect((error as AuthenticationError).code).toBe("AUTH_ERROR");
		}
	});

	it("should throw RateLimitError on 429", async () => {
		ctx.mockFetch.mockImplementation(() => {
			throw new Error("HTTP 429: Rate limit exceeded");
		});

		const client = new PolymarketClient();

		try {
			await client.fetchMarkets(["FED_RATE"]);
			expect.unreachable("Should have thrown");
		} catch (error) {
			expect((error as Error).name).toBe("PredictionMarketError");
			expect((error as RateLimitError).code).toBe("RATE_LIMIT");
		}
	});
});
