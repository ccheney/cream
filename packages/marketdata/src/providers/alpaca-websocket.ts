/**
 * Alpaca Markets WebSocket Client
 *
 * Real-time streaming market data via WebSocket.
 *
 * Supports:
 * - Stock quotes, trades, and bars (JSON)
 * - Options quotes and trades (msgpack)
 * - News articles (JSON)
 * - Crypto quotes, trades, and bars (JSON)
 *
 * Endpoints:
 * - Stocks (SIP): wss://stream.data.alpaca.markets/v2/sip
 * - Stocks (IEX): wss://stream.data.alpaca.markets/v2/iex
 * - Options: wss://stream.data.alpaca.markets/v1beta1/options
 * - News: wss://stream.data.alpaca.markets/v1beta1/news
 * - Crypto: wss://stream.data.alpaca.markets/v1beta3/crypto/us
 * - Test: wss://stream.data.alpaca.markets/v2/test
 *
 * @see https://docs.alpaca.markets/docs/streaming-market-data
 * @see https://docs.alpaca.markets/docs/real-time-option-data
 * @see https://docs.alpaca.markets/docs/streaming-real-time-news
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import { decode as msgpackDecode, encode as msgpackEncode } from "@msgpack/msgpack";
import { z } from "zod";

// Use Bun's native WebSocket (browser-compatible API)

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
    opra: "wss://stream.data.alpaca.markets/v1beta1/opra", // OPRA feed (msgpack only)
    indicative: "wss://stream.data.alpaca.markets/v1beta1/indicative", // Indicative feed (Basic plan)
  },
  news: {
    default: "wss://stream.data.alpaca.markets/v1beta1/news", // News stream
  },
  crypto: {
    us: "wss://stream.data.alpaca.markets/v1beta3/crypto/us",
  },
} as const;

// ============================================
// Message Schemas - Stocks
// ============================================

export const AlpacaWsQuoteMessageSchema = z.object({
  T: z.literal("q").describe("Message type: 'q' for quote"),
  S: z.string().describe("Ticker symbol (e.g., AAPL, MSFT)"),
  bx: z.string().optional().describe("Bid exchange code (e.g., 'V' for IEX)"),
  bp: z.number().describe("Best bid price"),
  bs: z.number().describe("Bid size in round lots"),
  ax: z.string().optional().describe("Ask exchange code (e.g., 'Q' for NASDAQ)"),
  ap: z.number().describe("Best ask price"),
  as: z.number().describe("Ask size in round lots"),
  t: z.string().describe("Quote timestamp in RFC-3339 format"),
  c: z.array(z.string()).optional().describe("Quote condition codes"),
  z: z.string().optional().describe("Tape: A (NYSE), B (ARCA/regional), C (NASDAQ)"),
});
export type AlpacaWsQuoteMessage = z.infer<typeof AlpacaWsQuoteMessageSchema>;

export const AlpacaWsTradeMessageSchema = z.object({
  T: z.literal("t").describe("Message type: 't' for trade"),
  S: z.string().describe("Ticker symbol (e.g., AAPL, MSFT)"),
  i: z.number().optional().describe("Unique trade ID"),
  x: z.string().optional().describe("Exchange code where trade executed"),
  p: z.number().describe("Trade price"),
  s: z.number().describe("Trade size in shares"),
  t: z.string().describe("Trade timestamp in RFC-3339 format"),
  c: z.array(z.string()).optional().describe("Trade condition codes (e.g., '@' for regular sale)"),
  z: z.string().optional().describe("Tape: A (NYSE), B (ARCA/regional), C (NASDAQ)"),
});
export type AlpacaWsTradeMessage = z.infer<typeof AlpacaWsTradeMessageSchema>;

export const AlpacaWsBarMessageSchema = z.object({
  T: z.enum(["b", "d", "u"]).describe("Bar type: 'b' (minute), 'd' (daily), 'u' (updated)"),
  S: z.string().describe("Ticker symbol (e.g., AAPL, MSFT)"),
  o: z.number().describe("Opening price of the bar"),
  h: z.number().describe("Highest price during the bar"),
  l: z.number().describe("Lowest price during the bar"),
  c: z.number().describe("Closing price of the bar"),
  v: z.number().describe("Total volume traded during the bar"),
  t: z.string().describe("Bar timestamp in RFC-3339 format"),
  vw: z.number().optional().describe("Volume-weighted average price (VWAP)"),
  n: z.number().optional().describe("Number of trades during the bar"),
});
export type AlpacaWsBarMessage = z.infer<typeof AlpacaWsBarMessageSchema>;

export const AlpacaWsStatusMessageSchema = z.object({
  T: z.literal("s").describe("Message type: 's' for trading status"),
  S: z.string().describe("Ticker symbol (e.g., AAPL, MSFT)"),
  sc: z.string().optional().describe("Status code (e.g., 'T' for trading, 'H' for halted)"),
  sm: z.string().optional().describe("Status message text"),
  rc: z.string().optional().describe("Reason code for status change"),
  rm: z.string().optional().describe("Reason message explaining status change"),
  t: z.string().optional().describe("Status timestamp in RFC-3339 format"),
  z: z.string().optional().describe("Tape: A (NYSE), B (ARCA/regional), C (NASDAQ)"),
});
export type AlpacaWsStatusMessage = z.infer<typeof AlpacaWsStatusMessageSchema>;

// ============================================
// Message Schemas - News
// ============================================

export const AlpacaWsNewsMessageSchema = z.object({
  T: z.literal("n").describe("Message type: 'n' for news"),
  id: z.number().describe("Unique article identifier"),
  headline: z.string().describe("Article headline/title"),
  summary: z.string().optional().describe("Brief article summary"),
  author: z.string().optional().describe("Article author name"),
  created_at: z.string().describe("Publication timestamp in RFC-3339 format"),
  updated_at: z.string().optional().describe("Last update timestamp in RFC-3339 format"),
  url: z.string().optional().describe("Full URL to the article"),
  content: z.string().optional().describe("Full article content (may include HTML markup)"),
  symbols: z
    .array(z.string())
    .describe("Ticker symbols mentioned in article (e.g., ['AAPL', 'MSFT'])"),
  source: z.string().describe("News source name (e.g., 'Benzinga', 'GlobeNewswire')"),
});
export type AlpacaWsNewsMessage = z.infer<typeof AlpacaWsNewsMessageSchema>;

// ============================================
// Message Schemas - Control Messages
// ============================================

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
  news: z.array(z.string()).optional(),
});
export type AlpacaWsSubscriptionMessage = z.infer<typeof AlpacaWsSubscriptionMessageSchema>;

export type AlpacaWsMessage =
  | AlpacaWsQuoteMessage
  | AlpacaWsTradeMessage
  | AlpacaWsBarMessage
  | AlpacaWsStatusMessage
  | AlpacaWsNewsMessage
  | AlpacaWsSuccessMessage
  | AlpacaWsErrorMessage
  | AlpacaWsSubscriptionMessage;

// ============================================
// Configuration Types
// ============================================

export type AlpacaWsFeed = "sip" | "iex" | "test";
export type AlpacaWsMarket = "stocks" | "options" | "news" | "crypto";

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
  | { type: "news"; message: AlpacaWsNewsMessage }
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
 * Note: Options stream uses msgpack encoding (binary), while
 * stocks, news, and crypto use JSON encoding.
 *
 * @example
 * ```typescript
 * // Stocks streaming (JSON)
 * const stocksClient = new AlpacaWebSocketClient({
 *   apiKey: process.env.ALPACA_KEY!,
 *   apiSecret: process.env.ALPACA_SECRET!,
 *   market: 'stocks',
 *   feed: 'sip',
 * });
 *
 * stocksClient.on((event) => {
 *   if (event.type === 'quote') {
 *     console.log(`${event.message.S}: $${event.message.bp}/$${event.message.ap}`);
 *   }
 * });
 *
 * await stocksClient.connect();
 * stocksClient.subscribe('quotes', ['AAPL', 'MSFT']);
 *
 * // Options streaming (msgpack)
 * const optionsClient = new AlpacaWebSocketClient({
 *   apiKey: process.env.ALPACA_KEY!,
 *   apiSecret: process.env.ALPACA_SECRET!,
 *   market: 'options',
 * });
 *
 * // News streaming (JSON)
 * const newsClient = new AlpacaWebSocketClient({
 *   apiKey: process.env.ALPACA_KEY!,
 *   apiSecret: process.env.ALPACA_SECRET!,
 *   market: 'news',
 * });
 *
 * await newsClient.connect();
 * newsClient.subscribe('news', ['*']); // Subscribe to all news
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
    news: Set<string>;
  } = {
    trades: new Set(),
    quotes: new Set(),
    bars: new Set(),
    dailyBars: new Set(),
    updatedBars: new Set(),
    statuses: new Set(),
    news: new Set(),
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
   * Check if this stream uses msgpack encoding.
   * Options stream is msgpack-only per Alpaca docs.
   */
  private usesMsgpack(): boolean {
    return this.config.market === "options";
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
    news: string[];
  } {
    return {
      trades: Array.from(this.activeSubscriptions.trades),
      quotes: Array.from(this.activeSubscriptions.quotes),
      bars: Array.from(this.activeSubscriptions.bars),
      dailyBars: Array.from(this.activeSubscriptions.dailyBars),
      updatedBars: Array.from(this.activeSubscriptions.updatedBars),
      statuses: Array.from(this.activeSubscriptions.statuses),
      news: Array.from(this.activeSubscriptions.news),
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
    if (this.config.market === "news") {
      return ALPACA_WS_ENDPOINTS.news.default;
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

    const { promise, resolve, reject } = Promise.withResolvers<void>();
    try {
      this.ws = new WebSocket(endpoint);
      // Ensure binary data comes as ArrayBuffer (not Buffer) for consistent handling
      this.ws.binaryType = "arraybuffer";

      this.ws.addEventListener("open", () => {
        this.state = AlpacaConnectionState.CONNECTED;
      });

      this.ws.addEventListener("message", (event: MessageEvent) => {
        this.handleMessage(event.data, resolve);
      });

      this.ws.addEventListener("error", () => {
        const error = new Error("WebSocket connection error");
        this.handleError(error);
        if (this.state === AlpacaConnectionState.CONNECTING) {
          reject(error);
        }
      });

      this.ws.addEventListener("close", (event: CloseEvent) => {
        this.handleClose(event.code, event.reason);
      });

      // Note: Bun native WebSocket handles protocol-level ping/pong automatically
      // The lastPongTime tracking is maintained via message activity
      this.lastPongTime = Date.now();
    } catch (error) {
      this.state = AlpacaConnectionState.ERROR;
      reject(error as Error);
    }
    return promise;
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
   * Note: For options, wildcard (*) subscriptions are NOT allowed for quotes
   * due to the large volume of symbols.
   *
   * @param channel - Channel type (trades, quotes, bars, dailyBars, updatedBars, statuses, news)
   * @param symbols - Array of symbols to subscribe to (use "*" for all, except options quotes)
   */
  subscribe(
    channel: "trades" | "quotes" | "bars" | "dailyBars" | "updatedBars" | "statuses" | "news",
    symbols: string[]
  ): void {
    if (!this.isConnected()) {
      throw new Error("Not authenticated. Call connect() first.");
    }

    // Validate: options quotes don't support wildcards
    if (this.config.market === "options" && channel === "quotes" && symbols.includes("*")) {
      throw new Error("Options quotes do not support wildcard (*) subscriptions");
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
    channel: "trades" | "quotes" | "bars" | "dailyBars" | "updatedBars" | "statuses" | "news",
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
   * Uses msgpack for options stream, JSON for others.
   */
  private send(message: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not ready");
    }

    if (this.usesMsgpack()) {
      // Options stream: send messages as msgpack binary
      const encoded = msgpackEncode(message);
      this.ws.send(encoded);
    } else {
      // Other streams: send as JSON
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Parse incoming message data.
   * Options stream uses msgpack for ALL messages (including control messages).
   * Other streams use JSON.
   * Bun native WebSocket provides string for text or ArrayBuffer for binary.
   */
  private parseMessage(data: string | ArrayBuffer | Buffer): unknown[] {
    // Convert data to Uint8Array for consistent handling
    let bytes: Uint8Array | null = null;

    if (data instanceof ArrayBuffer) {
      bytes = new Uint8Array(data);
    } else if (Buffer.isBuffer(data)) {
      // Handle Node.js Buffer (Bun may provide this in some cases)
      bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }

    if (this.usesMsgpack()) {
      // Options stream: ALL messages are msgpack-encoded (including control messages)
      if (bytes) {
        try {
          const decoded = msgpackDecode(bytes);
          return Array.isArray(decoded) ? decoded : [decoded];
        } catch {
          // Binary data that isn't valid msgpack - try JSON as fallback
          // Alpaca may send control messages as JSON even on options stream
          try {
            const text = new TextDecoder().decode(bytes);
            const parsed = JSON.parse(text);
            return Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            return [];
          }
        }
      }
      // String data on options stream - try JSON first (control messages), then msgpack
      if (typeof data === "string") {
        try {
          const parsed = JSON.parse(data);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          // Try msgpack on string data as fallback
          try {
            const buffer = new TextEncoder().encode(data);
            const decoded = msgpackDecode(buffer);
            return Array.isArray(decoded) ? decoded : [decoded];
          } catch {
            return [];
          }
        }
      }
      return [];
    }

    // Non-msgpack streams (stocks, news, crypto) use JSON
    try {
      let text: string;
      if (typeof data === "string") {
        text = data;
      } else if (bytes) {
        text = new TextDecoder().decode(bytes);
      } else {
        return [];
      }
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }

  /**
   * Handle incoming WebSocket messages.
   * Bun native WebSocket provides string for text or ArrayBuffer for binary.
   * Node.js/Bun may also provide Buffer in some cases.
   */
  private handleMessage(
    data: string | ArrayBuffer | Buffer,
    connectResolve?: (value: undefined) => void
  ): void {
    // Update lastPongTime on any message activity (replaces explicit pong handling)
    this.lastPongTime = Date.now();
    try {
      const messages = this.parseMessage(data);

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
        } else if (type === "n") {
          const newsParsed = AlpacaWsNewsMessageSchema.safeParse(msgObj);
          if (newsParsed.success) {
            this.emit({ type: "news", message: newsParsed.data });
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
    const news = Array.from(this.activeSubscriptions.news);

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
    if (news.length > 0) {
      subscriptionMsg.news = news;
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
   * Start connection monitor to detect stale connections.
   * Bun native WebSocket handles protocol-level ping/pong automatically.
   * We monitor message activity to detect if the connection has gone stale.
   */
  private startPing(): void {
    this.lastPongTime = Date.now();

    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const timeSinceLastActivity = Date.now() - this.lastPongTime;
        // Close connection if no activity for 2x ping interval
        if (timeSinceLastActivity > this.config.pingIntervalS * 2 * 1000) {
          this.ws.close();
        }
        // Bun native WebSocket handles protocol pings automatically
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
 * Note: Options stream uses msgpack encoding.
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
 * Create an Alpaca WebSocket client for news from environment variables.
 */
export function createAlpacaNewsClientFromEnv(): AlpacaWebSocketClient {
  const apiKey = process.env.ALPACA_KEY ?? Bun.env.ALPACA_KEY;
  const apiSecret = process.env.ALPACA_SECRET ?? Bun.env.ALPACA_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("ALPACA_KEY and ALPACA_SECRET environment variables are required");
  }

  return new AlpacaWebSocketClient({
    apiKey,
    apiSecret,
    market: "news",
    feed: "sip", // Not used for news, but required by config
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
