/**
 * Market Data API Routes
 *
 * Routes for quotes, candles, indicators, and market regime.
 * Re-exports from modular market routes for backward compatibility.
 *
 * @see docs/plans/ui/05-api-endpoints.md Market Data section
 */

export { default } from "./market/index.js";
export const marketRoutes = (await import("./market/index.js")).default;

// Re-export types for external use
export type {
	Candle,
	Indicators,
	Quote,
	QuoteError,
	RegimeStatus,
	Timeframe,
	TimespanConfig,
} from "./market/index.js";
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
} from "./market/index.js";
