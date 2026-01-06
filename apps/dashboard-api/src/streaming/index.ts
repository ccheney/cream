/**
 * Streaming Services
 *
 * Real-time data streaming for the dashboard.
 */

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
