/**
 * Kalshi WebSocket Client
 *
 * Real-time market data streaming from Kalshi prediction markets.
 * Supports orderbook deltas, price tickers, and trade notifications.
 *
 * @see https://docs.kalshi.com/websockets/introduction
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { z } from "zod";

export const KALSHI_WEBSOCKET_URL = "wss://api.elections.kalshi.com/trade-api/ws/v2";
export const KALSHI_DEMO_WEBSOCKET_URL = "wss://demo-api.kalshi.co/trade-api/ws/v2";

// ============================================
// Authentication
// ============================================

function signPssText(privateKeyPem: string, text: string): string {
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(text);
  sign.end();
  const signature = sign.sign({
    key: privateKeyPem,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });
  return signature.toString("base64");
}

function generateAuthHeaders(apiKeyId: string, privateKeyPem: string): Record<string, string> {
  const timestamp = Date.now().toString();
  const method = "GET";
  const path = "/trade-api/ws/v2";
  const msgString = timestamp + method + path;
  const signature = signPssText(privateKeyPem, msgString);

  return {
    "KALSHI-ACCESS-KEY": apiKeyId,
    "KALSHI-ACCESS-SIGNATURE": signature,
    "KALSHI-ACCESS-TIMESTAMP": timestamp,
  };
}

/** Heartbeat interval in milliseconds */
export const HEARTBEAT_INTERVAL_MS = 10000;

/** Default reconnection settings */
export const DEFAULT_RECONNECT_CONFIG = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  maxRetries: 10,
};

export type KalshiWebSocketChannel =
  | "orderbook_delta"
  | "ticker"
  | "trade"
  | "fill"
  | "market_lifecycle_v2";

export const SubscribeCommandSchema = z.object({
  id: z.number(),
  cmd: z.literal("subscribe"),
  params: z.object({
    channels: z.array(z.string()),
    market_tickers: z.array(z.string()).optional(),
  }),
});
export type SubscribeCommand = z.infer<typeof SubscribeCommandSchema>;

export const UnsubscribeCommandSchema = z.object({
  id: z.number(),
  cmd: z.literal("unsubscribe"),
  params: z.object({
    channels: z.array(z.string()),
    market_tickers: z.array(z.string()).optional(),
  }),
});
export type UnsubscribeCommand = z.infer<typeof UnsubscribeCommandSchema>;

export const TickerMessageSchema = z.object({
  type: z.literal("ticker"),
  msg: z.object({
    market_ticker: z.string(),
    yes_bid: z.number().optional(),
    yes_ask: z.number().optional(),
    no_bid: z.number().optional(),
    no_ask: z.number().optional(),
    last_price: z.number().optional(),
    volume: z.number().optional(),
    open_interest: z.number().optional(),
    timestamp: z.string(),
  }),
});
export type TickerMessage = z.infer<typeof TickerMessageSchema>;

export const OrderbookDeltaMessageSchema = z.object({
  type: z.literal("orderbook_delta"),
  msg: z.object({
    market_ticker: z.string(),
    side: z.enum(["yes", "no"]),
    price: z.number(),
    delta: z.number(),
    timestamp: z.string(),
  }),
});
export type OrderbookDeltaMessage = z.infer<typeof OrderbookDeltaMessageSchema>;

export const TradeMessageSchema = z.object({
  type: z.literal("trade"),
  msg: z.object({
    trade_id: z.string(),
    market_ticker: z.string(),
    side: z.enum(["yes", "no"]),
    count: z.number(),
    yes_price: z.number(),
    no_price: z.number(),
    taker_side: z.enum(["yes", "no"]).optional(),
    timestamp: z.string(),
  }),
});
export type TradeMessage = z.infer<typeof TradeMessageSchema>;

export const MarketLifecycleMessageSchema = z.object({
  type: z.literal("market_lifecycle_v2"),
  msg: z.object({
    market_ticker: z.string(),
    status: z.string(),
    timestamp: z.string(),
  }),
});
export type MarketLifecycleMessage = z.infer<typeof MarketLifecycleMessageSchema>;

export type KalshiWebSocketMessage =
  | TickerMessage
  | OrderbookDeltaMessage
  | TradeMessage
  | MarketLifecycleMessage;

export interface CachedMarketState {
  ticker: string;
  yesBid?: number;
  yesAsk?: number;
  noBid?: number;
  noAsk?: number;
  lastPrice?: number;
  volume?: number;
  openInterest?: number;
  lastUpdated: Date;
  expiresAt: Date;
}

export class MarketStateCache {
  private cache: Map<string, CachedMarketState> = new Map();
  private readonly ttlMs: number;

  constructor(ttlMs = 5 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  updateFromTicker(msg: TickerMessage["msg"]): void {
    const now = new Date();
    const existing = this.cache.get(msg.market_ticker) ?? {
      ticker: msg.market_ticker,
      lastUpdated: now,
      expiresAt: new Date(now.getTime() + this.ttlMs),
    };

    this.cache.set(msg.market_ticker, {
      ...existing,
      yesBid: msg.yes_bid ?? existing.yesBid,
      yesAsk: msg.yes_ask ?? existing.yesAsk,
      noBid: msg.no_bid ?? existing.noBid,
      noAsk: msg.no_ask ?? existing.noAsk,
      lastPrice: msg.last_price ?? existing.lastPrice,
      volume: msg.volume ?? existing.volume,
      openInterest: msg.open_interest ?? existing.openInterest,
      lastUpdated: now,
      expiresAt: new Date(now.getTime() + this.ttlMs),
    });
  }

  get(ticker: string): CachedMarketState | undefined {
    const entry = this.cache.get(ticker);
    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (entry.expiresAt < new Date()) {
      this.cache.delete(ticker);
      return undefined;
    }

    return entry;
  }

  clear(): void {
    this.cache.clear();
  }

  prune(): number {
    const now = new Date();
    let removed = 0;

    for (const [ticker, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(ticker);
        removed++;
      }
    }

    return removed;
  }

  getAllTickers(): string[] {
    return [...this.cache.keys()];
  }
}

export type KalshiWebSocketCallback = (message: KalshiWebSocketMessage) => void;

export interface KalshiWebSocketConfig {
  /** API key ID for authentication */
  apiKeyId?: string;
  /** Path to RSA private key file */
  privateKeyPath?: string;
  /** RSA private key as PEM string */
  privateKeyPem?: string;
  /** Use demo environment */
  demo?: boolean;
  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean;
  /** Reconnection settings */
  reconnect?: {
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    maxRetries?: number;
  };
  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;
}

export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

export class KalshiWebSocketClient {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private connectionState: ConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private reconnectTimer: Timer | null = null;
  private heartbeatTimer: Timer | null = null;
  private readonly config: {
    apiKeyId: string;
    privateKeyPem: string;
    demo: boolean;
    autoReconnect: boolean;
    cacheTtlMs: number;
    reconnect: Required<NonNullable<KalshiWebSocketConfig["reconnect"]>>;
  };
  private readonly cache: MarketStateCache;

  // Subscription management
  private subscriptions: Map<string, Set<KalshiWebSocketCallback>> = new Map();
  private pendingSubscriptions: Map<string, Set<string>> = new Map();

  // Event listeners
  private onConnectCallbacks: Set<() => void> = new Set();
  private onDisconnectCallbacks: Set<(reason?: string) => void> = new Set();
  private onErrorCallbacks: Set<(error: Error) => void> = new Set();

  constructor(config: KalshiWebSocketConfig = {}) {
    // Load private key from file if path provided
    let privateKeyPem = config.privateKeyPem ?? "";
    if (!privateKeyPem && config.privateKeyPath) {
      privateKeyPem = fs.readFileSync(config.privateKeyPath, "utf-8");
    }

    this.config = {
      apiKeyId: config.apiKeyId ?? "",
      privateKeyPem,
      demo: config.demo ?? false,
      autoReconnect: config.autoReconnect ?? true,
      cacheTtlMs: config.cacheTtlMs ?? 5 * 60 * 1000,
      reconnect: {
        initialDelayMs: config.reconnect?.initialDelayMs ?? DEFAULT_RECONNECT_CONFIG.initialDelayMs,
        maxDelayMs: config.reconnect?.maxDelayMs ?? DEFAULT_RECONNECT_CONFIG.maxDelayMs,
        backoffMultiplier:
          config.reconnect?.backoffMultiplier ?? DEFAULT_RECONNECT_CONFIG.backoffMultiplier,
        maxRetries: config.reconnect?.maxRetries ?? DEFAULT_RECONNECT_CONFIG.maxRetries,
      },
    };

    this.cache = new MarketStateCache(this.config.cacheTtlMs);
  }

  isAuthenticated(): boolean {
    return Boolean(this.config.apiKeyId && this.config.privateKeyPem);
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  getCache(): MarketStateCache {
    return this.cache;
  }

  async connect(): Promise<void> {
    if (this.connectionState === "connected" || this.connectionState === "connecting") {
      return;
    }

    this.connectionState = "connecting";
    const url = this.config.demo ? KALSHI_DEMO_WEBSOCKET_URL : KALSHI_WEBSOCKET_URL;

    return new Promise((resolve, reject) => {
      try {
        // Create WebSocket with auth headers if authenticated
        const wsOptions = this.isAuthenticated()
          ? { headers: generateAuthHeaders(this.config.apiKeyId, this.config.privateKeyPem) }
          : undefined;

        this.ws = new WebSocket(url, wsOptions);

        this.ws.onopen = () => {
          this.connectionState = "connected";
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.resubscribe();
          for (const cb of this.onConnectCallbacks) {
            cb();
          }
          resolve();
        };

        this.ws.onclose = (event) => {
          this.handleDisconnect(event.reason);
        };

        this.ws.onerror = () => {
          const error = new Error("WebSocket connection error");
          for (const cb of this.onErrorCallbacks) {
            cb(error);
          }
          if (this.connectionState === "connecting") {
            reject(error);
          }
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        this.connectionState = "disconnected";
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.stopReconnect();

    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }

    this.connectionState = "disconnected";
  }

  subscribe(
    channel: KalshiWebSocketChannel,
    tickers: string[],
    callback: KalshiWebSocketCallback
  ): void {
    const key = this.getSubscriptionKey(channel, tickers);

    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set());
    }
    this.subscriptions.get(key)?.add(callback);

    if (this.connectionState === "connected" && this.ws) {
      this.sendSubscription(channel, tickers);
    } else {
      if (!this.pendingSubscriptions.has(channel)) {
        this.pendingSubscriptions.set(channel, new Set());
      }
      for (const ticker of tickers) {
        this.pendingSubscriptions.get(channel)?.add(ticker);
      }
    }
  }

  unsubscribe(
    channel: KalshiWebSocketChannel,
    tickers: string[],
    callback?: KalshiWebSocketCallback
  ): void {
    const key = this.getSubscriptionKey(channel, tickers);

    if (callback && this.subscriptions.has(key)) {
      const callbacks = this.subscriptions.get(key);
      callbacks?.delete(callback);
      if (callbacks?.size === 0) {
        this.subscriptions.delete(key);
        this.sendUnsubscribe(channel, tickers);
      }
    } else if (!callback) {
      this.subscriptions.delete(key);
      this.sendUnsubscribe(channel, tickers);
    }
  }

  onConnect(callback: () => void): void {
    this.onConnectCallbacks.add(callback);
  }

  onDisconnect(callback: (reason?: string) => void): void {
    this.onDisconnectCallbacks.add(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.onErrorCallbacks.add(callback);
  }

  private getSubscriptionKey(channel: string, tickers: string[]): string {
    return `${channel}:${tickers.sort().join(",")}`;
  }

  private sendSubscription(channel: string, tickers: string[]): void {
    if (!this.ws || this.connectionState !== "connected") {
      return;
    }

    const message: SubscribeCommand = {
      id: ++this.messageId,
      cmd: "subscribe",
      params: {
        channels: [channel],
        market_tickers: tickers.length > 0 ? tickers : undefined,
      },
    };

    this.ws.send(JSON.stringify(message));
  }

  private sendUnsubscribe(channel: string, tickers: string[]): void {
    if (!this.ws || this.connectionState !== "connected") {
      return;
    }

    const message: UnsubscribeCommand = {
      id: ++this.messageId,
      cmd: "unsubscribe",
      params: {
        channels: [channel],
        market_tickers: tickers.length > 0 ? tickers : undefined,
      },
    };

    this.ws.send(JSON.stringify(message));
  }

  private handleMessage(data: string): void {
    try {
      const parsed = JSON.parse(data);

      if (parsed.type === "ticker") {
        const result = TickerMessageSchema.safeParse(parsed);
        if (result.success) {
          this.cache.updateFromTicker(result.data.msg);
          this.notifySubscribers(result.data);
        }
      } else if (parsed.type === "orderbook_delta") {
        const result = OrderbookDeltaMessageSchema.safeParse(parsed);
        if (result.success) {
          this.notifySubscribers(result.data);
        }
      } else if (parsed.type === "trade") {
        const result = TradeMessageSchema.safeParse(parsed);
        if (result.success) {
          this.notifySubscribers(result.data);
        }
      } else if (parsed.type === "market_lifecycle_v2") {
        const result = MarketLifecycleMessageSchema.safeParse(parsed);
        if (result.success) {
          this.notifySubscribers(result.data);
        }
      }
    } catch {
      // Ignore parse errors for pong/heartbeat messages
    }
  }

  private notifySubscribers(message: KalshiWebSocketMessage): void {
    for (const [key, callbacks] of this.subscriptions.entries()) {
      if (key.startsWith(message.type)) {
        for (const cb of callbacks) {
          cb(message);
        }
      }
    }
  }

  private handleDisconnect(reason?: string): void {
    this.stopHeartbeat();
    this.connectionState = "disconnected";
    for (const cb of this.onDisconnectCallbacks) {
      cb(reason);
    }

    if (this.config.autoReconnect) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.reconnect.maxRetries) {
      const error = new Error(
        `Max reconnection attempts (${this.config.reconnect.maxRetries}) reached`
      );
      for (const cb of this.onErrorCallbacks) {
        cb(error);
      }
      return;
    }

    const delay = Math.min(
      this.config.reconnect.initialDelayMs *
        this.config.reconnect.backoffMultiplier ** this.reconnectAttempts,
      this.config.reconnect.maxDelayMs
    );

    this.connectionState = "reconnecting";
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  private resubscribe(): void {
    for (const [channel, tickers] of this.pendingSubscriptions.entries()) {
      if (tickers.size > 0) {
        this.sendSubscription(channel, [...tickers]);
      }
    }
    this.pendingSubscriptions.clear();

    for (const key of this.subscriptions.keys()) {
      const [channel, tickerStr] = key.split(":");
      const tickers = tickerStr?.split(",").filter(Boolean) ?? [];
      if (channel) {
        this.sendSubscription(channel, tickers);
      }
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.connectionState === "connected") {
        this.ws.send("heartbeat");
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

export function createKalshiWebSocketClient(config?: KalshiWebSocketConfig): KalshiWebSocketClient {
  return new KalshiWebSocketClient(config);
}
