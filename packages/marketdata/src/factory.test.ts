/**
 * Market Data Factory Tests
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  AlpacaMarketDataAdapter,
  createMarketDataAdapter,
  getMarketDataAdapter,
  isMarketDataAvailable,
  MarketDataConfigError,
  MockMarketDataAdapter,
} from "./factory";

describe("MarketDataFactory", () => {
  const originalEnv = process.env.CREAM_ENV;
  const originalAlpacaKey = process.env.ALPACA_KEY;
  const originalAlpacaSecret = process.env.ALPACA_SECRET;

  beforeEach(() => {
    // Reset environment
    delete process.env.ALPACA_KEY;
    delete process.env.ALPACA_SECRET;
  });

  afterEach(() => {
    // Restore environment
    if (originalEnv) {
      process.env.CREAM_ENV = originalEnv;
    } else {
      delete process.env.CREAM_ENV;
    }
    if (originalAlpacaKey) {
      process.env.ALPACA_KEY = originalAlpacaKey;
    } else {
      delete process.env.ALPACA_KEY;
    }
    if (originalAlpacaSecret) {
      process.env.ALPACA_SECRET = originalAlpacaSecret;
    } else {
      delete process.env.ALPACA_SECRET;
    }
  });

  describe("createMarketDataAdapter", () => {
    test("returns MockMarketDataAdapter for BACKTEST", () => {
      process.env.CREAM_ENV = "BACKTEST";
      const adapter = createMarketDataAdapter();
      expect(adapter).toBeInstanceOf(MockMarketDataAdapter);
      expect(adapter.getType()).toBe("mock");
    });

    test("returns AlpacaMarketDataAdapter for PAPER with API keys", () => {
      process.env.CREAM_ENV = "PAPER";
      process.env.ALPACA_KEY = "test-key";
      process.env.ALPACA_SECRET = "test-secret";
      const adapter = createMarketDataAdapter();
      expect(adapter).toBeInstanceOf(AlpacaMarketDataAdapter);
      expect(adapter.getType()).toBe("alpaca");
    });

    test("returns AlpacaMarketDataAdapter for LIVE with API keys", () => {
      process.env.CREAM_ENV = "LIVE";
      process.env.ALPACA_KEY = "test-key";
      process.env.ALPACA_SECRET = "test-secret";
      const adapter = createMarketDataAdapter();
      expect(adapter).toBeInstanceOf(AlpacaMarketDataAdapter);
      expect(adapter.getType()).toBe("alpaca");
    });

    test("throws MarketDataConfigError for PAPER without API keys", () => {
      process.env.CREAM_ENV = "PAPER";
      delete process.env.ALPACA_KEY;
      delete process.env.ALPACA_SECRET;
      expect(() => createMarketDataAdapter()).toThrow(MarketDataConfigError);
    });

    test("throws MarketDataConfigError for LIVE without API keys", () => {
      process.env.CREAM_ENV = "LIVE";
      delete process.env.ALPACA_KEY;
      delete process.env.ALPACA_SECRET;
      expect(() => createMarketDataAdapter()).toThrow(MarketDataConfigError);
    });

    test("accepts explicit environment override", () => {
      process.env.CREAM_ENV = "LIVE";
      process.env.ALPACA_KEY = "test-key";
      process.env.ALPACA_SECRET = "test-secret";
      const adapter = createMarketDataAdapter("BACKTEST");
      expect(adapter).toBeInstanceOf(MockMarketDataAdapter);
    });
  });

  describe("getMarketDataAdapter", () => {
    test("returns adapter for BACKTEST", () => {
      process.env.CREAM_ENV = "BACKTEST";
      const adapter = getMarketDataAdapter();
      expect(adapter).not.toBeNull();
      expect(adapter?.getType()).toBe("mock");
    });

    test("returns null for PAPER without API keys", () => {
      process.env.CREAM_ENV = "PAPER";
      delete process.env.ALPACA_KEY;
      delete process.env.ALPACA_SECRET;
      const adapter = getMarketDataAdapter();
      expect(adapter).toBeNull();
    });

    test("returns adapter for PAPER with API keys", () => {
      process.env.CREAM_ENV = "PAPER";
      process.env.ALPACA_KEY = "test-key";
      process.env.ALPACA_SECRET = "test-secret";
      const adapter = getMarketDataAdapter();
      expect(adapter).not.toBeNull();
      expect(adapter?.getType()).toBe("alpaca");
    });
  });

  describe("isMarketDataAvailable", () => {
    test("returns true for BACKTEST", () => {
      process.env.CREAM_ENV = "BACKTEST";
      expect(isMarketDataAvailable()).toBe(true);
    });

    test("returns false for PAPER without API keys", () => {
      process.env.CREAM_ENV = "PAPER";
      delete process.env.ALPACA_KEY;
      delete process.env.ALPACA_SECRET;
      expect(isMarketDataAvailable()).toBe(false);
    });

    test("returns true for PAPER with API keys", () => {
      process.env.CREAM_ENV = "PAPER";
      process.env.ALPACA_KEY = "test-key";
      process.env.ALPACA_SECRET = "test-secret";
      expect(isMarketDataAvailable()).toBe(true);
    });
  });
});

describe("MockMarketDataAdapter", () => {
  let adapter: MockMarketDataAdapter;

  beforeEach(() => {
    adapter = new MockMarketDataAdapter();
  });

  describe("getCandles", () => {
    test("returns 120 candles by default", async () => {
      const candles = await adapter.getCandles("AAPL", "1h", "2026-01-01", "2026-01-06");
      expect(candles).toHaveLength(120);
    });

    test("returns candles with valid OHLCV data", async () => {
      const candles = await adapter.getCandles("AAPL", "1h", "2026-01-01", "2026-01-06");
      for (const candle of candles) {
        expect(candle.timestamp).toBeGreaterThan(0);
        expect(candle.open).toBeGreaterThan(0);
        expect(candle.high).toBeGreaterThanOrEqual(candle.low);
        expect(candle.close).toBeGreaterThan(0);
        expect(candle.volume).toBeGreaterThan(0);
      }
    });

    test("returns deterministic data for same symbol", async () => {
      const candles1 = await adapter.getCandles("AAPL", "1h", "2026-01-01", "2026-01-06");
      const candles2 = await adapter.getCandles("AAPL", "1h", "2026-01-01", "2026-01-06");
      expect(candles1).toEqual(candles2);
    });

    test("returns different data for different symbols", async () => {
      const candles1 = await adapter.getCandles("AAPL", "1h", "2026-01-01", "2026-01-06");
      const candles2 = await adapter.getCandles("MSFT", "1h", "2026-01-01", "2026-01-06");
      expect(candles1[0]?.close).not.toBe(candles2[0]?.close);
    });
  });

  describe("getQuote", () => {
    test("returns quote with valid structure", async () => {
      const quote = await adapter.getQuote("AAPL");
      expect(quote).not.toBeNull();
      expect(quote?.symbol).toBe("AAPL");
      expect(quote?.bid).toBeGreaterThan(0);
      expect(quote?.ask).toBeGreaterThan(quote?.bid ?? 0);
      expect(quote?.last).toBeGreaterThan(0);
    });

    test("returns deterministic quote for same symbol", async () => {
      const quote1 = await adapter.getQuote("AAPL");
      const quote2 = await adapter.getQuote("AAPL");
      expect(quote1?.bid).toBe(quote2?.bid);
      expect(quote1?.ask).toBe(quote2?.ask);
    });
  });

  describe("getQuotes", () => {
    test("returns quotes for all symbols", async () => {
      const quotes = await adapter.getQuotes(["AAPL", "MSFT", "GOOGL"]);
      expect(quotes.size).toBe(3);
      expect(quotes.has("AAPL")).toBe(true);
      expect(quotes.has("MSFT")).toBe(true);
      expect(quotes.has("GOOGL")).toBe(true);
    });
  });

  describe("isReady", () => {
    test("returns true", () => {
      expect(adapter.isReady()).toBe(true);
    });
  });
});
