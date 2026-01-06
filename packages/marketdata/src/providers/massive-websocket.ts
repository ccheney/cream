/**
 * Massive (formerly Polygon.io) WebSocket Client
 *
 * Provides real-time streaming market data:
 * - Stock aggregates (per-minute, per-second)
 * - Stock trades
 * - Stock quotes
 * - Options trades and quotes (separate connection)
 *
 * Uses WebSocket for live streaming with automatic reconnection.
 *
 * @see https://massive.com/docs/websocket/quickstart
 * @see docs/plans/02-data-layer.md
 */

import WebSocket from "ws";
import { z } from "zod";

// ============================================
// API Configuration
// ============================================

/**
 * WebSocket endpoints by plan tier and market.
 * Starter plan uses delayed endpoints (15-min delay).
 * Advanced plan uses real-time endpoints.
 */
const MASSIVE_WS_ENDPOINTS = {
  stocks: {
    delayed: "wss://delayed.massive.com/stocks",
    realtime: "wss://socket.massive.com/stocks",
  },
  options: {
    delayed: "wss://delayed.massive.com/options",
    realtime: "wss://socket.massive.com/options",
  },
  forex: {
    delayed: "wss://delayed.massive.com/forex",
    realtime: "wss://socket.massive.com/forex",
  },
  crypto: {
    delayed: "wss://delayed.massive.com/crypto",
    realtime: "wss://socket.massive.com/crypto",
  },
} as const;

/**
 * Massive subscription channel types.
 */
export type MassiveChannel =
  // Stocks
  | "AM" // Aggregates (Per Minute)
  | "AS" // Aggregates (Per Second)
  | "T" // Trades
  | "Q" // Quotes
  // Options
  | "A" // Options Aggregates (Per Minute)
  | "AM" // Options Aggregates (Per Minute) - same as stocks
  | "T" // Options Trades - same as stocks
  | "Q"; // Options Quotes - same as stocks

/**
 * Market type for connection.
 */
export type MassiveMarket = "stocks" | "options" | "forex" | "crypto";

/**
 * Feed type (delayed or real-time based on subscription).
 */
export type MassiveFeed = "delayed" | "realtime";

// ============================================
// Message Schemas
// ============================================

/**
 * Status message schema (connection/auth status).
 */
export const MassiveStatusMessageSchema = z.object({
  ev: z.literal("status"),
  status: z.enum(["connected", "auth_success", "auth_failed", "success", "error"]),
  message: z.string().optional(),
});
export type MassiveStatusMessage = z.infer<typeof MassiveStatusMessageSchema>;

/**
 * Aggregate (OHLCV) message schema.
 * Event types: AM (per-minute), AS (per-second), A (options per-minute)
 */
export const MassiveAggregateMessageSchema = z.object({
  ev: z.enum(["AM", "AS", "A"]),
  sym: z.string(), // Symbol
  v: z.number(), // Volume
  av: z.number().optional(), // Accumulated volume (day)
  op: z.number().optional(), // Official opening price
  vw: z.number().optional(), // Volume weighted average price
  o: z.number(), // Open
  c: z.number(), // Close
  h: z.number(), // High
  l: z.number(), // Low
  a: z.number().optional(), // VWAP (today's aggregate)
  z: z.number().optional(), // Average trade size
  s: z.number(), // Start timestamp (ms)
  e: z.number(), // End timestamp (ms)
  otc: z.boolean().optional(), // OTC flag
  // Options-specific
  x: z.string().optional(), // Exchange
});
export type MassiveAggregateMessage = z.infer<typeof MassiveAggregateMessageSchema>;

/**
 * Trade message schema.
 */
export const MassiveTradeMessageSchema = z.object({
  ev: z.literal("T"),
  sym: z.string(), // Symbol
  x: z.number().optional(), // Exchange ID
  i: z.string().optional(), // Trade ID
  z: z.number().optional(), // Tape
  p: z.number(), // Price
  s: z.number(), // Size
  c: z.array(z.number()).optional(), // Trade conditions
  t: z.number(), // Timestamp (ns)
  q: z.number().optional(), // Sequence number
  trfi: z.number().optional(), // TRF ID
  trft: z.number().optional(), // TRF timestamp
});
export type MassiveTradeMessage = z.infer<typeof MassiveTradeMessageSchema>;

/**
 * Quote message schema.
 */
export const MassiveQuoteMessageSchema = z.object({
  ev: z.literal("Q"),
  sym: z.string(), // Symbol
  bx: z.number().optional(), // Bid exchange ID
  bp: z.number(), // Bid price
  bs: z.number(), // Bid size
  ax: z.number().optional(), // Ask exchange ID
  ap: z.number(), // Ask price
  as: z.number(), // Ask size
  c: z.number().optional(), // Quote condition
  i: z.array(z.number()).optional(), // Indicators
  t: z.number(), // Timestamp (ns)
  z: z.number().optional(), // Tape
  q: z.number().optional(), // Sequence number
});
export type MassiveQuoteMessage = z.infer<typeof MassiveQuoteMessageSchema>;

/**
 * Union of all Massive message types.
 */
export type MassiveMessage =
  | MassiveStatusMessage
  | MassiveAggregateMessage
  | MassiveTradeMessage
  | MassiveQuoteMessage;

// ============================================
// Client Configuration
// ============================================

/**
 * Massive WebSocket client configuration.
 */
export interface MassiveWebSocketConfig {
  /** Massive/Polygon API key */
  apiKey: string;
  /** Market to connect to (default: stocks) */
  market?: MassiveMarket;
  /** Feed type - delayed (15-min) or realtime (default: delayed) */
  feed?: MassiveFeed;
  /** Enable auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Max reconnection attempts (default: 10) */
  maxReconnectAttempts?: number;
  /** Reconnection delay in milliseconds (default: 1000) */
  reconnectDelayMs?: number;
  /** Ping interval in seconds (default: 30) */
  pingIntervalS?: number;
}

// ============================================
// Connection State
// ============================================

/**
 * WebSocket connection state.
 */
export enum MassiveConnectionState {
  DISCONNECTED = "DISCONNECTED",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  AUTHENTICATING = "AUTHENTICATING",
  AUTHENTICATED = "AUTHENTICATED",
  ERROR = "ERROR",
}

// ============================================
// Event Types
// ============================================

/**
 * Event types emitted by the client.
 */
export type MassiveEvent =
  | { type: "connected" }
  | { type: "authenticated" }
  | { type: "subscribed"; params: string }
  | { type: "unsubscribed"; params: string }
  | { type: "aggregate"; message: MassiveAggregateMessage }
  | { type: "trade"; message: MassiveTradeMessage }
  | { type: "quote"; message: MassiveQuoteMessage }
  | { type: "error"; error: Error; message?: string }
  | { type: "disconnected"; reason: string }
  | { type: "reconnecting"; attempt: number };

/**
 * Event handler type.
 */
export type MassiveEventHandler = (event: MassiveEvent) => void | Promise<void>;

// ============================================
// Massive WebSocket Client
// ============================================

/**
 * Massive WebSocket client for real-time market data streaming.
 *
 * Manages WebSocket connections, authentication, subscriptions,
 * and automatic reconnection with exponential backoff.
 *
 * @example
 * ```typescript
 * const client = new MassiveWebSocketClient({ apiKey: 'xxx' });
 *
 * client.on((event) => {
 *   if (event.type === 'aggregate') {
 *     console.log(`${event.message.sym}: $${event.message.c}`);
 *   }
 * });
 *
 * await client.connect();
 * await client.subscribe(['AM.AAPL', 'AM.MSFT']); // Per-minute aggregates
 * ```
 */
export class MassiveWebSocketClient {
  private config: Required<MassiveWebSocketConfig>;
  private ws: WebSocket | null = null;
  private state: MassiveConnectionState = MassiveConnectionState.DISCONNECTED;
  private eventHandlers: MassiveEventHandler[] = [];
  private activeSubscriptions: Set<string> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastPongTime = 0;

  constructor(config: MassiveWebSocketConfig) {
    this.config = {
      apiKey: config.apiKey,
      market: config.market ?? "stocks",
      feed: config.feed ?? "delayed",
      autoReconnect: config.autoReconnect ?? true,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      reconnectDelayMs: config.reconnectDelayMs ?? 1000,
      pingIntervalS: config.pingIntervalS ?? 30,
    };
  }

  /**
   * Get current connection state.
   */
  getState(): MassiveConnectionState {
    return this.state;
  }

  /**
   * Check if connected and authenticated.
   */
  isConnected(): boolean {
    return this.state === MassiveConnectionState.AUTHENTICATED;
  }

  /**
   * Get active subscriptions.
   */
  getSubscriptions(): string[] {
    return Array.from(this.activeSubscriptions);
  }

  /**
   * Get WebSocket endpoint URL based on config.
   */
  private getEndpoint(): string {
    const endpoints = MASSIVE_WS_ENDPOINTS[this.config.market];
    return endpoints[this.config.feed];
  }

  /**
   * Add an event handler.
   */
  on(handler: MassiveEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Remove an event handler.
   */
  off(handler: MassiveEventHandler): void {
    this.eventHandlers = this.eventHandlers.filter((h) => h !== handler);
  }

  /**
   * Emit an event to all handlers.
   */
  private emit(event: MassiveEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        void handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }

  /**
   * Connect to the WebSocket server.
   */
  async connect(): Promise<void> {
    if (this.state !== MassiveConnectionState.DISCONNECTED) {
      throw new Error(`Cannot connect in state: ${this.state}`);
    }

    this.state = MassiveConnectionState.CONNECTING;
    const endpoint = this.getEndpoint();

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(endpoint);

        this.ws.on("open", () => {
          this.state = MassiveConnectionState.CONNECTED;
          this.emit({ type: "connected" });
          // Server sends status message on connect, auth happens in handleMessage
        });

        this.ws.on("message", (data: Buffer) => {
          this.handleMessage(data, resolve);
        });

        this.ws.on("error", (error: Error) => {
          this.handleError(error);
          if (this.state === MassiveConnectionState.CONNECTING) {
            reject(error);
          }
        });

        this.ws.on("close", (code: number, reason: Buffer) => {
          this.handleClose(code, reason.toString());
        });

        this.ws.on("pong", () => {
          this.lastPongTime = Date.now();
        });
      } catch (error) {
        this.state = MassiveConnectionState.ERROR;
        reject(error);
      }
    });
  }

  /**
   * Send authentication message.
   */
  private authenticate(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not ready for authentication");
    }

    this.state = MassiveConnectionState.AUTHENTICATING;
    this.send({ action: "auth", params: this.config.apiKey });
  }

  /**
   * Subscribe to channels.
   *
   * @param params - Array of channel subscriptions (e.g., ['AM.AAPL', 'T.MSFT', 'Q.*'])
   *
   * Channel format: CHANNEL.SYMBOL
   * - AM.AAPL - Per-minute aggregates for AAPL
   * - AS.AAPL - Per-second aggregates for AAPL
   * - T.AAPL - Trades for AAPL
   * - Q.AAPL - Quotes for AAPL
   * - AM.* - Per-minute aggregates for all symbols
   */
  async subscribe(params: string[]): Promise<void> {
    if (!this.isConnected()) {
      throw new Error("Not authenticated. Call connect() first.");
    }

    const paramsStr = params.join(",");
    this.send({ action: "subscribe", params: paramsStr });

    // Track subscriptions for reconnection
    for (const param of params) {
      this.activeSubscriptions.add(param);
    }
  }

  /**
   * Unsubscribe from channels.
   *
   * @param params - Array of channel subscriptions to remove
   */
  async unsubscribe(params: string[]): Promise<void> {
    if (!this.isConnected()) {
      throw new Error("Not authenticated");
    }

    const paramsStr = params.join(",");
    this.send({ action: "unsubscribe", params: paramsStr });

    // Remove from tracked subscriptions
    for (const param of params) {
      this.activeSubscriptions.delete(param);
    }

    this.emit({ type: "unsubscribed", params: paramsStr });
  }

  /**
   * Disconnect from the WebSocket.
   */
  disconnect(): void {
    this.clearTimers();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.state = MassiveConnectionState.DISCONNECTED;
    this.reconnectAttempts = 0;
  }

  /**
   * Send a message over the WebSocket.
   */
  private send(message: { action: string; params: string }): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not ready");
    }

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Handle incoming WebSocket messages.
   */
  private handleMessage(data: Buffer, connectResolve?: (value: void) => void): void {
    try {
      const text = data.toString("utf-8");

      // Massive sends arrays of messages
      let messages: unknown[];
      try {
        const parsed = JSON.parse(text);
        messages = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return;
      }

      for (const msg of messages) {
        if (typeof msg !== "object" || msg === null) {
          continue;
        }

        const msgObj = msg as Record<string, unknown>;
        const ev = msgObj.ev as string;

        // Handle status messages
        if (ev === "status") {
          const status = msgObj.status as string;

          if (status === "connected") {
            // Server confirmed connection, now authenticate
            this.authenticate();
          } else if (status === "auth_success") {
            this.state = MassiveConnectionState.AUTHENTICATED;
            this.emit({ type: "authenticated" });
            this.startPing();
            this.reconnectAttempts = 0;

            // Resubscribe if reconnecting
            if (this.activeSubscriptions.size > 0) {
              const subs = Array.from(this.activeSubscriptions);
              this.send({ action: "subscribe", params: subs.join(",") });
            }

            // Resolve connect promise
            if (connectResolve) {
              connectResolve();
            }
          } else if (status === "auth_failed") {
            const error = new Error(`Authentication failed: ${msgObj.message ?? "Unknown error"}`);
            this.state = MassiveConnectionState.ERROR;
            this.emit({ type: "error", error, message: msgObj.message as string });
          } else if (status === "success" && msgObj.message) {
            // Subscription confirmation
            this.emit({ type: "subscribed", params: msgObj.message as string });
          } else if (status === "error") {
            this.emit({
              type: "error",
              error: new Error(String(msgObj.message ?? "Unknown error")),
              message: msgObj.message as string,
            });
          }
          continue;
        }

        // Handle market data messages
        if (ev === "AM" || ev === "AS" || ev === "A") {
          const aggregate = MassiveAggregateMessageSchema.safeParse(msgObj);
          if (aggregate.success) {
            this.emit({ type: "aggregate", message: aggregate.data });
          }
        } else if (ev === "T") {
          const trade = MassiveTradeMessageSchema.safeParse(msgObj);
          if (trade.success) {
            this.emit({ type: "trade", message: trade.data });
          }
        } else if (ev === "Q") {
          const quote = MassiveQuoteMessageSchema.safeParse(msgObj);
          if (quote.success) {
            this.emit({ type: "quote", message: quote.data });
          }
        }
      }
    } catch (error) {
      this.emit({
        type: "error",
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Handle WebSocket errors.
   */
  private handleError(error: Error): void {
    this.state = MassiveConnectionState.ERROR;
    this.emit({ type: "error", error });
  }

  /**
   * Handle WebSocket close.
   */
  private handleClose(code: number, reason: string): void {
    this.clearTimers();
    this.ws = null;

    const message = reason || `Connection closed with code ${code}`;
    this.emit({ type: "disconnected", reason: message });

    if (this.config.autoReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.scheduleReconnect();
    } else {
      this.state = MassiveConnectionState.DISCONNECTED;
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   */
  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 64s (max)
    const delay = Math.min(this.config.reconnectDelayMs * 2 ** (this.reconnectAttempts - 1), 64000);

    this.emit({ type: "reconnecting", attempt: this.reconnectAttempts });

    this.reconnectTimer = setTimeout(() => {
      this.state = MassiveConnectionState.DISCONNECTED;
      this.connect().catch(() => {
        if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          this.state = MassiveConnectionState.DISCONNECTED;
          this.emit({
            type: "error",
            error: new Error("Max reconnection attempts reached"),
          });
        }
      });
    }, delay);
  }

  /**
   * Start ping timer to keep connection alive.
   */
  private startPing(): void {
    this.lastPongTime = Date.now();

    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Check if we've received a pong recently
        const timeSinceLastPong = Date.now() - this.lastPongTime;
        if (timeSinceLastPong > this.config.pingIntervalS * 2 * 1000) {
          // Connection seems dead, trigger reconnect
          this.ws.close();
          return;
        }

        this.ws.ping();
      }
    }, this.config.pingIntervalS * 1000);
  }

  /**
   * Clear all timers.
   */
  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a Massive WebSocket client for stocks from environment variables.
 */
export function createMassiveStocksClientFromEnv(
  feed: MassiveFeed = "delayed"
): MassiveWebSocketClient {
  const apiKey = process.env.POLYGON_KEY ?? Bun.env.POLYGON_KEY;
  if (!apiKey) {
    throw new Error("POLYGON_KEY environment variable is required");
  }

  return new MassiveWebSocketClient({
    apiKey,
    market: "stocks",
    feed,
  });
}

/**
 * Create a Massive WebSocket client for options from environment variables.
 */
export function createMassiveOptionsClientFromEnv(
  feed: MassiveFeed = "delayed"
): MassiveWebSocketClient {
  const apiKey = process.env.POLYGON_KEY ?? Bun.env.POLYGON_KEY;
  if (!apiKey) {
    throw new Error("POLYGON_KEY environment variable is required");
  }

  return new MassiveWebSocketClient({
    apiKey,
    market: "options",
    feed,
  });
}

/**
 * Create a Massive WebSocket client with custom config from environment.
 */
export function createMassiveWebSocketClientFromEnv(
  market: MassiveMarket = "stocks",
  feed: MassiveFeed = "delayed"
): MassiveWebSocketClient {
  const apiKey = process.env.POLYGON_KEY ?? Bun.env.POLYGON_KEY;
  if (!apiKey) {
    throw new Error("POLYGON_KEY environment variable is required");
  }

  return new MassiveWebSocketClient({
    apiKey,
    market,
    feed,
  });
}
