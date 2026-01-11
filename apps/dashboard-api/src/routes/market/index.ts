/**
 * Market Routes Index
 *
 * Composes all market sub-routers into a single router.
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import candlesRoutes from "./candles.js";
import indicatorsRoutes from "./indicators.js";
import quotesRoutes from "./quotes.js";
import regimeRoutes from "./regime.js";

const app = new OpenAPIHono();

// Mount sub-routers
app.route("/", quotesRoutes);
app.route("/", candlesRoutes);
app.route("/", indicatorsRoutes);
app.route("/", regimeRoutes);

export default app;

// Re-export types for external use
export type {
  Candle,
  Indicators,
  Quote,
  QuoteError,
  RegimeStatus,
  Timeframe,
  TimespanConfig,
} from "./types.js";
// Re-export schemas for external use
// Re-export utilities for testing
export {
  CACHE_TTL_MS,
  CACHE_VERSION,
  CandleSchema,
  ErrorSchema,
  getCached,
  getDaysAgo,
  getPolygonClient,
  getTodayNY,
  IndicatorsSchema,
  isMarketHours,
  MARKET_CLOSE_HOUR,
  MARKET_CLOSE_MINUTE,
  MARKET_OPEN_HOUR,
  MARKET_OPEN_MINUTE,
  QuoteSchema,
  RegimeStatusSchema,
  setCache,
  TIMESPAN_MAP,
  TimeframeSchema,
} from "./types.js";
