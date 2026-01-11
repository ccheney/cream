/**
 * Type definitions and Zod schemas for Kalshi WebSocket messages.
 */

import { z } from "zod";

// ============================================
// Constants
// ============================================

export const KALSHI_WEBSOCKET_URL = "wss://api.elections.kalshi.com/trade-api/ws/v2";
export const KALSHI_DEMO_WEBSOCKET_URL = "wss://demo-api.kalshi.co/trade-api/ws/v2";

/** Heartbeat interval in milliseconds */
export const HEARTBEAT_INTERVAL_MS = 10000;

/** Default reconnection settings */
export const DEFAULT_RECONNECT_CONFIG = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  maxRetries: 10,
};

// ============================================
// Channel Types
// ============================================

export type KalshiWebSocketChannel =
  | "orderbook_delta"
  | "ticker"
  | "trade"
  | "fill"
  | "market_lifecycle_v2";

// ============================================
// Command Schemas
// ============================================

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

// ============================================
// Message Schemas
// ============================================

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

// ============================================
// Callback and State Types
// ============================================

export type KalshiWebSocketCallback = (message: KalshiWebSocketMessage) => void;

export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

// ============================================
// Configuration Types
// ============================================

export interface ReconnectConfig {
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  maxRetries?: number;
}

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
  reconnect?: ReconnectConfig;
  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;
}

export interface ResolvedConfig {
  apiKeyId: string;
  privateKeyPem: string;
  demo: boolean;
  autoReconnect: boolean;
  cacheTtlMs: number;
  reconnect: Required<ReconnectConfig>;
}

// ============================================
// Cache Types
// ============================================

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
