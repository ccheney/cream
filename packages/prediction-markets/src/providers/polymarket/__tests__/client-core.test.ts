/**
 * Tests for PolymarketClient constructor and event transformation
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { PolymarketClient } from "../client.js";
import { createFetchMock, type FetchMockContext, restoreFetch } from "./fixtures.js";

describe("PolymarketClient constructor", () => {
	let ctx: FetchMockContext;

	beforeEach(() => {
		ctx = createFetchMock();
	});

	afterEach(() => {
		restoreFetch(ctx);
	});

	it("should create client with default options", () => {
		const client = new PolymarketClient();
		expect(client.platform).toBe("POLYMARKET");
	});

	it("should create client with custom endpoints", () => {
		const client = new PolymarketClient({
			clobEndpoint: "https://custom-clob.example.com",
			gammaEndpoint: "https://custom-gamma.example.com",
		});
		expect(client.platform).toBe("POLYMARKET");
	});

	it("should create client with custom search queries", () => {
		const client = new PolymarketClient({
			searchQueries: ["crypto", "bitcoin"],
		});
		expect(client.platform).toBe("POLYMARKET");
	});
});

describe("PolymarketClient event transformation", () => {
	let ctx: FetchMockContext;

	beforeEach(() => {
		ctx = createFetchMock();
	});

	afterEach(() => {
		restoreFetch(ctx);
	});

	it("should transform event with default outcomes", async () => {
		ctx.mockFetch.mockImplementation(() =>
			Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						events: [
							{
								id: "event-1",
								title: "Test Event",
								markets: [
									{
										id: "market-1",
										question: "Test question?",
									},
								],
							},
						],
					}),
			} as Response),
		);

		const client = new PolymarketClient();
		const events = await client.fetchMarkets(["FED_RATE"]);

		expect(events[0]?.payload.outcomes).toHaveLength(2);
	});

	it("should skip events without markets", async () => {
		ctx.mockFetch.mockImplementation(() =>
			Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						events: [
							{
								id: "event-no-markets",
								title: "Event Without Markets",
							},
						],
					}),
			} as Response),
		);

		const client = new PolymarketClient();
		const events = await client.fetchMarkets(["FED_RATE"]);

		const noMarketEvents = events.filter((e) => e.eventId.includes("event-no-markets"));
		expect(noMarketEvents).toHaveLength(0);
	});

	it("should calculate liquidity score correctly", async () => {
		ctx.mockFetch.mockImplementation(() =>
			Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						events: [
							{
								id: "event-1",
								title: "High Liquidity Event",
								markets: [
									{
										id: "market-1",
										question: "High liquidity?",
										volume24hr: "200000", // $200k - high volume
										liquidity: "100000", // $100k - high liquidity
									},
								],
							},
						],
					}),
			} as Response),
		);

		const client = new PolymarketClient();
		const events = await client.fetchMarkets(["FED_RATE"]);

		expect(events[0]?.payload.liquidityScore).toBe(1);
	});
});
