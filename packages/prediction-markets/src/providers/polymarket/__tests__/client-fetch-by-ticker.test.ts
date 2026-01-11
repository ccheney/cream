/**
 * Tests for PolymarketClient.fetchMarketByTicker method
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { PolymarketClient } from "../client.js";
import {
  createFetchMock,
  type FetchMockContext,
  mockPolymarketMarket,
  restoreFetch,
} from "./fixtures.js";

describe("PolymarketClient.fetchMarketByTicker", () => {
  let ctx: FetchMockContext;

  beforeEach(() => {
    ctx = createFetchMock();
  });

  afterEach(() => {
    restoreFetch(ctx);
  });

  it("should fetch a specific market by ID", async () => {
    ctx.mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockPolymarketMarket),
      } as Response)
    );

    const client = new PolymarketClient();
    const event = await client.fetchMarketByTicker("market-789");

    expect(event).not.toBeNull();
    expect(event?.payload.marketTicker).toBe("market-789");
    expect(event?.payload.platform).toBe("POLYMARKET");
  });

  it("should return null for 404", async () => {
    ctx.mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response)
    );

    const client = new PolymarketClient();
    const event = await client.fetchMarketByTicker("non-existent");

    expect(event).toBeNull();
  });

  it("should return null for invalid response data", async () => {
    ctx.mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ invalid: "data" }),
      } as Response)
    );

    const client = new PolymarketClient();
    const event = await client.fetchMarketByTicker("bad-market");

    expect(event).toBeNull();
  });

  it("should throw for non-404 errors in fetchMarketByTicker", async () => {
    ctx.mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as Response)
    );

    const client = new PolymarketClient();

    try {
      await client.fetchMarketByTicker("market-789");
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });
});
