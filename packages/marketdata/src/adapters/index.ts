/**
 * Market Data Adapters
 *
 * Provider-specific implementations of the MarketDataAdapter interface.
 */

// Alpaca adapter (primary for PAPER/LIVE)
export {
  AlpacaMarketDataAdapter,
  createAlpacaAdapterFromEnv,
  isAlpacaAdapterAvailable,
} from "./alpaca-adapter";
