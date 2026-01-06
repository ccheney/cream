/**
 * Tests for Kalshi WebSocket Client
 */

import { describe, expect, it } from "bun:test";
import {
  DEFAULT_RECONNECT_CONFIG,
  HEARTBEAT_INTERVAL_MS,
  KALSHI_DEMO_WEBSOCKET_URL,
  KALSHI_WEBSOCKET_URL,
  KalshiWebSocketClient,
  MarketStateCache,
  OrderbookDeltaMessageSchema,
  SubscribeCommandSchema,
  TickerMessageSchema,
  TradeMessageSchema,
  UnsubscribeCommandSchema,
} from "./websocket";

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

    // First update with yes bid/ask
    cache.updateFromTicker({
      market_ticker: "KXFED-26JAN29",
      yes_bid: 0.55,
      yes_ask: 0.57,
      timestamp: new Date().toISOString(),
    });

    // Second update with no bid/ask
    cache.updateFromTicker({
      market_ticker: "KXFED-26JAN29",
      no_bid: 0.43,
      no_ask: 0.45,
      timestamp: new Date().toISOString(),
    });

    const state = cache.get("KXFED-26JAN29");

    expect(state?.yesBid).toBe(0.55); // Should preserve
    expect(state?.yesAsk).toBe(0.57); // Should preserve
    expect(state?.noBid).toBe(0.43); // Should update
    expect(state?.noAsk).toBe(0.45); // Should update
  });

  it("should return undefined for unknown tickers", () => {
    const cache = new MarketStateCache();
    const state = cache.get("UNKNOWN");
    expect(state).toBeUndefined();
  });

  it("should expire entries after TTL", () => {
    // Very short TTL
    const cache = new MarketStateCache(1);

    cache.updateFromTicker({
      market_ticker: "KXFED-26JAN29",
      yes_bid: 0.55,
      timestamp: new Date().toISOString(),
    });

    // Wait for expiration
    const start = Date.now();
    while (Date.now() - start < 10) {
      // Busy wait
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

    // Wait for expiration
    const start = Date.now();
    while (Date.now() - start < 10) {
      // Busy wait
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

describe("KalshiWebSocketClient", () => {
  it("should initialize with default config", () => {
    const client = new KalshiWebSocketClient();

    expect(client.getConnectionState()).toBe("disconnected");
    expect(client.getCache()).toBeDefined();
  });

  it("should initialize with custom config", () => {
    const client = new KalshiWebSocketClient({
      demo: true,
      autoReconnect: false,
      cacheTtlMs: 60000,
      reconnect: {
        maxRetries: 5,
        initialDelayMs: 500,
      },
    });

    expect(client.getConnectionState()).toBe("disconnected");
  });

  it("should register event listeners", () => {
    const client = new KalshiWebSocketClient();

    let connectCalled = false;
    let disconnectCalled = false;
    let errorCalled = false;

    client.onConnect(() => {
      connectCalled = true;
    });
    client.onDisconnect(() => {
      disconnectCalled = true;
    });
    client.onError(() => {
      errorCalled = true;
    });

    // Listeners are registered, but not called yet
    expect(connectCalled).toBe(false);
    expect(disconnectCalled).toBe(false);
    expect(errorCalled).toBe(false);
  });
});

describe("Message Schemas", () => {
  describe("SubscribeCommandSchema", () => {
    it("should validate subscribe command", () => {
      const command = {
        id: 1704067200000,
        cmd: "subscribe",
        params: {
          channels: ["ticker", "orderbook_delta"],
          market_tickers: ["KXFED-26JAN29"],
        },
      };

      const result = SubscribeCommandSchema.safeParse(command);
      expect(result.success).toBe(true);
    });

    it("should allow subscribe without market_tickers", () => {
      const command = {
        id: 1,
        cmd: "subscribe",
        params: {
          channels: ["trade"],
        },
      };

      const result = SubscribeCommandSchema.safeParse(command);
      expect(result.success).toBe(true);
    });
  });

  describe("UnsubscribeCommandSchema", () => {
    it("should validate unsubscribe command", () => {
      const command = {
        id: 2,
        cmd: "unsubscribe",
        params: {
          channels: ["ticker"],
          market_tickers: ["KXFED-26JAN29"],
        },
      };

      const result = UnsubscribeCommandSchema.safeParse(command);
      expect(result.success).toBe(true);
    });
  });

  describe("TickerMessageSchema", () => {
    it("should validate ticker message", () => {
      const message = {
        type: "ticker",
        msg: {
          market_ticker: "KXFED-26JAN29",
          yes_bid: 0.55,
          yes_ask: 0.57,
          no_bid: 0.43,
          no_ask: 0.45,
          last_price: 0.56,
          volume: 10000,
          open_interest: 5000,
          timestamp: "2026-01-06T12:00:00Z",
        },
      };

      const result = TickerMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });

    it("should allow partial ticker message", () => {
      const message = {
        type: "ticker",
        msg: {
          market_ticker: "KXFED-26JAN29",
          last_price: 0.56,
          timestamp: "2026-01-06T12:00:00Z",
        },
      };

      const result = TickerMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });
  });

  describe("OrderbookDeltaMessageSchema", () => {
    it("should validate orderbook delta message", () => {
      const message = {
        type: "orderbook_delta",
        msg: {
          market_ticker: "KXFED-26JAN29",
          side: "yes",
          price: 0.55,
          delta: 100,
          timestamp: "2026-01-06T12:00:00Z",
        },
      };

      const result = OrderbookDeltaMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });
  });

  describe("TradeMessageSchema", () => {
    it("should validate trade message", () => {
      const message = {
        type: "trade",
        msg: {
          trade_id: "trade123",
          market_ticker: "KXFED-26JAN29",
          side: "yes",
          count: 10,
          yes_price: 0.56,
          no_price: 0.44,
          taker_side: "yes",
          timestamp: "2026-01-06T12:00:00Z",
        },
      };

      const result = TradeMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });
  });
});

describe("Constants", () => {
  it("should have correct WebSocket URLs", () => {
    expect(KALSHI_WEBSOCKET_URL).toBe("wss://trading-api.kalshi.com/trade-api/ws/v2");
    expect(KALSHI_DEMO_WEBSOCKET_URL).toBe("wss://demo-api.kalshi.co/trade-api/ws/v2");
  });

  it("should have correct heartbeat interval", () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(10000);
  });

  it("should have correct default reconnect config", () => {
    expect(DEFAULT_RECONNECT_CONFIG.initialDelayMs).toBe(1000);
    expect(DEFAULT_RECONNECT_CONFIG.maxDelayMs).toBe(30000);
    expect(DEFAULT_RECONNECT_CONFIG.backoffMultiplier).toBe(2);
    expect(DEFAULT_RECONNECT_CONFIG.maxRetries).toBe(10);
  });
});
