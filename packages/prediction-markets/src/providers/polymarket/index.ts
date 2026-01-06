/**
 * Polymarket CLOB Client
 *
 * Client for interacting with the Polymarket CLOB (Central Limit Order Book) API.
 *
 * @see https://docs.polymarket.com/
 */

export const POLYMARKET_CLOB_URL = "https://clob.polymarket.com";
export const POLYMARKET_GAMMA_URL = "https://gamma-api.polymarket.com";

export {
  type ClobOrderbook,
  ClobOrderbookSchema,
  type ClobPrice,
  ClobPriceSchema,
  createPolymarketClient,
  createPolymarketClientFromEnv,
  DEFAULT_SEARCH_QUERIES,
  POLYMARKET_RATE_LIMITS,
  PolymarketClient,
  type PolymarketClientOptions,
  type PolymarketEvent,
  PolymarketEventSchema,
  type PolymarketMarket,
  PolymarketMarketSchema,
} from "./client";
