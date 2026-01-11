/**
 * Tests for WebSocket subscription and unsubscription
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { KalshiWebSocketClient } from "../index.js";
import {
  cleanupClients,
  connectClient,
  createMockWebSocket,
  createMockWebSocketProxy,
  type MockWebSocketInstance,
  type MockWebSocketState,
} from "./fixtures.js";

describe("KalshiWebSocketClient subscribe", () => {
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

  it("should send subscription message when connected", async () => {
    const client = new KalshiWebSocketClient();

    await connectClient(client, mockWsProxy);

    const callback = mock(() => {});
    client.subscribe("ticker", ["KXFED-26JAN29"], callback);

    expect(mockState.send).toHaveBeenCalled();
    const sentMessage = JSON.parse(mockState.send.mock.calls[0]?.[0] ?? "{}");
    expect(sentMessage.cmd).toBe("subscribe");
    expect(sentMessage.params.channels).toContain("ticker");
  });

  it("should queue subscriptions when not connected", () => {
    const client = new KalshiWebSocketClient();

    const callback = mock(() => {});
    client.subscribe("ticker", ["KXFED-26JAN29"], callback);

    expect(mockState.send).not.toHaveBeenCalled();
  });
});

describe("KalshiWebSocketClient unsubscribe", () => {
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

  it("should send unsubscribe message when connected", async () => {
    const client = new KalshiWebSocketClient();

    await connectClient(client, mockWsProxy);

    const callback = mock(() => {});
    client.subscribe("ticker", ["KXFED-26JAN29"], callback);

    mockState.send.mockClear();

    client.unsubscribe("ticker", ["KXFED-26JAN29"]);

    expect(mockState.send).toHaveBeenCalled();
    const sentMessage = JSON.parse(mockState.send.mock.calls[0]?.[0] ?? "{}");
    expect(sentMessage.cmd).toBe("unsubscribe");
  });

  it("should only unsubscribe specific callback", async () => {
    const client = new KalshiWebSocketClient();

    await connectClient(client, mockWsProxy);

    const callback1 = mock(() => {});
    const callback2 = mock(() => {});
    client.subscribe("ticker", ["KXFED-26JAN29"], callback1);
    client.subscribe("ticker", ["KXFED-26JAN29"], callback2);

    mockState.send.mockClear();

    client.unsubscribe("ticker", ["KXFED-26JAN29"], callback1);

    expect(mockState.send).not.toHaveBeenCalled();
  });
});
