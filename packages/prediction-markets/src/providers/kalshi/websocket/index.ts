/**
 * Kalshi WebSocket Client Module
 *
 * Real-time market data streaming from Kalshi prediction markets.
 * Supports orderbook deltas, price tickers, and trade notifications.
 *
 * @see https://docs.kalshi.com/websockets/introduction
 */

// Cache
export { MarketStateCache } from "./cache.js";
// Main client
export { createKalshiWebSocketClient, KalshiWebSocketClient } from "./client.js";

// Types and schemas
export {
	// Types
	type CachedMarketState,
	type ConnectionState,
	// Constants
	DEFAULT_RECONNECT_CONFIG,
	HEARTBEAT_INTERVAL_MS,
	KALSHI_DEMO_WEBSOCKET_URL,
	KALSHI_WEBSOCKET_URL,
	type KalshiWebSocketCallback,
	type KalshiWebSocketChannel,
	type KalshiWebSocketConfig,
	type KalshiWebSocketMessage,
	type MarketLifecycleMessage,
	// Schemas
	MarketLifecycleMessageSchema,
	type OrderbookDeltaMessage,
	OrderbookDeltaMessageSchema,
	type ReconnectConfig,
	type ResolvedConfig,
	type SubscribeCommand,
	SubscribeCommandSchema,
	type TickerMessage,
	TickerMessageSchema,
	type TradeMessage,
	TradeMessageSchema,
	type UnsubscribeCommand,
	UnsubscribeCommandSchema,
} from "./types.js";
