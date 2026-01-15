/**
 * Market Snapshot Zod Schemas
 *
 * Real-time market data structures for the trading system.
 * Mirrors cream/v1/market_snapshot.proto
 *
 * @see packages/proto/cream/v1/market_snapshot.proto
 */

import { z } from "zod";
import { MarketStatus, OptionContractSchema, Regime } from "./decision";
import { CreamEnvironment } from "./env";
import { Iso8601Schema } from "./time";

// ============================================
// Quote Data
// ============================================

/**
 * Real-time quote for a symbol
 */
export const QuoteSchema = z.object({
	/** Symbol (e.g., "AAPL") */
	symbol: z.string().min(1),

	/** Best bid price */
	bid: z.number().nonnegative(),

	/** Best ask price */
	ask: z.number().nonnegative(),

	/** Bid size (shares/contracts) */
	bidSize: z.number().int().nonnegative(),

	/** Ask size (shares/contracts) */
	askSize: z.number().int().nonnegative(),

	/** Last trade price */
	last: z.number().nonnegative(),

	/** Last trade size */
	lastSize: z.number().int().nonnegative(),

	/** Cumulative volume */
	volume: z.number().int().nonnegative(),

	/** Quote timestamp */
	timestamp: Iso8601Schema,
});
export type Quote = z.infer<typeof QuoteSchema>;

// ============================================
// OHLCV Bar
// ============================================

/**
 * Valid bar timeframes in minutes
 */
export const BarTimeframe = z.enum(["1", "5", "15", "60", "240", "1440"]);
export type BarTimeframe = z.infer<typeof BarTimeframe>;

/**
 * OHLCV candlestick bar
 */
export const BarSchema = z
	.object({
		/** Symbol */
		symbol: z.string().min(1),

		/** Bar open time */
		timestamp: Iso8601Schema,

		/** Bar timeframe in minutes (1, 5, 15, 60, 240, 1440) */
		timeframeMinutes: z
			.number()
			.int()
			.refine((val) => [1, 5, 15, 60, 240, 1440].includes(val), {
				message: "Invalid bar timeframe. Must be 1, 5, 15, 60, 240, or 1440 minutes",
			}),

		/** Open price */
		open: z.number().positive(),

		/** High price */
		high: z.number().positive(),

		/** Low price */
		low: z.number().positive(),

		/** Close price */
		close: z.number().positive(),

		/** Volume */
		volume: z.number().int().nonnegative(),

		/** VWAP (volume-weighted average price) */
		vwap: z.number().positive().optional(),

		/** Number of trades */
		tradeCount: z.number().int().nonnegative().optional(),
	})
	.superRefine((data, ctx) => {
		// Validate high >= open, close, low
		if (data.high < data.open) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "high must be >= open",
				path: ["high"],
			});
		}
		if (data.high < data.close) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "high must be >= close",
				path: ["high"],
			});
		}
		if (data.high < data.low) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "high must be >= low",
				path: ["high"],
			});
		}
		// Validate low <= open, close
		if (data.low > data.open) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "low must be <= open",
				path: ["low"],
			});
		}
		if (data.low > data.close) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "low must be <= close",
				path: ["low"],
			});
		}
	});
export type Bar = z.infer<typeof BarSchema>;

// ============================================
// Symbol Snapshot
// ============================================

/**
 * Complete market snapshot for a symbol
 */
export const SymbolSnapshotSchema = z
	.object({
		/** Symbol */
		symbol: z.string().min(1),

		/** Current quote */
		quote: QuoteSchema,

		/** Latest completed bars (multiple timeframes) */
		bars: z.array(BarSchema),

		/** Market status */
		marketStatus: MarketStatus,

		/** Daily high */
		dayHigh: z.number().positive(),

		/** Daily low */
		dayLow: z.number().positive(),

		/** Previous close */
		prevClose: z.number().positive(),

		/** Today's open */
		open: z.number().positive(),

		/** Snapshot timestamp */
		asOf: Iso8601Schema,
	})
	.superRefine((data, ctx) => {
		if (data.dayHigh < data.dayLow) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "dayHigh must be >= dayLow",
				path: ["dayHigh"],
			});
		}
	});
export type SymbolSnapshot = z.infer<typeof SymbolSnapshotSchema>;

// ============================================
// Market Snapshot
// ============================================

/**
 * Full market snapshot for multiple symbols
 */
export const MarketSnapshotSchema = z.object({
	/** Trading environment */
	environment: CreamEnvironment,

	/** Snapshot timestamp */
	asOf: Iso8601Schema,

	/** Market status (overall) */
	marketStatus: MarketStatus,

	/** Current regime classification */
	regime: Regime,

	/** Symbol snapshots */
	symbols: z.array(SymbolSnapshotSchema),
});
export type MarketSnapshot = z.infer<typeof MarketSnapshotSchema>;

// ============================================
// Option Chain
// ============================================

/**
 * Option quote with Greeks
 */
export const OptionQuoteSchema = z.object({
	/** Option contract */
	contract: OptionContractSchema,

	/** Quote data */
	quote: QuoteSchema,

	/** Implied volatility */
	impliedVolatility: z.number().nonnegative().optional(),

	/** Delta */
	delta: z.number().min(-1).max(1).optional(),

	/** Gamma */
	gamma: z.number().nonnegative().optional(),

	/** Theta (typically negative) */
	theta: z.number().optional(),

	/** Vega */
	vega: z.number().nonnegative().optional(),

	/** Rho */
	rho: z.number().optional(),

	/** Open interest */
	openInterest: z.number().int().nonnegative(),
});
export type OptionQuote = z.infer<typeof OptionQuoteSchema>;

/**
 * Option chain for an underlying
 */
export const OptionChainSchema = z.object({
	/** Underlying symbol */
	underlying: z.string().min(1),

	/** Underlying price */
	underlyingPrice: z.number().positive(),

	/** Option quotes */
	options: z.array(OptionQuoteSchema),

	/** Chain timestamp */
	asOf: Iso8601Schema,
});
export type OptionChain = z.infer<typeof OptionChainSchema>;

// ============================================
// Service Request/Response Types
// ============================================

/**
 * Request to subscribe to market data
 */
export const SubscribeMarketDataRequestSchema = z.object({
	/** Symbols to subscribe to */
	symbols: z.array(z.string().min(1)),

	/** Include option chains */
	includeOptions: z.boolean().default(false),

	/** Bar timeframes to include (in minutes) */
	barTimeframes: z.array(z.number().int().positive()).default([]),
});
export type SubscribeMarketDataRequest = z.infer<typeof SubscribeMarketDataRequestSchema>;

/**
 * Market data update (streamed response) - one of the update types
 */
export const SubscribeMarketDataResponseSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("quote"), quote: QuoteSchema }),
	z.object({ type: z.literal("bar"), bar: BarSchema }),
	z.object({ type: z.literal("optionQuote"), optionQuote: OptionQuoteSchema }),
	z.object({ type: z.literal("snapshot"), snapshot: SymbolSnapshotSchema }),
]);
export type SubscribeMarketDataResponse = z.infer<typeof SubscribeMarketDataResponseSchema>;

/**
 * Request for snapshot
 */
export const GetSnapshotRequestSchema = z.object({
	/** Symbols to get snapshot for */
	symbols: z.array(z.string().min(1)),

	/** Include bars */
	includeBars: z.boolean().default(false),

	/** Bar timeframes to include */
	barTimeframes: z.array(z.number().int().positive()).default([]),
});
export type GetSnapshotRequest = z.infer<typeof GetSnapshotRequestSchema>;

/**
 * Response with snapshot
 */
export const GetSnapshotResponseSchema = z.object({
	/** Market snapshot */
	snapshot: MarketSnapshotSchema,
});
export type GetSnapshotResponse = z.infer<typeof GetSnapshotResponseSchema>;

/**
 * Request for option chain
 */
export const GetOptionChainRequestSchema = z
	.object({
		/** Underlying symbol */
		underlying: z.string().min(1),

		/** Expiration dates to include (YYYY-MM-DD format, empty for all) */
		expirations: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]),

		/** Strike range (min) */
		minStrike: z.number().positive().optional(),

		/** Strike range (max) */
		maxStrike: z.number().positive().optional(),
	})
	.superRefine((data, ctx) => {
		if (data.minStrike !== undefined && data.maxStrike !== undefined) {
			if (data.minStrike > data.maxStrike) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "minStrike must be <= maxStrike",
					path: ["minStrike"],
				});
			}
		}
	});
export type GetOptionChainRequest = z.infer<typeof GetOptionChainRequestSchema>;

/**
 * Response with option chain
 */
export const GetOptionChainResponseSchema = z.object({
	/** Option chain */
	chain: OptionChainSchema,
});
export type GetOptionChainResponse = z.infer<typeof GetOptionChainResponseSchema>;
