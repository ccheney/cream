/**
 * Tests for MarketStateCache
 */

import { describe, expect, it } from "bun:test";
import { MarketStateCache } from "../index.js";

describe("MarketStateCache", () => {
  it("should store and retrieve market state", () => {
    const cache = new MarketStateCache();

    cache.updateFromTicker({
      market_ticker: "KXFED-26JAN29",
      yes_bid: 0.55,
      yes_ask: 0.57,
      last_price: 0.56,
      volume: 10000,
      open_interest: 5000,
      timestamp: new Date().toISOString(),
    });

    const state = cache.get("KXFED-26JAN29");

    expect(state).toBeDefined();
    expect(state?.yesBid).toBe(0.55);
    expect(state?.yesAsk).toBe(0.57);
    expect(state?.lastPrice).toBe(0.56);
    expect(state?.volume).toBe(10000);
    expect(state?.openInterest).toBe(5000);
  });

  it("should update existing state without losing fields", () => {
    const cache = new MarketStateCache();

    cache.updateFromTicker({
      market_ticker: "KXFED-26JAN29",
      yes_bid: 0.55,
      yes_ask: 0.57,
      timestamp: new Date().toISOString(),
    });

    cache.updateFromTicker({
      market_ticker: "KXFED-26JAN29",
      no_bid: 0.43,
      no_ask: 0.45,
      timestamp: new Date().toISOString(),
    });

    const state = cache.get("KXFED-26JAN29");

    expect(state?.yesBid).toBe(0.55);
    expect(state?.yesAsk).toBe(0.57);
    expect(state?.noBid).toBe(0.43);
    expect(state?.noAsk).toBe(0.45);
  });

  it("should return undefined for unknown tickers", () => {
    const cache = new MarketStateCache();
    const state = cache.get("UNKNOWN");
    expect(state).toBeUndefined();
  });

  it("should expire entries after TTL", () => {
    const cache = new MarketStateCache(1);

    cache.updateFromTicker({
      market_ticker: "KXFED-26JAN29",
      yes_bid: 0.55,
      timestamp: new Date().toISOString(),
    });

    const start = Date.now();
    while (Date.now() - start < 10) {
      // Busy wait for expiration
    }

    const state = cache.get("KXFED-26JAN29");
    expect(state).toBeUndefined();
  });

  it("should prune expired entries", () => {
    const cache = new MarketStateCache(1);

    cache.updateFromTicker({
      market_ticker: "TICKER1",
      yes_bid: 0.55,
      timestamp: new Date().toISOString(),
    });
    cache.updateFromTicker({
      market_ticker: "TICKER2",
      yes_bid: 0.6,
      timestamp: new Date().toISOString(),
    });

    const start = Date.now();
    while (Date.now() - start < 10) {
      // Busy wait for expiration
    }

    const removed = cache.prune();
    expect(removed).toBe(2);
  });

  it("should clear all entries", () => {
    const cache = new MarketStateCache();

    cache.updateFromTicker({
      market_ticker: "TICKER1",
      yes_bid: 0.55,
      timestamp: new Date().toISOString(),
    });
    cache.updateFromTicker({
      market_ticker: "TICKER2",
      yes_bid: 0.6,
      timestamp: new Date().toISOString(),
    });

    cache.clear();

    expect(cache.get("TICKER1")).toBeUndefined();
    expect(cache.get("TICKER2")).toBeUndefined();
  });

  it("should list all tickers", () => {
    const cache = new MarketStateCache();

    cache.updateFromTicker({
      market_ticker: "TICKER1",
      yes_bid: 0.55,
      timestamp: new Date().toISOString(),
    });
    cache.updateFromTicker({
      market_ticker: "TICKER2",
      yes_bid: 0.6,
      timestamp: new Date().toISOString(),
    });

    const tickers = cache.getAllTickers();
    expect(tickers).toContain("TICKER1");
    expect(tickers).toContain("TICKER2");
    expect(tickers).toHaveLength(2);
  });
});
