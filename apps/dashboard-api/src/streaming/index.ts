/**
 * Streaming Services
 *
 * Real-time data streaming for the dashboard.
 */

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
