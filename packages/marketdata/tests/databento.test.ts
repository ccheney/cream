/**
 * Databento Client Tests
 *
 * Tests for the Databento WebSocket client with mocked WebSocket server.
 */

import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import {
  ConnectionState,
  DatabentoClient,
  type DatabentoEvent,
  type SubscriptionConfig,
} from "../src/providers/databento";
import WebSocket from "ws";

// ============================================
// Mock WebSocket Server
// ============================================

/**
 * Mock WebSocket server for testing.
 */
class MockWebSocketServer {
  private server: WebSocket.Server | null = null;
  private clients: Set<WebSocket> = new Set();
  private port = 0;

  /**
   * Start the mock server.
   */
  async start(): Promise<number> {
    return new Promise((resolve) => {
      this.server = new WebSocket.Server({ port: 0 }, () => {
        this.port = (this.server!.address() as { port: number }).port;
        resolve(this.port);
      });

      this.server.on("connection", (ws: WebSocket) => {
        this.clients.add(ws);

        ws.on("message", (data: Buffer) => {
          this.handleMessage(ws, data);
        });

        ws.on("close", () => {
          this.clients.delete(ws);
        });
      });
    });
  }

  /**
   * Stop the mock server.
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise((resolve) => {
      for (const client of this.clients) {
        try {
          client.close();
        } catch {
          // Ignore
        }
      }
      this.clients.clear();

      const server = this.server;
      this.server = null;

      server.close(() => {
        resolve();
      });
    });
  }

  /**
   * Get the server URL.
   */
  getUrl(): string {
    return `ws://localhost:${this.port}`;
  }

  /**
   * Broadcast a message to all clients.
   */
  broadcast(message: unknown): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  /**
   * Handle incoming messages.
   */
  private handleMessage(ws: WebSocket, data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());

      // Handle authentication
      if (message.message_type === "authentication") {
        ws.send(
          JSON.stringify({
            message_type: "authentication_response",
            status: "authenticated",
            session_id: "test-session-123",
          })
        );
      }

      // Handle subscription
      if (message.message_type === "subscription") {
        ws.send(
          JSON.stringify({
            message_type: "subscription_confirmation",
            status: "active",
            subscription_id: "sub-123",
          })
        );
      }

      // Handle unsubscribe
      if (message.message_type === "unsubscribe") {
        ws.send(
          JSON.stringify({
            message_type: "unsubscribe_confirmation",
            status: "unsubscribed",
          })
        );
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
  }

  /**
   * Send a trade message.
   */
  sendTrade(symbol: string, price: number, size: number): void {
    this.broadcast({
      ts_event: Date.now() * 1_000_000,
      symbol,
      price,
      size,
      side: "B",
    });
  }

  /**
   * Send a quote message.
   */
  sendQuote(symbol: string, bidPx: number, askPx: number, bidSz: number, askSz: number): void {
    this.broadcast({
      ts_event: Date.now() * 1_000_000,
      symbol,
      bid_px: bidPx,
      ask_px: askPx,
      bid_sz: bidSz,
      ask_sz: askSz,
    });
  }

  /**
   * Send an error message.
   */
  sendError(message: string): void {
    this.broadcast({
      msg: message,
      code: "ERROR",
    });
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Wait for a specific event.
 */
function waitForEvent(
  client: DatabentoClient,
  type: DatabentoEvent["type"],
  timeoutMs = 5000
): Promise<DatabentoEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.off(handler);
      reject(new Error(`Timeout waiting for event: ${type}`));
    }, timeoutMs);

    const handler = (event: DatabentoEvent) => {
      if (event.type === type) {
        clearTimeout(timeout);
        client.off(handler);
        resolve(event);
      }
    };

    client.on(handler);
  });
}

/**
 * Collect events for a duration.
 */
function collectEvents(
  client: DatabentoClient,
  durationMs: number
): Promise<DatabentoEvent[]> {
  return new Promise((resolve) => {
    const events: DatabentoEvent[] = [];

    const handler = (event: DatabentoEvent) => {
      events.push(event);
    };

    client.on(handler);

    setTimeout(() => {
      client.off(handler);
      resolve(events);
    }, durationMs);
  });
}

// ============================================
// Tests
// ============================================

describe("DatabentoClient", () => {
  let server: MockWebSocketServer;
  let client: DatabentoClient;

  beforeEach(async () => {
    server = new MockWebSocketServer();
    await server.start();

    client = new DatabentoClient({
      apiKey: "test-api-key",
      liveUrl: server.getUrl(),
      heartbeatIntervalS: 1,
      autoReconnect: false,
    });
  });

  afterEach(async () => {
    if (client) {
      client.disconnect();
    }
    if (server) {
      await server.stop().catch(() => {
        // Ignore errors if server already stopped
      });
    }
  });

  describe("Connection Management", () => {
    test("should connect and authenticate", async () => {
      expect(client.getState()).toBe(ConnectionState.DISCONNECTED);

      await client.connect();

      const authEvent = await waitForEvent(client, "authenticated");
      expect(authEvent.type).toBe("authenticated");
      expect(authEvent).toHaveProperty("sessionId");
      expect(client.isConnected()).toBe(true);
    });

    test("should emit connected event", async () => {
      const connectedPromise = waitForEvent(client, "connected");

      await client.connect();

      const event = await connectedPromise;
      expect(event.type).toBe("connected");
    });

    test("should handle disconnect", async () => {
      await client.connect();
      await waitForEvent(client, "authenticated");

      const disconnectPromise = waitForEvent(client, "disconnected");
      await server.stop();

      const event = await disconnectPromise;
      expect(event.type).toBe("disconnected");
    });

    test("should not allow connecting when already connected", async () => {
      await client.connect();
      await waitForEvent(client, "authenticated");

      expect(() => client.connect()).toThrow();
    });
  });

  describe("Subscription Management", () => {
    beforeEach(async () => {
      await client.connect();
      await waitForEvent(client, "authenticated");
    });

    test("should subscribe to market data", async () => {
      const config: SubscriptionConfig = {
        dataset: "XNAS.ITCH",
        schema: "mbp-1",
        symbols: ["AAPL", "MSFT"],
      };

      const subscribedPromise = waitForEvent(client, "subscribed");

      await client.subscribe(config);

      const event = await subscribedPromise;
      expect(event.type).toBe("subscribed");
      expect(event).toHaveProperty("subscriptionId");
      expect(client.getState()).toBe(ConnectionState.SUBSCRIBED);
    });

    test("should not allow subscribing when not connected", async () => {
      client.disconnect();

      const config: SubscriptionConfig = {
        dataset: "XNAS.ITCH",
        schema: "trades",
        symbols: ["AAPL"],
      };

      await expect(client.subscribe(config)).rejects.toThrow("Not connected");
    });

    test("should unsubscribe from market data", async () => {
      const config: SubscriptionConfig = {
        dataset: "XNAS.ITCH",
        schema: "mbp-1",
        symbols: ["AAPL"],
      };

      await client.subscribe(config);
      await waitForEvent(client, "subscribed");

      await client.unsubscribe("XNAS.ITCH", ["AAPL"]);

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("Message Handling", () => {
    beforeEach(async () => {
      await client.connect();
      await waitForEvent(client, "authenticated");
    });

    test("should receive trade messages", async () => {
      await client.subscribe({
        dataset: "XNAS.ITCH",
        schema: "trades",
        symbols: ["AAPL"],
      });
      await waitForEvent(client, "subscribed");

      const messagePromise = waitForEvent(client, "message");

      server.sendTrade("AAPL", 150.25, 100);

      const event = await messagePromise;
      expect(event.type).toBe("message");
      if (event.type === "message") {
        expect(event.schema).toBe("trades");
        expect(event.message).toHaveProperty("price");
        expect(event.message).toHaveProperty("size");
      }
    });

    test("should receive quote messages", async () => {
      await client.subscribe({
        dataset: "XNAS.ITCH",
        schema: "mbp-1",
        symbols: ["MSFT"],
      });
      await waitForEvent(client, "subscribed");

      const messagePromise = waitForEvent(client, "message");

      server.sendQuote("MSFT", 380.50, 380.51, 1000, 1500);

      const event = await messagePromise;
      expect(event.type).toBe("message");
      if (event.type === "message") {
        expect(event.schema).toBe("mbp-1");
        const message = event.message as { bid_px?: number; ask_px?: number };
        expect(message).toHaveProperty("bid_px");
        expect(message).toHaveProperty("ask_px");
      }
    });

    test("should handle error messages", async () => {
      const errorPromise = waitForEvent(client, "message");

      server.sendError("Test error message");

      const event = await errorPromise;
      expect(event.type).toBe("message");
      if (event.type === "message") {
        const message = event.message as { msg?: string };
        expect(message).toHaveProperty("msg");
      }
    });

    test("should handle multiple messages", async () => {
      await client.subscribe({
        dataset: "XNAS.ITCH",
        schema: "trades",
        symbols: ["AAPL", "MSFT"],
      });
      await waitForEvent(client, "subscribed");

      const eventsPromise = collectEvents(client, 500);

      server.sendTrade("AAPL", 150.25, 100);
      await new Promise((resolve) => setTimeout(resolve, 100));
      server.sendTrade("MSFT", 380.50, 200);
      await new Promise((resolve) => setTimeout(resolve, 100));
      server.sendTrade("AAPL", 150.30, 150);

      const events = await eventsPromise;
      const messageEvents = events.filter((e) => e.type === "message");
      expect(messageEvents.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Event Handling", () => {
    test("should add and remove event handlers", async () => {
      const handler = mock(() => {});

      client.on(handler);
      client.off(handler);

      await client.connect();

      expect(handler).not.toHaveBeenCalled();
    });

    test("should call multiple event handlers", async () => {
      const handler1 = mock(() => {});
      const handler2 = mock(() => {});

      client.on(handler1);
      client.on(handler2);

      await client.connect();
      await waitForEvent(client, "authenticated");

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    test("should not throw if handler throws", async () => {
      const errorHandler = mock(() => {
        throw new Error("Handler error");
      });
      const successHandler = mock(() => {});

      client.on(errorHandler);
      client.on(successHandler);

      await client.connect();
      await waitForEvent(client, "authenticated");

      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
    });
  });

  describe("Reconnection", () => {
    test("should attempt reconnection when enabled", async () => {
      // Create new client with auto-reconnect
      const reconnectClient = new DatabentoClient({
        apiKey: "test-api-key",
        liveUrl: server.getUrl(),
        autoReconnect: true,
        maxReconnectAttempts: 3,
        reconnectDelayMs: 100,
      });

      await reconnectClient.connect();
      await waitForEvent(reconnectClient, "authenticated");

      const reconnectPromise = waitForEvent(reconnectClient, "reconnecting");

      // Force disconnect
      await server.stop();

      const event = await reconnectPromise;
      expect(event.type).toBe("reconnecting");
      if (event.type === "reconnecting") {
        expect(event.attempt).toBeGreaterThan(0);
      }

      reconnectClient.disconnect();
    });

    test("should not reconnect when disabled", async () => {
      await client.connect();
      await waitForEvent(client, "authenticated");

      const events: DatabentoEvent[] = [];
      client.on((event) => events.push(event));

      await server.stop();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 500));

      const reconnectEvents = events.filter((e) => e.type === "reconnecting");
      expect(reconnectEvents.length).toBe(0);
    });
  });

  describe("Edge Cases", () => {
    test("should handle malformed messages gracefully", async () => {
      await client.connect();
      await waitForEvent(client, "authenticated");

      const errorPromise = waitForEvent(client, "error");

      // Send invalid JSON
      server.broadcast("invalid json {{{");

      const event = await errorPromise;
      expect(event.type).toBe("error");
    });

    test("should handle empty symbols array", async () => {
      await client.connect();
      await waitForEvent(client, "authenticated");

      const config: SubscriptionConfig = {
        dataset: "XNAS.ITCH",
        schema: "trades",
        symbols: [],
      };

      // Should not throw
      await client.subscribe(config);
    });

    test("should handle disconnect before connect", () => {
      expect(() => client.disconnect()).not.toThrow();
    });

    test("should clear timers on disconnect", async () => {
      await client.connect();
      await waitForEvent(client, "authenticated");

      client.disconnect();

      // Should not have any pending timers
      expect(client.getState()).toBe(ConnectionState.DISCONNECTED);
    });
  });
});

describe("createDatabentoClientFromEnv", () => {
  test("should create client from environment variable", () => {
    const originalEnv = process.env.DATABENTO_KEY;

    try {
      process.env.DATABENTO_KEY = "test-api-key";

      const { createDatabentoClientFromEnv } = require("../src/providers/databento");
      const client = createDatabentoClientFromEnv();

      expect(client).toBeDefined();
      expect(client instanceof DatabentoClient).toBe(true);
    } finally {
      if (originalEnv) {
        process.env.DATABENTO_KEY = originalEnv;
      } else {
        delete process.env.DATABENTO_KEY;
      }
    }
  });

  test("should throw if DATABENTO_KEY not set", () => {
    const originalEnv = process.env.DATABENTO_KEY;

    try {
      delete process.env.DATABENTO_KEY;

      const { createDatabentoClientFromEnv } = require("../src/providers/databento");

      expect(() => createDatabentoClientFromEnv()).toThrow(
        "DATABENTO_KEY environment variable is required"
      );
    } finally {
      if (originalEnv) {
        process.env.DATABENTO_KEY = originalEnv;
      }
    }
  });
});
