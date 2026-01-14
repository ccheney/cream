/**
 * Kalshi API Client
 *
 * Client for interacting with the Kalshi prediction market API.
 * Uses RSA-PSS authentication for API access.
 *
 * @see https://docs.kalshi.com/sdks/typescript/quickstart
 */

export {
	createKalshiClient,
	createKalshiClientFromEnv,
	KALSHI_RATE_LIMITS,
	KalshiClient,
	type KalshiClientOptions,
	type KalshiEvent,
	KalshiEventSchema,
	type KalshiMarket,
	KalshiMarketSchema,
	MARKET_TYPE_TO_SERIES,
} from "./client";

// WebSocket Client
export {
	type CachedMarketState,
	type ConnectionState,
	createKalshiWebSocketClient,
	DEFAULT_RECONNECT_CONFIG,
	HEARTBEAT_INTERVAL_MS,
	KALSHI_DEMO_WEBSOCKET_URL,
	KALSHI_WEBSOCKET_URL,
	type KalshiWebSocketCallback,
	type KalshiWebSocketChannel,
	KalshiWebSocketClient,
	type KalshiWebSocketConfig,
	type KalshiWebSocketMessage,
	type MarketLifecycleMessage,
	MarketLifecycleMessageSchema,
	MarketStateCache,
	type OrderbookDeltaMessage,
	OrderbookDeltaMessageSchema,
	type SubscribeCommand,
	SubscribeCommandSchema,
	type TickerMessage,
	TickerMessageSchema,
	type TradeMessage,
	TradeMessageSchema,
	type UnsubscribeCommand,
	UnsubscribeCommandSchema,
} from "./websocket/index.js";
