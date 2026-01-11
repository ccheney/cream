/**
 * Tests for WebSocket message handling
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { KalshiWebSocketClient } from "../index.js";
import {
  cleanupClients,
  connectClient,
  createMarketLifecycleMessage,
  createMockWebSocket,
  createMockWebSocketProxy,
  createOrderbookDeltaMessage,
  createTickerMessage,
  createTradeMessage,
  type MockWebSocketInstance,
  type MockWebSocketState,
} from "./fixtures.js";

describe("KalshiWebSocketClient message handling", () => {
  let originalWebSocket: typeof WebSocket;
  let mockState: MockWebSocketState;
  let mockWsProxy: MockWebSocketInstance;
  const testClients: KalshiWebSocketClient[] = [];

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
    mockState = { instance: null, send: mock(() => {}) };
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket =
      createMockWebSocket(mockState);
    mockWsProxy = createMockWebSocketProxy(mockState);
    testClients.length = 0;
  });

  afterEach(() => {
    cleanupClients(testClients);
    globalThis.WebSocket = originalWebSocket;
  });

  it("should handle ticker messages and update cache", async () => {
    const client = new KalshiWebSocketClient();

    await connectClient(client, mockWsProxy);

    const callback = mock(() => {});
    client.subscribe("ticker", ["KXFED-26JAN29"], callback);

    const tickerMessage = createTickerMessage("KXFED-26JAN29");

    if (mockWsProxy.onmessage) {
      mockWsProxy.onmessage({
        data: JSON.stringify(tickerMessage),
      } as MessageEvent);
    }

    const state = client.getCache().get("KXFED-26JAN29");
    expect(state?.yesBid).toBe(55);
    expect(state?.yesAsk).toBe(57);
    expect(state?.lastPrice).toBe(56);
  });

  it("should notify subscribers on ticker message", async () => {
    const client = new KalshiWebSocketClient();

    await connectClient(client, mockWsProxy);

    const callback = mock(() => {});
    client.subscribe("ticker", ["KXFED-26JAN29"], callback);

    const tickerMessage = createTickerMessage("KXFED-26JAN29");

    if (mockWsProxy.onmessage) {
      mockWsProxy.onmessage({
        data: JSON.stringify(tickerMessage),
      } as MessageEvent);
    }

    expect(callback).toHaveBeenCalled();
  });

  it("should handle orderbook delta messages", async () => {
    const client = new KalshiWebSocketClient();

    await connectClient(client, mockWsProxy);

    const callback = mock(() => {});
    client.subscribe("orderbook_delta", ["KXFED-26JAN29"], callback);

    const message = createOrderbookDeltaMessage("KXFED-26JAN29");

    if (mockWsProxy.onmessage) {
      mockWsProxy.onmessage({
        data: JSON.stringify(message),
      } as MessageEvent);
    }

    expect(callback).toHaveBeenCalled();
  });

  it("should handle trade messages", async () => {
    const client = new KalshiWebSocketClient();

    await connectClient(client, mockWsProxy);

    const callback = mock(() => {});
    client.subscribe("trade", [], callback);

    const message = createTradeMessage("KXFED-26JAN29");

    if (mockWsProxy.onmessage) {
      mockWsProxy.onmessage({
        data: JSON.stringify(message),
      } as MessageEvent);
    }

    expect(callback).toHaveBeenCalled();
  });

  it("should handle market lifecycle messages", async () => {
    const client = new KalshiWebSocketClient();

    await connectClient(client, mockWsProxy);

    const callback = mock(() => {});
    client.subscribe("market_lifecycle_v2", ["KXFED-26JAN29"], callback);

    const message = createMarketLifecycleMessage("KXFED-26JAN29", "closed");

    if (mockWsProxy.onmessage) {
      mockWsProxy.onmessage({
        data: JSON.stringify(message),
      } as MessageEvent);
    }

    expect(callback).toHaveBeenCalled();
  });

  it("should ignore invalid JSON messages", async () => {
    const client = new KalshiWebSocketClient();

    await connectClient(client, mockWsProxy);

    if (mockWsProxy.onmessage) {
      mockWsProxy.onmessage({
        data: "not valid json",
      } as MessageEvent);
    }

    expect(client.getConnectionState()).toBe("connected");
  });

  it("should ignore invalid message types", async () => {
    const client = new KalshiWebSocketClient();

    await connectClient(client, mockWsProxy);

    const callback = mock(() => {});
    client.subscribe("ticker", ["KXFED-26JAN29"], callback);

    if (mockWsProxy.onmessage) {
      mockWsProxy.onmessage({
        data: JSON.stringify({ type: "unknown", msg: {} }),
      } as MessageEvent);
    }

    expect(callback).not.toHaveBeenCalled();
  });
});
