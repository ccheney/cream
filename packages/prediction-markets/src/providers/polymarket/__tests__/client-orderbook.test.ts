/**
 * Tests for PolymarketClient.getMidpoint and getOrderbook methods
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { PolymarketClient } from "../client.js";
import { createFetchMock, type FetchMockContext, restoreFetch } from "./fixtures.js";

describe("PolymarketClient.getMidpoint", () => {
	let ctx: FetchMockContext;

	beforeEach(() => {
		ctx = createFetchMock();
	});

	afterEach(() => {
		restoreFetch(ctx);
	});

	it("should get midpoint price for token", async () => {
		ctx.mockFetch.mockImplementation(() =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ mid: "0.65" }),
			} as Response),
		);

		const client = new PolymarketClient();
		const midpoint = await client.getMidpoint("token-123");

		expect(midpoint).toBe(0.65);
	});

	it("should return null for non-ok response in getMidpoint", async () => {
		ctx.mockFetch.mockImplementation(() =>
			Promise.resolve({
				ok: false,
				status: 404,
			} as Response),
		);

		const client = new PolymarketClient();
		const midpoint = await client.getMidpoint("invalid-token");

		expect(midpoint).toBeNull();
	});

	it("should return null for missing mid field", async () => {
		ctx.mockFetch.mockImplementation(() =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ other: "data" }),
			} as Response),
		);

		const client = new PolymarketClient();
		const midpoint = await client.getMidpoint("token-123");

		expect(midpoint).toBeNull();
	});

	it("should return null on getMidpoint error", async () => {
		ctx.mockFetch.mockImplementation(() => Promise.reject(new Error("Network error")));

		const client = new PolymarketClient();
		const midpoint = await client.getMidpoint("token-123");

		expect(midpoint).toBeNull();
	});
});

describe("PolymarketClient.getOrderbook", () => {
	let ctx: FetchMockContext;

	beforeEach(() => {
		ctx = createFetchMock();
	});

	afterEach(() => {
		restoreFetch(ctx);
	});

	it("should get orderbook for token", async () => {
		ctx.mockFetch.mockImplementation(() =>
			Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						market: "market-123",
						asset_id: "token-123",
						bids: [
							{ price: "0.64", size: "1000" },
							{ price: "0.63", size: "2000" },
						],
						asks: [
							{ price: "0.66", size: "800" },
							{ price: "0.67", size: "1500" },
						],
					}),
			} as Response),
		);

		const client = new PolymarketClient();
		const orderbook = await client.getOrderbook("token-123");

		expect(orderbook).not.toBeNull();
		expect(orderbook?.bids).toHaveLength(2);
		expect(orderbook?.asks).toHaveLength(2);
	});

	it("should return null for non-ok response in getOrderbook", async () => {
		ctx.mockFetch.mockImplementation(() =>
			Promise.resolve({
				ok: false,
				status: 404,
			} as Response),
		);

		const client = new PolymarketClient();
		const orderbook = await client.getOrderbook("invalid-token");

		expect(orderbook).toBeNull();
	});

	it("should return null on getOrderbook error", async () => {
		ctx.mockFetch.mockImplementation(() => Promise.reject(new Error("Network error")));

		const client = new PolymarketClient();
		const orderbook = await client.getOrderbook("token-123");

		expect(orderbook).toBeNull();
	});
});
