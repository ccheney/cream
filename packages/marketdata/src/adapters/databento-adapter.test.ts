/**
 * Tests for DatabentoMarketDataAdapter
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  ConnectionState,
  type DatabentoClient,
  type DatabentoEvent,
  type EventHandler,
} from "../providers/databento";
import { DatabentoMarketDataAdapter } from "./databento-adapter";

// ============================================
// Mock Client
// ============================================

function createMockClient(): DatabentoClient & {
  triggerEvent: (event: DatabentoEvent) => void;
} {
  const handlers: EventHandler[] = [];
  let state: ConnectionState = ConnectionState.DISCONNECTED;

  return {
    connect: mock(async () => {
      state = ConnectionState.AUTHENTICATED;
    }),
    disconnect: mock(() => {
      state = ConnectionState.DISCONNECTED;
    }),
    subscribe: mock(async () => {
      state = ConnectionState.SUBSCRIBED;
      return "sub-123";
    }),
    unsubscribe: mock(async () => {}),
    on: mock((handler: EventHandler) => {
      handlers.push(handler);
    }),
    off: mock(() => {}),
    getState: () => state,
    triggerEvent: (event: DatabentoEvent) => {
      for (const handler of handlers) {
        handler(event);
      }
    },
    // Needed for interface compatibility
    fetchHistorical: mock(async () => []),
  } as unknown as DatabentoClient & { triggerEvent: (event: DatabentoEvent) => void };
}

// ============================================
// Tests
// ============================================

describe("DatabentoMarketDataAdapter", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let adapter: DatabentoMarketDataAdapter;

  beforeEach(() => {
    mockClient = createMockClient();
    adapter = new DatabentoMarketDataAdapter(mockClient);
  });

  afterEach(() => {
    adapter.disconnect();
  });

  describe("initialization", () => {
    test("should create adapter with default config", () => {
      expect(adapter.getType()).toBe("databento");
      expect(adapter.isReady()).toBe(false);
    });

    test("should register event handler on client", () => {
      expect(mockClient.on).toHaveBeenCalled();
    });
  });

  describe("connect", () => {
    test("should connect and subscribe to symbols", async () => {
      await adapter.connect(["AAPL", "MSFT"]);

      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockClient.subscribe).toHaveBeenCalledTimes(2); // BBO + trades
      expect(adapter.isReady()).toBe(true);
    });

    test("should use custom dataset", async () => {
      await adapter.connect(["AAPL"], "GLBX.MDP3");

      expect(mockClient.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({ dataset: "GLBX.MDP3" })
      );
    });
  });

  describe("disconnect", () => {
    test("should disconnect and clear cache", async () => {
      await adapter.connect(["AAPL"]);

      // Add a cached quote
      mockClient.triggerEvent({
        type: "message",
        schema: "mbp-1",
        message: {
          symbol: "AAPL",
          bid_px: 150.0,
          ask_px: 150.1,
          bid_sz: 100,
          ask_sz: 200,
          ts_event: Date.now() * 1_000_000,
        },
      });

      adapter.disconnect();

      expect(adapter.isReady()).toBe(false);
      expect(await adapter.getQuote("AAPL")).toBeNull();
    });
  });

  describe("getQuote", () => {
    test("should return null when no cached quote", async () => {
      await adapter.connect(["AAPL"]);
      const quote = await adapter.getQuote("AAPL");
      expect(quote).toBeNull();
    });

    test("should return cached quote from mbp-1 message", async () => {
      await adapter.connect(["AAPL"]);

      mockClient.triggerEvent({
        type: "message",
        schema: "mbp-1",
        message: {
          symbol: "AAPL",
          bid_px: 150.0,
          ask_px: 150.1,
          bid_sz: 100,
          ask_sz: 200,
          ts_event: Date.now() * 1_000_000,
        },
      });

      const quote = await adapter.getQuote("AAPL");
      expect(quote).not.toBeNull();
      expect(quote?.symbol).toBe("AAPL");
      expect(quote?.bid).toBe(150.0);
      expect(quote?.ask).toBe(150.1);
      expect(quote?.bidSize).toBe(100);
      expect(quote?.askSize).toBe(200);
    });

    test("should return null for stale quotes", async () => {
      adapter = new DatabentoMarketDataAdapter(mockClient, {
        staleThresholdMs: 100,
      });

      await adapter.connect(["AAPL"]);

      mockClient.triggerEvent({
        type: "message",
        schema: "mbp-1",
        message: {
          symbol: "AAPL",
          bid_px: 150.0,
          ask_px: 150.1,
          bid_sz: 100,
          ask_sz: 200,
          ts_event: (Date.now() - 200) * 1_000_000,
        },
      });

      // Wait for staleness
      await new Promise((resolve) => setTimeout(resolve, 150));

      const quote = await adapter.getQuote("AAPL");
      expect(quote).toBeNull();
    });
  });

  describe("getQuotes", () => {
    test("should return map of quotes for multiple symbols", async () => {
      await adapter.connect(["AAPL", "MSFT"]);

      mockClient.triggerEvent({
        type: "message",
        schema: "mbp-1",
        message: {
          symbol: "AAPL",
          bid_px: 150.0,
          ask_px: 150.1,
          bid_sz: 100,
          ask_sz: 200,
          ts_event: Date.now() * 1_000_000,
        },
      });

      mockClient.triggerEvent({
        type: "message",
        schema: "mbp-1",
        message: {
          symbol: "MSFT",
          bid_px: 380.0,
          ask_px: 380.1,
          bid_sz: 50,
          ask_sz: 75,
          ts_event: Date.now() * 1_000_000,
        },
      });

      const quotes = await adapter.getQuotes(["AAPL", "MSFT"]);

      expect(quotes.size).toBe(2);
      expect(quotes.get("AAPL")?.bid).toBe(150.0);
      expect(quotes.get("MSFT")?.bid).toBe(380.0);
    });

    test("should exclude missing symbols from result", async () => {
      await adapter.connect(["AAPL", "MSFT"]);

      mockClient.triggerEvent({
        type: "message",
        schema: "mbp-1",
        message: {
          symbol: "AAPL",
          bid_px: 150.0,
          ask_px: 150.1,
          bid_sz: 100,
          ask_sz: 200,
          ts_event: Date.now() * 1_000_000,
        },
      });

      const quotes = await adapter.getQuotes(["AAPL", "GOOGL"]);

      expect(quotes.size).toBe(1);
      expect(quotes.has("AAPL")).toBe(true);
      expect(quotes.has("GOOGL")).toBe(false);
    });
  });

  describe("trade handling", () => {
    test("should update last price from trade message", async () => {
      await adapter.connect(["AAPL"]);

      // First add a quote
      mockClient.triggerEvent({
        type: "message",
        schema: "mbp-1",
        message: {
          symbol: "AAPL",
          bid_px: 150.0,
          ask_px: 150.1,
          bid_sz: 100,
          ask_sz: 200,
          ts_event: Date.now() * 1_000_000,
        },
      });

      // Then a trade
      mockClient.triggerEvent({
        type: "message",
        schema: "trades",
        message: {
          symbol: "AAPL",
          price: 150.05,
          size: 50,
          ts_event: Date.now() * 1_000_000,
        },
      });

      const quote = await adapter.getQuote("AAPL");
      expect(quote?.last).toBe(150.05);
    });
  });

  describe("connection events", () => {
    test("should handle disconnected event", async () => {
      await adapter.connect(["AAPL"]);
      expect(adapter.isReady()).toBe(true);

      mockClient.triggerEvent({
        type: "disconnected",
        reason: "Connection lost",
      });

      expect(adapter.isReady()).toBe(false);
    });
  });

  describe("getCandles", () => {
    test("should return empty array (not implemented)", async () => {
      const candles = await adapter.getCandles("AAPL", "1h", "2024-01-01", "2024-01-02");
      expect(candles).toEqual([]);
    });
  });
});
