/**
 * Tests for PolymarketClient.searchMarkets method
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { PolymarketClient } from "../client.js";
import {
  createFetchMock,
  type FetchMockContext,
  mockPolymarketEvent,
  restoreFetch,
} from "./fixtures.js";

describe("PolymarketClient.searchMarkets", () => {
  let ctx: FetchMockContext;

  beforeEach(() => {
    ctx = createFetchMock();
  });

  afterEach(() => {
    restoreFetch(ctx);
  });

  it("should search markets by query", async () => {
    ctx.mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ events: [mockPolymarketEvent] }),
      } as Response)
    );

    const client = new PolymarketClient();
    const results = await client.searchMarkets("Federal Reserve");

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("Fed Rate Decision");
  });

  it("should return empty array for non-array response", async () => {
    ctx.mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ not: "an array" }),
      } as Response)
    );

    const client = new PolymarketClient();
    const results = await client.searchMarkets("query");

    expect(results).toHaveLength(0);
  });

  it("should filter out invalid events from response", async () => {
    ctx.mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            events: [
              mockPolymarketEvent,
              { invalid: "event" }, // Missing required fields
            ],
          }),
      } as Response)
    );

    const client = new PolymarketClient();
    const results = await client.searchMarkets("query");

    expect(results).toHaveLength(1);
  });

  it("should throw on search errors", async () => {
    ctx.mockFetch.mockImplementation(() => {
      throw new Error("Network error");
    });

    const client = new PolymarketClient();

    try {
      await client.searchMarkets("query");
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });
});
