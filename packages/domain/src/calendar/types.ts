/**
 * Calendar Service Types
 *
 * Type definitions for the CalendarService abstraction that provides
 * market calendar data via Alpaca API.
 *
 * @see docs/plans/02-data-layer.md - Session and Calendar Handling
 */

import { z } from "zod";

// ============================================
// Core Types
// ============================================

/**
 * Trading session type (re-exported from parent calendar.ts for convenience)
 */
export const TradingSessionSchema = z.enum(["PRE_MARKET", "RTH", "AFTER_HOURS", "CLOSED"]);
export type TradingSession = z.infer<typeof TradingSessionSchema>;

/**
 * A single calendar day with market open/close times.
 * Returned by Alpaca Calendar API.
 */
export const CalendarDaySchema = z.object({
	/** Date in YYYY-MM-DD format */
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	/** Market open time in HH:MM ET format */
	open: z.string().regex(/^\d{2}:\d{2}$/),
	/** Market close time in HH:MM ET format */
	close: z.string().regex(/^\d{2}:\d{2}$/),
	/** Extended session open (pre-market start) in HH:MM ET format */
	sessionOpen: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.optional(),
	/** Extended session close (after-hours end) in HH:MM ET format */
	sessionClose: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.optional(),
});
export type CalendarDay = z.infer<typeof CalendarDaySchema>;

/**
 * Current market clock status.
 * Returned by Alpaca Clock API.
 */
export const MarketClockSchema = z.object({
	/** Whether the market is currently open */
	isOpen: z.boolean(),
	/** Next market open time */
	nextOpen: z.date(),
	/** Next market close time */
	nextClose: z.date(),
	/** Current timestamp from the API */
	timestamp: z.date(),
});
export type MarketClock = z.infer<typeof MarketClockSchema>;

// ============================================
// Alpaca API Response Types
// ============================================

/**
 * Alpaca Calendar API response item.
 * @see https://docs.alpaca.markets/reference/getcalendar-1
 */
export const AlpacaCalendarResponseSchema = z.object({
	/** Date in YYYY-MM-DD format */
	date: z.string(),
	/** Regular market open time in HH:MM format (ET) */
	open: z.string(),
	/** Regular market close time in HH:MM format (ET) */
	close: z.string(),
	/** Extended session open time (pre-market) in HH:MM format (ET) */
	session_open: z.string().optional(),
	/** Extended session close time (after-hours) in HH:MM format (ET) */
	session_close: z.string().optional(),
});
export type AlpacaCalendarResponse = z.infer<typeof AlpacaCalendarResponseSchema>;

/**
 * Alpaca Clock API response.
 * @see https://docs.alpaca.markets/reference/getclock-1
 */
export const AlpacaClockResponseSchema = z.object({
	/** Current timestamp (ISO 8601) */
	timestamp: z.string(),
	/** Whether the market is currently open */
	is_open: z.boolean(),
	/** Next market open time (ISO 8601) */
	next_open: z.string(),
	/** Next market close time (ISO 8601) */
	next_close: z.string(),
});
export type AlpacaClockResponse = z.infer<typeof AlpacaClockResponseSchema>;

// ============================================
// Calendar Service Interface
// ============================================

/**
 * Calendar service for market hours and trading day operations.
 *
 * Implementation: AlpacaCalendarService (uses Alpaca API with caching)
 */
export interface CalendarService {
	// ----------------------------------------
	// Async Methods (Primary API)
	// ----------------------------------------

	/**
	 * Check if the market is currently open.
	 * @returns true if market is currently in RTH or extended hours
	 */
	isMarketOpen(): Promise<boolean>;

	/**
	 * Check if a specific date is a trading day.
	 * @param date - Date to check (ISO string or Date object)
	 * @returns true if market is open on this date
	 */
	isTradingDay(date: Date | string): Promise<boolean>;

	/**
	 * Get the market close time for a specific date.
	 * @param date - Date to check
	 * @returns Close time in HH:MM ET format, or null if market closed
	 */
	getMarketCloseTime(date: Date | string): Promise<string | null>;

	/**
	 * Get the current trading session for a datetime.
	 * @param datetime - DateTime to check
	 * @returns Current trading session
	 */
	getTradingSession(datetime: Date | string): Promise<TradingSession>;

	/**
	 * Check if currently within Regular Trading Hours (RTH).
	 * @param datetime - DateTime to check (defaults to now)
	 * @returns true if within RTH (9:30 AM - 4:00 PM ET)
	 */
	isRTH(datetime?: Date | string): Promise<boolean>;

	/**
	 * Get the next trading day after a date.
	 * @param date - Starting date
	 * @returns Next trading day
	 */
	getNextTradingDay(date: Date | string): Promise<Date>;

	/**
	 * Get the previous trading day before a date.
	 * @param date - Starting date
	 * @returns Previous trading day
	 */
	getPreviousTradingDay(date: Date | string): Promise<Date>;

	/**
	 * Get the current market clock status.
	 * @returns Market clock with open status and next open/close times
	 */
	getClock(): Promise<MarketClock>;

	/**
	 * Get calendar data for a date range.
	 * @param start - Start date (inclusive)
	 * @param end - End date (inclusive)
	 * @returns Array of calendar days in the range
	 */
	getCalendarRange(start: Date | string, end: Date | string): Promise<CalendarDay[]>;

	// ----------------------------------------
	// Sync Methods (Backward Compatibility)
	// ----------------------------------------

	/**
	 * Synchronous check if a date is a trading day.
	 * Uses cached data; may throw if cache not populated.
	 * @param date - Date to check
	 * @returns true if trading day
	 */
	isTradingDaySync(date: Date | string): boolean;

	/**
	 * Synchronous get trading session.
	 * Uses cached data; may throw if cache not populated.
	 * @param datetime - DateTime to check
	 * @returns Current trading session
	 */
	getTradingSessionSync(datetime: Date | string): TradingSession;

	/**
	 * Synchronous get market close time.
	 * Uses cached data; may throw if cache not populated.
	 * @param date - Date to check
	 * @returns Close time in HH:MM ET, or null
	 */
	getMarketCloseTimeSync(date: Date | string): string | null;
}

// ============================================
// Helper Types
// ============================================

/**
 * Options for creating a CalendarService instance.
 */
export interface CalendarServiceOptions {
	/** Cache TTL in milliseconds (default: 24 hours) */
	cacheTtl?: number;
	/** Pre-populate cache for this date range on init */
	prefetchRange?: { start: Date; end: Date };
}

/**
 * Calendar cache entry with expiration.
 */
export interface CalendarCacheEntry {
	/** Cached calendar days */
	days: Map<string, CalendarDay>;
	/** Cache expiration timestamp */
	expiresAt: number;
}
