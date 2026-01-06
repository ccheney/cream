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
