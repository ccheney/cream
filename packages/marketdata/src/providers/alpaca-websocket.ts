/**
 * Alpaca Markets WebSocket Client
 *
 * Real-time streaming market data via WebSocket.
 *
 * Supports:
 * - Stock quotes, trades, and bars
 * - Options quotes and trades
 * - Crypto quotes, trades, and bars
 *
 * Endpoints:
 * - Stocks (SIP): wss://stream.data.alpaca.markets/v2/sip
 * - Stocks (IEX): wss://stream.data.alpaca.markets/v2/iex
 * - Options: wss://stream.data.alpaca.markets/v1beta1/options
 * - Crypto: wss://stream.data.alpaca.markets/v1beta3/crypto/us
 * - Test: wss://stream.data.alpaca.markets/v2/test
 *
 * @see https://docs.alpaca.markets/docs/streaming-market-data
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import WebSocket from "ws";
import { z } from "zod";

// ============================================
// Constants & Endpoints
// ============================================

const ALPACA_WS_ENDPOINTS = {
  stocks: {
    sip: "wss://stream.data.alpaca.markets/v2/sip", // Full market (Algo Trader Plus)
    iex: "wss://stream.data.alpaca.markets/v2/iex", // IEX only (Basic)
    test: "wss://stream.data.alpaca.markets/v2/test", // Test stream (24/5)
  },
  options: {
    opra: "wss://stream.data.alpaca.markets/v1beta1/options",
  },
  crypto: {
    us: "wss://stream.data.alpaca.markets/v1beta3/crypto/us",
  },
} as const;

// ============================================
// Message Schemas
// ============================================

export const AlpacaWsQuoteMessageSchema = z.object({
  T: z.literal("q"), // Message type
  S: z.string(), // Symbol
  bx: z.string().optional(), // Bid exchange
  bp: z.number(), // Bid price
  bs: z.number(), // Bid size
  ax: z.string().optional(), // Ask exchange
  ap: z.number(), // Ask price
  as: z.number(), // Ask size
  t: z.string(), // Timestamp (RFC-3339)
  c: z.array(z.string()).optional(), // Conditions
  z: z.string().optional(), // Tape
});
export type AlpacaWsQuoteMessage = z.infer<typeof AlpacaWsQuoteMessageSchema>;

export const AlpacaWsTradeMessageSchema = z.object({
  T: z.literal("t"), // Message type
  S: z.string(), // Symbol
  i: z.number().optional(), // Trade ID
  x: z.string().optional(), // Exchange
  p: z.number(), // Price
  s: z.number(), // Size
  t: z.string(), // Timestamp (RFC-3339)
  c: z.array(z.string()).optional(), // Conditions
  z: z.string().optional(), // Tape
});
export type AlpacaWsTradeMessage = z.infer<typeof AlpacaWsTradeMessageSchema>;

export const AlpacaWsBarMessageSchema = z.object({
  T: z.enum(["b", "d", "u"]), // b=minute, d=daily, u=updated
  S: z.string(), // Symbol
  o: z.number(), // Open
  h: z.number(), // High
  l: z.number(), // Low
  c: z.number(), // Close
  v: z.number(), // Volume
  t: z.string(), // Timestamp (RFC-3339)
  vw: z.number().optional(), // VWAP
  n: z.number().optional(), // Trade count
});
export type AlpacaWsBarMessage = z.infer<typeof AlpacaWsBarMessageSchema>;

export const AlpacaWsStatusMessageSchema = z.object({
  T: z.literal("s"), // Status message type
  S: z.string(), // Symbol
  sc: z.string().optional(), // Status code
  sm: z.string().optional(), // Status message
  rc: z.string().optional(), // Reason code
  rm: z.string().optional(), // Reason message
  t: z.string().optional(), // Timestamp
  z: z.string().optional(), // Tape
});
export type AlpacaWsStatusMessage = z.infer<typeof AlpacaWsStatusMessageSchema>;

export const AlpacaWsSuccessMessageSchema = z.object({
  T: z.literal("success"),
  msg: z.enum(["connected", "authenticated"]),
});
export type AlpacaWsSuccessMessage = z.infer<typeof AlpacaWsSuccessMessageSchema>;

export const AlpacaWsErrorMessageSchema = z.object({
  T: z.literal("error"),
  code: z.number(),
  msg: z.string(),
});
export type AlpacaWsErrorMessage = z.infer<typeof AlpacaWsErrorMessageSchema>;

export const AlpacaWsSubscriptionMessageSchema = z.object({
  T: z.literal("subscription"),
  trades: z.array(z.string()).optional(),
  quotes: z.array(z.string()).optional(),
  bars: z.array(z.string()).optional(),
  dailyBars: z.array(z.string()).optional(),
  updatedBars: z.array(z.string()).optional(),
  statuses: z.array(z.string()).optional(),
  lulds: z.array(z.string()).optional(),
});
export type AlpacaWsSubscriptionMessage = z.infer<typeof AlpacaWsSubscriptionMessageSchema>;

export type AlpacaWsMessage =
  | AlpacaWsQuoteMessage
  | AlpacaWsTradeMessage
  | AlpacaWsBarMessage
  | AlpacaWsStatusMessage
  | AlpacaWsSuccessMessage
  | AlpacaWsErrorMessage
  | AlpacaWsSubscriptionMessage;

// ============================================
// Configuration Types
// ============================================

export type AlpacaWsFeed = "sip" | "iex" | "test";
export type AlpacaWsMarket = "stocks" | "options" | "crypto";

export interface AlpacaWebSocketConfig {
  /** Alpaca API key */
  apiKey: string;
  /** Alpaca API secret */
  apiSecret: string;
  /** Market to connect to (default: stocks) */
  market?: AlpacaWsMarket;
  /** Data feed (default: sip for Algo Trader Plus) */
  feed?: AlpacaWsFeed;
  /** Enable auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Max reconnection attempts (default: 10) */
  maxReconnectAttempts?: number;
  /** Reconnection delay in milliseconds (default: 1000) */
  reconnectDelayMs?: number;
  /** Ping interval in seconds (default: 30) */
  pingIntervalS?: number;
}

export enum AlpacaConnectionState {
  DISCONNECTED = "DISCONNECTED",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  AUTHENTICATING = "AUTHENTICATING",
  AUTHENTICATED = "AUTHENTICATED",
  ERROR = "ERROR",
}

export type AlpacaWsEvent =
  | { type: "connected" }
  | { type: "authenticated" }
  | { type: "subscribed"; subscriptions: AlpacaWsSubscriptionMessage }
  | { type: "quote"; message: AlpacaWsQuoteMessage }
  | { type: "trade"; message: AlpacaWsTradeMessage }
  | { type: "bar"; message: AlpacaWsBarMessage }
  | { type: "status"; message: AlpacaWsStatusMessage }
  | { type: "error"; code: number; message: string }
  | { type: "disconnected"; reason: string }
  | { type: "reconnecting"; attempt: number };

export type AlpacaWsEventHandler = (event: AlpacaWsEvent) => void | Promise<void>;

// ============================================
// WebSocket Client
// ============================================

/**
 * Alpaca WebSocket client for real-time market data streaming.
 *
 * Manages WebSocket connections, authentication, subscriptions,
 * and automatic reconnection with exponential backoff.
 *
 * @example
 * ```typescript
 * const client = new AlpacaWebSocketClient({
 *   apiKey: process.env.ALPACA_KEY!,
 *   apiSecret: process.env.ALPACA_SECRET!,
 *   market: 'stocks',
 *   feed: 'sip', // Full market (Algo Trader Plus)
 * });
 *
 * client.on((event) => {
 *   if (event.type === 'quote') {
 *     console.log(`${event.message.S}: $${event.message.bp}/$${event.message.ap}`);
 *   }
 * });
 *
 * await client.connect();
 * client.subscribe('quotes', ['AAPL', 'MSFT']);
 * client.subscribe('bars', ['AAPL', 'MSFT']);
 * ```
 */
export class AlpacaWebSocketClient {
  private config: Required<AlpacaWebSocketConfig>;
  private ws: WebSocket | null = null;
  private state: AlpacaConnectionState = AlpacaConnectionState.DISCONNECTED;
  private eventHandlers: AlpacaWsEventHandler[] = [];
  private activeSubscriptions: {
    trades: Set<string>;
    quotes: Set<string>;
    bars: Set<string>;
    dailyBars: Set<string>;
    updatedBars: Set<string>;
    statuses: Set<string>;
  } = {
    trades: new Set(),
    quotes: new Set(),
    bars: new Set(),
    dailyBars: new Set(),
    updatedBars: new Set(),
    statuses: new Set(),
  };
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastPongTime = 0;

  constructor(config: AlpacaWebSocketConfig) {
    this.config = {
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      market: config.market ?? "stocks",
      feed: config.feed ?? "sip",
      autoReconnect: config.autoReconnect ?? true,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      reconnectDelayMs: config.reconnectDelayMs ?? 1000,
      pingIntervalS: config.pingIntervalS ?? 30,
    };
  }

  /**
   * Get current connection state.
   */
  getState(): AlpacaConnectionState {
    return this.state;
  }

  /**
   * Check if connected and authenticated.
   */
  isConnected(): boolean {
    return this.state === AlpacaConnectionState.AUTHENTICATED;
  }

  /**
   * Get active subscriptions.
   */
  getSubscriptions(): {
    trades: string[];
    quotes: string[];
    bars: string[];
    dailyBars: string[];
    updatedBars: string[];
    statuses: string[];
  } {
    return {
      trades: Array.from(this.activeSubscriptions.trades),
      quotes: Array.from(this.activeSubscriptions.quotes),
      bars: Array.from(this.activeSubscriptions.bars),
      dailyBars: Array.from(this.activeSubscriptions.dailyBars),
      updatedBars: Array.from(this.activeSubscriptions.updatedBars),
      statuses: Array.from(this.activeSubscriptions.statuses),
    };
  }

  /**
   * Get WebSocket endpoint URL based on config.
   */
  private getEndpoint(): string {
    if (this.config.market === "stocks") {
      return ALPACA_WS_ENDPOINTS.stocks[this.config.feed];
    }
    if (this.config.market === "options") {
      return ALPACA_WS_ENDPOINTS.options.opra;
    }
    return ALPACA_WS_ENDPOINTS.crypto.us;
  }

  /**
   * Add an event handler.
   */
  on(handler: AlpacaWsEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Remove an event handler.
   */
  off(handler: AlpacaWsEventHandler): void {
    this.eventHandlers = this.eventHandlers.filter((h) => h !== handler);
  }

  private emit(event: AlpacaWsEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        void handler(event);
      } catch {
        // Handler errors must not crash the WebSocket client
      }
    }
  }

  /**
   * Connect to the WebSocket server.
   */
  async connect(): Promise<void> {
    if (this.state !== AlpacaConnectionState.DISCONNECTED) {
      throw new Error(`Cannot connect in state: ${this.state}`);
    }

    this.state = AlpacaConnectionState.CONNECTING;
    const endpoint = this.getEndpoint();

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(endpoint);

        this.ws.on("open", () => {
          this.state = AlpacaConnectionState.CONNECTED;
        });

        this.ws.on("message", (data: Buffer) => {
          this.handleMessage(data, resolve);
        });

        this.ws.on("error", (error: Error) => {
          this.handleError(error);
          if (this.state === AlpacaConnectionState.CONNECTING) {
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
        this.state = AlpacaConnectionState.ERROR;
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

    this.state = AlpacaConnectionState.AUTHENTICATING;
    this.send({
      action: "auth",
      key: this.config.apiKey,
      secret: this.config.apiSecret,
    });
  }

  /**
   * Subscribe to a channel for symbols.
   *
   * @param channel - Channel type (trades, quotes, bars, dailyBars, updatedBars, statuses)
   * @param symbols - Array of symbols to subscribe to (use "*" for all)
   */
  subscribe(
    channel: "trades" | "quotes" | "bars" | "dailyBars" | "updatedBars" | "statuses",
    symbols: string[]
  ): void {
    if (!this.isConnected()) {
      throw new Error("Not authenticated. Call connect() first.");
    }

    this.send({
      action: "subscribe",
      [channel]: symbols,
    });

    for (const symbol of symbols) {
      this.activeSubscriptions[channel].add(symbol);
    }
  }

  /**
   * Unsubscribe from a channel for symbols.
   *
   * @param channel - Channel type
   * @param symbols - Array of symbols to unsubscribe from
   */
  unsubscribe(
    channel: "trades" | "quotes" | "bars" | "dailyBars" | "updatedBars" | "statuses",
    symbols: string[]
  ): void {
    if (!this.isConnected()) {
      throw new Error("Not authenticated");
    }

    this.send({
      action: "unsubscribe",
      [channel]: symbols,
    });

    for (const symbol of symbols) {
      this.activeSubscriptions[channel].delete(symbol);
    }
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

    this.state = AlpacaConnectionState.DISCONNECTED;
    this.reconnectAttempts = 0;
  }

  /**
   * Send a message over the WebSocket.
   */
  private send(message: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not ready");
    }

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Handle incoming WebSocket messages.
   */
  private handleMessage(data: Buffer, connectResolve?: (value: undefined) => void): void {
    try {
      const text = data.toString("utf-8");

      // Alpaca sends arrays of messages
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
        const type = msgObj.T as string;

        // Handle success messages
        if (type === "success") {
          const successMsg = msgObj.msg as string;

          if (successMsg === "connected") {
            this.emit({ type: "connected" });
            this.authenticate();
          } else if (successMsg === "authenticated") {
            this.state = AlpacaConnectionState.AUTHENTICATED;
            this.emit({ type: "authenticated" });
            this.startPing();
            this.reconnectAttempts = 0;

            // Resubscribe to active subscriptions after reconnect
            this.resubscribe();

            if (connectResolve) {
              connectResolve(undefined);
            }
          }
          continue;
        }

        // Handle error messages
        if (type === "error") {
          const errorParsed = AlpacaWsErrorMessageSchema.safeParse(msgObj);
          if (errorParsed.success) {
            this.emit({
              type: "error",
              code: errorParsed.data.code,
              message: errorParsed.data.msg,
            });

            // Auth failure codes: 401, 402, 403, 404
            if ([401, 402, 403, 404].includes(errorParsed.data.code)) {
              this.state = AlpacaConnectionState.ERROR;
            }
          }
          continue;
        }

        // Handle subscription confirmation
        if (type === "subscription") {
          const subParsed = AlpacaWsSubscriptionMessageSchema.safeParse(msgObj);
          if (subParsed.success) {
            this.emit({
              type: "subscribed",
              subscriptions: subParsed.data,
            });
          }
          continue;
        }

        // Handle data messages
        if (type === "q") {
          const quoteParsed = AlpacaWsQuoteMessageSchema.safeParse(msgObj);
          if (quoteParsed.success) {
            this.emit({ type: "quote", message: quoteParsed.data });
          }
        } else if (type === "t") {
          const tradeParsed = AlpacaWsTradeMessageSchema.safeParse(msgObj);
          if (tradeParsed.success) {
            this.emit({ type: "trade", message: tradeParsed.data });
          }
        } else if (type === "b" || type === "d" || type === "u") {
          const barParsed = AlpacaWsBarMessageSchema.safeParse(msgObj);
          if (barParsed.success) {
            this.emit({ type: "bar", message: barParsed.data });
          }
        } else if (type === "s") {
          const statusParsed = AlpacaWsStatusMessageSchema.safeParse(msgObj);
          if (statusParsed.success) {
            this.emit({ type: "status", message: statusParsed.data });
          }
        }
      }
    } catch (error) {
      this.emit({
        type: "error",
        code: 500,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Resubscribe to all active subscriptions after reconnection.
   */
  private resubscribe(): void {
    const trades = Array.from(this.activeSubscriptions.trades);
    const quotes = Array.from(this.activeSubscriptions.quotes);
    const bars = Array.from(this.activeSubscriptions.bars);
    const dailyBars = Array.from(this.activeSubscriptions.dailyBars);
    const updatedBars = Array.from(this.activeSubscriptions.updatedBars);
    const statuses = Array.from(this.activeSubscriptions.statuses);

    const subscriptionMsg: Record<string, unknown> = { action: "subscribe" };

    if (trades.length > 0) {
      subscriptionMsg.trades = trades;
    }
    if (quotes.length > 0) {
      subscriptionMsg.quotes = quotes;
    }
    if (bars.length > 0) {
      subscriptionMsg.bars = bars;
    }
    if (dailyBars.length > 0) {
      subscriptionMsg.dailyBars = dailyBars;
    }
    if (updatedBars.length > 0) {
      subscriptionMsg.updatedBars = updatedBars;
    }
    if (statuses.length > 0) {
      subscriptionMsg.statuses = statuses;
    }

    // Only send if there are subscriptions
    if (Object.keys(subscriptionMsg).length > 1) {
      this.send(subscriptionMsg);
    }
  }

  /**
   * Handle WebSocket errors.
   */
  private handleError(error: Error): void {
    this.state = AlpacaConnectionState.ERROR;
    this.emit({
      type: "error",
      code: 500,
      message: error.message,
    });
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
      this.state = AlpacaConnectionState.DISCONNECTED;
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
      this.state = AlpacaConnectionState.DISCONNECTED;
      this.connect().catch(() => {
        if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          this.state = AlpacaConnectionState.DISCONNECTED;
          this.emit({
            type: "error",
            code: 500,
            message: "Max reconnection attempts reached",
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
        const timeSinceLastPong = Date.now() - this.lastPongTime;
        if (timeSinceLastPong > this.config.pingIntervalS * 2 * 1000) {
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
 * Create an Alpaca WebSocket client for stocks from environment variables.
 */
export function createAlpacaStocksClientFromEnv(feed: AlpacaWsFeed = "sip"): AlpacaWebSocketClient {
  const apiKey = process.env.ALPACA_KEY ?? Bun.env.ALPACA_KEY;
  const apiSecret = process.env.ALPACA_SECRET ?? Bun.env.ALPACA_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("ALPACA_KEY and ALPACA_SECRET environment variables are required");
  }

  return new AlpacaWebSocketClient({
    apiKey,
    apiSecret,
    market: "stocks",
    feed,
  });
}

/**
 * Create an Alpaca WebSocket client for options from environment variables.
 */
export function createAlpacaOptionsClientFromEnv(): AlpacaWebSocketClient {
  const apiKey = process.env.ALPACA_KEY ?? Bun.env.ALPACA_KEY;
  const apiSecret = process.env.ALPACA_SECRET ?? Bun.env.ALPACA_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("ALPACA_KEY and ALPACA_SECRET environment variables are required");
  }

  return new AlpacaWebSocketClient({
    apiKey,
    apiSecret,
    market: "options",
    feed: "sip", // Options always use OPRA feed
  });
}

/**
 * Create an Alpaca WebSocket client from environment variables.
 */
export function createAlpacaWebSocketClientFromEnv(
  market: AlpacaWsMarket = "stocks",
  feed: AlpacaWsFeed = "sip"
): AlpacaWebSocketClient {
  const apiKey = process.env.ALPACA_KEY ?? Bun.env.ALPACA_KEY;
  const apiSecret = process.env.ALPACA_SECRET ?? Bun.env.ALPACA_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("ALPACA_KEY and ALPACA_SECRET environment variables are required");
  }

  return new AlpacaWebSocketClient({
    apiKey,
    apiSecret,
    market,
    feed,
  });
}
