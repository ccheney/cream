/**
 * Streaming Services
 *
 * Real-time data streaming for the dashboard.
 */

// Shared Options WebSocket (single connection for Alpaca)
export {
  getSharedOptionsWebSocket,
  initSharedOptionsWebSocket,
  isOptionsWebSocketConnected,
  offOptionsEvent,
  onOptionsEvent,
  shutdownSharedOptionsWebSocket,
} from "./shared-options-ws.js";

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
