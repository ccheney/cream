/**
 * Streaming Services
 *
 * Real-time data streaming for the dashboard.
 */

// Indicator data streaming
export {
	getActiveIndicatorSymbols,
	getCachedIndicator,
	initIndicatorDataStreaming,
	isIndicatorStreamingConnected,
	shutdownIndicatorDataStreaming,
	subscribeIndicatorSymbol,
	subscribeIndicatorSymbols,
	unsubscribeIndicatorSymbol,
} from "./indicator-data.js";
// Stock market data streaming
export {
	getActiveSymbols,
	getCachedQuote,
	initMarketDataStreaming,
	isStreamingConnected,
	shutdownMarketDataStreaming,
	subscribeSymbol,
	subscribeSymbols,
	unsubscribeSymbol,
} from "./market-data.js";
// Options data streaming
export {
	getActiveContracts,
	getCachedOptionsQuote,
	initOptionsDataStreaming,
	isOptionsStreamingConnected,
	shutdownOptionsDataStreaming,
	subscribeContract,
	subscribeContracts,
	unsubscribeContract,
} from "./options-data.js";
// Alpaca stream proxy client (gRPC)
export {
	getConnectionStatus as getProxyConnectionStatus,
	isProxyHealthy,
	resetClient as resetProxyClient,
	STREAM_PROXY_URL,
	streamBars as proxyStreamBars,
	streamOptionQuotes as proxyStreamOptionQuotes,
	streamOptionTrades as proxyStreamOptionTrades,
	streamOrderUpdates as proxyStreamOrderUpdates,
	streamQuotes as proxyStreamQuotes,
	streamTrades as proxyStreamTrades,
} from "./proxy-client.js";
// Shared Options WebSocket (single connection for Alpaca)
export {
	getSharedOptionsWebSocket,
	initSharedOptionsWebSocket,
	isOptionsWebSocketConnected,
	offOptionsEvent,
	onOptionsEvent,
	shutdownSharedOptionsWebSocket,
} from "./shared-options-ws.js";
// Trading updates streaming (Alpaca trade_updates WebSocket)
export {
	initTradingUpdatesStreaming,
	isTradingUpdatesConnected,
	shutdownTradingUpdatesStreaming,
} from "./trading-updates.js";
