/**
 * Tests for Kalshi WebSocket Client
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  createKalshiWebSocketClient,
  DEFAULT_RECONNECT_CONFIG,
  HEARTBEAT_INTERVAL_MS,
  KALSHI_DEMO_WEBSOCKET_URL,
  KALSHI_WEBSOCKET_URL,
  KalshiWebSocketClient,
  MarketLifecycleMessageSchema,
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

describe("MarketLifecycleMessageSchema", () => {
  it("should validate market lifecycle message", () => {
    const message = {
      type: "market_lifecycle_v2",
      msg: {
        market_ticker: "KXFED-26JAN29",
        status: "active",
        timestamp: "2026-01-06T12:00:00Z",
      },
    };

    const result = MarketLifecycleMessageSchema.safeParse(message);
    expect(result.success).toBe(true);
  });
});

describe("createKalshiWebSocketClient", () => {
  it("should create a client with default config", () => {
    const client = createKalshiWebSocketClient();
    expect(client).toBeInstanceOf(KalshiWebSocketClient);
    expect(client.getConnectionState()).toBe("disconnected");
  });

  it("should create a client with custom config", () => {
    const client = createKalshiWebSocketClient({
      demo: true,
      autoReconnect: false,
    });
    expect(client).toBeInstanceOf(KalshiWebSocketClient);
  });
});

// ============================================
// WebSocket Client with Mock WebSocket
// ============================================

describe("KalshiWebSocketClient with Mock WebSocket", () => {
  // Store original WebSocket
  let originalWebSocket: typeof WebSocket;
  let mockWebSocketInstance: any;
  let mockSend: ReturnType<typeof mock>;

  // Create a mock WebSocket class
  const createMockWebSocket = () => {
    mockSend = mock(() => {});

    mockWebSocketInstance = {
      onopen: null as ((ev: Event) => void) | null,
      onclose: null as ((ev: CloseEvent) => void) | null,
      onerror: null as ((ev: Event) => void) | null,
      onmessage: null as ((ev: MessageEvent) => void) | null,
      send: mockSend,
      close: mock(() => {}),
      readyState: 0,
    };

    class MockWebSocket {
      onopen: ((ev: Event) => void) | null = null;
      onclose: ((ev: CloseEvent) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      readyState = 0;

      constructor(_url: string) {
        // Copy handlers back to mockWebSocketInstance for testing
        setTimeout(() => {
          mockWebSocketInstance.onopen = this.onopen;
          mockWebSocketInstance.onclose = this.onclose;
          mockWebSocketInstance.onerror = this.onerror;
          mockWebSocketInstance.onmessage = this.onmessage;
        }, 0);
      }

      send = mockSend;
      close = mock(() => {});
    }

    return MockWebSocket;
  };

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
    (globalThis as any).WebSocket = createMockWebSocket();
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  describe("connect", () => {
    it("should transition to connected state on successful connection", async () => {
      const client = new KalshiWebSocketClient();

      // Start connection
      const connectPromise = client.connect();

      // Wait for WebSocket constructor to be called and handlers set up
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate successful connection
      if (mockWebSocketInstance.onopen) {
        mockWebSocketInstance.onopen(new Event("open"));
      }

      await connectPromise;

      expect(client.getConnectionState()).toBe("connected");
    });

    it("should not connect if already connected", async () => {
      const client = new KalshiWebSocketClient();

      // Start connection
      const connectPromise = client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (mockWebSocketInstance.onopen) {
        mockWebSocketInstance.onopen(new Event("open"));
      }
      await connectPromise;

      // Try to connect again
      await client.connect();

      // Should still be connected (no error)
      expect(client.getConnectionState()).toBe("connected");
    });

    it("should call onConnect callbacks", async () => {
      const client = new KalshiWebSocketClient();
      const onConnectCb = mock(() => {});
      client.onConnect(onConnectCb);

      const connectPromise = client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (mockWebSocketInstance.onopen) {
        mockWebSocketInstance.onopen(new Event("open"));
      }
      await connectPromise;

      expect(onConnectCb).toHaveBeenCalled();
    });

    it("should call onError callbacks on connection error", async () => {
      const client = new KalshiWebSocketClient();
      const onErrorCb = mock(() => {});
      client.onError(onErrorCb);

      const connectPromise = client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate error
      if (mockWebSocketInstance.onerror) {
        mockWebSocketInstance.onerror(new Event("error"));
      }

      await expect(connectPromise).rejects.toThrow();
      expect(onErrorCb).toHaveBeenCalled();
    });
  });

  describe("disconnect", () => {
    it("should transition to disconnected state", async () => {
      const client = new KalshiWebSocketClient({ autoReconnect: false });

      // Connect first
      const connectPromise = client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (mockWebSocketInstance.onopen) {
        mockWebSocketInstance.onopen(new Event("open"));
      }
      await connectPromise;

      // Disconnect
      client.disconnect();

      expect(client.getConnectionState()).toBe("disconnected");
    });

    it("should call onDisconnect callbacks", async () => {
      const client = new KalshiWebSocketClient({ autoReconnect: false });
      const onDisconnectCb = mock(() => {});
      client.onDisconnect(onDisconnectCb);

      // Connect first
      const connectPromise = client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (mockWebSocketInstance.onopen) {
        mockWebSocketInstance.onopen(new Event("open"));
      }
      await connectPromise;

      // Simulate WebSocket close event
      if (mockWebSocketInstance.onclose) {
        mockWebSocketInstance.onclose({ reason: "Client disconnect" } as CloseEvent);
      }

      expect(onDisconnectCb).toHaveBeenCalled();
    });
  });

  describe("subscribe", () => {
    it("should send subscription message when connected", async () => {
      const client = new KalshiWebSocketClient();

      // Connect first
      const connectPromise = client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (mockWebSocketInstance.onopen) {
        mockWebSocketInstance.onopen(new Event("open"));
      }
      await connectPromise;

      // Subscribe
      const callback = mock(() => {});
      client.subscribe("ticker", ["KXFED-26JAN29"], callback);

      expect(mockSend).toHaveBeenCalled();
      const sentMessage = JSON.parse(mockSend.mock.calls[0]?.[0] ?? "{}");
      expect(sentMessage.cmd).toBe("subscribe");
      expect(sentMessage.params.channels).toContain("ticker");
    });

    it("should queue subscriptions when not connected", () => {
      const client = new KalshiWebSocketClient();

      const callback = mock(() => {});
      client.subscribe("ticker", ["KXFED-26JAN29"], callback);

      // Not connected, so send should not be called
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("unsubscribe", () => {
    it("should send unsubscribe message when connected", async () => {
      const client = new KalshiWebSocketClient();

      // Connect first
      const connectPromise = client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (mockWebSocketInstance.onopen) {
        mockWebSocketInstance.onopen(new Event("open"));
      }
      await connectPromise;

      // Subscribe first
      const callback = mock(() => {});
      client.subscribe("ticker", ["KXFED-26JAN29"], callback);

      // Clear mock call count
      mockSend.mockClear();

      // Unsubscribe (without callback - removes all)
      client.unsubscribe("ticker", ["KXFED-26JAN29"]);

      expect(mockSend).toHaveBeenCalled();
      const sentMessage = JSON.parse(mockSend.mock.calls[0]?.[0] ?? "{}");
      expect(sentMessage.cmd).toBe("unsubscribe");
    });

    it("should only unsubscribe specific callback", async () => {
      const client = new KalshiWebSocketClient();

      // Connect first
      const connectPromise = client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (mockWebSocketInstance.onopen) {
        mockWebSocketInstance.onopen(new Event("open"));
      }
      await connectPromise;

      // Subscribe with two callbacks
      const callback1 = mock(() => {});
      const callback2 = mock(() => {});
      client.subscribe("ticker", ["KXFED-26JAN29"], callback1);
      client.subscribe("ticker", ["KXFED-26JAN29"], callback2);

      // Clear mock call count
      mockSend.mockClear();

      // Unsubscribe only callback1
      client.unsubscribe("ticker", ["KXFED-26JAN29"], callback1);

      // Should not send unsubscribe message because callback2 still exists
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("message handling", () => {
    it("should handle ticker messages and update cache", async () => {
      const client = new KalshiWebSocketClient();

      const connectPromise = client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (mockWebSocketInstance.onopen) {
        mockWebSocketInstance.onopen(new Event("open"));
      }
      await connectPromise;

      // Subscribe
      const callback = mock(() => {});
      client.subscribe("ticker", ["KXFED-26JAN29"], callback);

      // Simulate ticker message
      const tickerMessage = {
        type: "ticker",
        msg: {
          market_ticker: "KXFED-26JAN29",
          yes_bid: 55,
          yes_ask: 57,
          last_price: 56,
          timestamp: new Date().toISOString(),
        },
      };

      if (mockWebSocketInstance.onmessage) {
        mockWebSocketInstance.onmessage({
          data: JSON.stringify(tickerMessage),
        } as MessageEvent);
      }

      // Check cache was updated
      const state = client.getCache().get("KXFED-26JAN29");
      expect(state?.yesBid).toBe(55);
      expect(state?.yesAsk).toBe(57);
      expect(state?.lastPrice).toBe(56);
    });

    it("should notify subscribers on ticker message", async () => {
      const client = new KalshiWebSocketClient();

      const connectPromise = client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (mockWebSocketInstance.onopen) {
        mockWebSocketInstance.onopen(new Event("open"));
      }
      await connectPromise;

      // Subscribe
      const callback = mock(() => {});
      client.subscribe("ticker", ["KXFED-26JAN29"], callback);

      // Simulate ticker message
      const tickerMessage = {
        type: "ticker",
        msg: {
          market_ticker: "KXFED-26JAN29",
          yes_bid: 55,
          timestamp: new Date().toISOString(),
        },
      };

      if (mockWebSocketInstance.onmessage) {
        mockWebSocketInstance.onmessage({
          data: JSON.stringify(tickerMessage),
        } as MessageEvent);
      }

      expect(callback).toHaveBeenCalled();
    });

    it("should handle orderbook delta messages", async () => {
      const client = new KalshiWebSocketClient();

      const connectPromise = client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (mockWebSocketInstance.onopen) {
        mockWebSocketInstance.onopen(new Event("open"));
      }
      await connectPromise;

      // Subscribe
      const callback = mock(() => {});
      client.subscribe("orderbook_delta", ["KXFED-26JAN29"], callback);

      // Simulate orderbook delta message
      const message = {
        type: "orderbook_delta",
        msg: {
          market_ticker: "KXFED-26JAN29",
          side: "yes",
          price: 55,
          delta: 100,
          timestamp: new Date().toISOString(),
        },
      };

      if (mockWebSocketInstance.onmessage) {
        mockWebSocketInstance.onmessage({
          data: JSON.stringify(message),
        } as MessageEvent);
      }

      expect(callback).toHaveBeenCalled();
    });

    it("should handle trade messages", async () => {
      const client = new KalshiWebSocketClient();

      const connectPromise = client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (mockWebSocketInstance.onopen) {
        mockWebSocketInstance.onopen(new Event("open"));
      }
      await connectPromise;

      // Subscribe
      const callback = mock(() => {});
      client.subscribe("trade", [], callback);

      // Simulate trade message
      const message = {
        type: "trade",
        msg: {
          trade_id: "trade123",
          market_ticker: "KXFED-26JAN29",
          side: "yes",
          count: 10,
          yes_price: 56,
          no_price: 44,
          timestamp: new Date().toISOString(),
        },
      };

      if (mockWebSocketInstance.onmessage) {
        mockWebSocketInstance.onmessage({
          data: JSON.stringify(message),
        } as MessageEvent);
      }

      expect(callback).toHaveBeenCalled();
    });

    it("should handle market lifecycle messages", async () => {
      const client = new KalshiWebSocketClient();

      const connectPromise = client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (mockWebSocketInstance.onopen) {
        mockWebSocketInstance.onopen(new Event("open"));
      }
      await connectPromise;

      // Subscribe
      const callback = mock(() => {});
      client.subscribe("market_lifecycle_v2", ["KXFED-26JAN29"], callback);

      // Simulate lifecycle message
      const message = {
        type: "market_lifecycle_v2",
        msg: {
          market_ticker: "KXFED-26JAN29",
          status: "closed",
          timestamp: new Date().toISOString(),
        },
      };

      if (mockWebSocketInstance.onmessage) {
        mockWebSocketInstance.onmessage({
          data: JSON.stringify(message),
        } as MessageEvent);
      }

      expect(callback).toHaveBeenCalled();
    });

    it("should ignore invalid JSON messages", async () => {
      const client = new KalshiWebSocketClient();

      const connectPromise = client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (mockWebSocketInstance.onopen) {
        mockWebSocketInstance.onopen(new Event("open"));
      }
      await connectPromise;

      // This should not throw
      if (mockWebSocketInstance.onmessage) {
        mockWebSocketInstance.onmessage({
          data: "not valid json",
        } as MessageEvent);
      }

      expect(client.getConnectionState()).toBe("connected");
    });

    it("should ignore invalid message types", async () => {
      const client = new KalshiWebSocketClient();

      const connectPromise = client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (mockWebSocketInstance.onopen) {
        mockWebSocketInstance.onopen(new Event("open"));
      }
      await connectPromise;

      const callback = mock(() => {});
      client.subscribe("ticker", ["KXFED-26JAN29"], callback);

      // Simulate invalid message type
      if (mockWebSocketInstance.onmessage) {
        mockWebSocketInstance.onmessage({
          data: JSON.stringify({ type: "unknown", msg: {} }),
        } as MessageEvent);
      }

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("reconnection", () => {
    it("should auto-reconnect on disconnect when enabled", async () => {
      const client = new KalshiWebSocketClient({
        autoReconnect: true,
        reconnect: {
          initialDelayMs: 10,
          maxRetries: 2,
        },
      });

      // Connect first
      const connectPromise = client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (mockWebSocketInstance.onopen) {
        mockWebSocketInstance.onopen(new Event("open"));
      }
      await connectPromise;

      // Simulate disconnect
      if (mockWebSocketInstance.onclose) {
        mockWebSocketInstance.onclose({ reason: "Connection lost" } as CloseEvent);
      }

      // State should be reconnecting
      expect(client.getConnectionState()).toBe("reconnecting");
    });

    it("should call onError when max retries exceeded", async () => {
      const client = new KalshiWebSocketClient({
        autoReconnect: true,
        reconnect: {
          initialDelayMs: 1,
          maxRetries: 0, // No retries allowed
        },
      });

      const onErrorCb = mock(() => {});
      client.onError(onErrorCb);

      // Connect first
      const connectPromise = client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (mockWebSocketInstance.onopen) {
        mockWebSocketInstance.onopen(new Event("open"));
      }
      await connectPromise;

      // Simulate disconnect
      if (mockWebSocketInstance.onclose) {
        mockWebSocketInstance.onclose({ reason: "Connection lost" } as CloseEvent);
      }

      // Wait for error callback
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(onErrorCb).toHaveBeenCalled();
    });

    it("should not auto-reconnect when disabled", async () => {
      const client = new KalshiWebSocketClient({
        autoReconnect: false,
      });

      // Connect first
      const connectPromise = client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (mockWebSocketInstance.onopen) {
        mockWebSocketInstance.onopen(new Event("open"));
      }
      await connectPromise;

      // Simulate disconnect
      if (mockWebSocketInstance.onclose) {
        mockWebSocketInstance.onclose({ reason: "Connection lost" } as CloseEvent);
      }

      // Should stay disconnected, not reconnecting
      expect(client.getConnectionState()).toBe("disconnected");
    });
  });
});
