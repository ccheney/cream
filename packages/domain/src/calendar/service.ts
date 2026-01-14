/**
 * Calendar Service Implementations
 *
 * - HardcodedCalendarService: BACKTEST mode (static data, no API calls)
 * - AlpacaCalendarService: PAPER/LIVE modes (API with caching)
 *
 * @see docs/plans/02-data-layer.md - Session and Calendar Handling
 */

import {
	type AlpacaCalendarClient,
	type AlpacaCalendarClientConfig,
	CalendarClientError,
	createAlpacaCalendarClient,
} from "./alpaca-client";
import { type CalendarCache, createCalendarCache } from "./cache";
import {
	EARLY_CLOSE,
	generateCalendarRange,
	getNextTradingDay as getNextTradingDayStr,
	getPreviousTradingDay as getPreviousTradingDayStr,
	isEarlyClose,
	isTradingDay as isTradingDayStr,
	REGULAR_CLOSE,
	REGULAR_OPEN,
} from "./hardcoded";
import type { CalendarDay, CalendarService, MarketClock, TradingSession } from "./types";

// ============================================
// Constants
// ============================================

/** Pre-market start in minutes from midnight ET */
const PRE_MARKET_START_MINUTES = 4 * 60; // 04:00

/** RTH start in minutes from midnight ET */
const RTH_START_MINUTES = 9 * 60 + 30; // 09:30

/** Regular close in minutes from midnight ET */
const REGULAR_CLOSE_MINUTES = 16 * 60; // 16:00

/** Early close in minutes from midnight ET */
const EARLY_CLOSE_MINUTES = 13 * 60; // 13:00

/** After-hours end in minutes from midnight ET */
const AFTER_HOURS_END_MINUTES = 20 * 60; // 20:00

// ============================================
// Utilities
// ============================================

/**
 * Format a Date to YYYY-MM-DD string.
 */
function formatDateStr(date: Date | string): string {
	if (typeof date === "string") {
		// If already a date string, extract just the date part
		return date.slice(0, 10);
	}
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/**
 * Get time in ET (Eastern Time) as minutes from midnight.
 * Approximates ET as UTC-5 (ignores DST for simplicity in backtest).
 */
function getETMinutes(date: Date): number {
	const hours = date.getUTCHours() - 5;
	const minutes = date.getUTCMinutes();
	const totalMinutes = hours * 60 + minutes;
	// Handle negative hours (next day UTC)
	return totalMinutes < 0 ? totalMinutes + 24 * 60 : totalMinutes;
}

/**
 * Parse date input to Date object.
 */
function toDate(date: Date | string): Date {
	if (typeof date === "string") {
		// Handle date-only strings by adding noon UTC to avoid timezone issues
		if (date.length === 10) {
			return new Date(`${date}T12:00:00Z`);
		}
		return new Date(date);
	}
	return date;
}

// ============================================
// HardcodedCalendarService
// ============================================

/**
 * CalendarService implementation using hardcoded NYSE calendar data.
 *
 * Features:
 * - All methods are synchronous internally (wrapped in Promise.resolve)
 * - Uses hardcoded holiday/early close data from 2024-2029
 * - getClock() always returns { isOpen: true } for BACKTEST mode
 * - No network calls
 *
 * @example
 * ```typescript
 * const calendar = new HardcodedCalendarService();
 *
 * // Async API (recommended)
 * const isOpen = await calendar.isTradingDay("2026-01-15");
 *
 * // Sync API (for backward compatibility)
 * const session = calendar.getTradingSessionSync(new Date());
 * ```
 */
export class HardcodedCalendarService implements CalendarService {
	// ----------------------------------------
	// Async Methods (Primary API)
	// ----------------------------------------

	/**
	 * Check if the market is currently open.
	 * In BACKTEST mode, this always returns true during valid trading sessions.
	 */
	async isMarketOpen(): Promise<boolean> {
		// In BACKTEST, we consider market always "open" for trading purposes
		// The actual session logic handles RTH vs extended hours
		return true;
	}

	/**
	 * Check if a specific date is a trading day.
	 */
	async isTradingDay(date: Date | string): Promise<boolean> {
		return this.isTradingDaySync(date);
	}

	/**
	 * Get the market close time for a specific date.
	 */
	async getMarketCloseTime(date: Date | string): Promise<string | null> {
		return this.getMarketCloseTimeSync(date);
	}

	/**
	 * Get the current trading session for a datetime.
	 */
	async getTradingSession(datetime: Date | string): Promise<TradingSession> {
		return this.getTradingSessionSync(datetime);
	}

	/**
	 * Check if currently within Regular Trading Hours (RTH).
	 */
	async isRTH(datetime?: Date | string): Promise<boolean> {
		const dt = datetime ?? new Date();
		return this.getTradingSessionSync(dt) === "RTH";
	}

	/**
	 * Get the next trading day after a date.
	 */
	async getNextTradingDay(date: Date | string): Promise<Date> {
		const dateStr = formatDateStr(date);
		const nextStr = getNextTradingDayStr(dateStr);
		return new Date(`${nextStr}T12:00:00Z`);
	}

	/**
	 * Get the previous trading day before a date.
	 */
	async getPreviousTradingDay(date: Date | string): Promise<Date> {
		const dateStr = formatDateStr(date);
		const prevStr = getPreviousTradingDayStr(dateStr);
		return new Date(`${prevStr}T12:00:00Z`);
	}

	/**
	 * Get the current market clock status.
	 *
	 * In BACKTEST mode, always returns isOpen: true with mock timestamps.
	 * This allows backtests to execute trades at any point in the simulation.
	 */
	async getClock(): Promise<MarketClock> {
		const now = new Date();
		const dateStr = formatDateStr(now);

		// In BACKTEST, market is always "open"
		// We still provide realistic next open/close times
		const nextTradingDay = isTradingDayStr(dateStr) ? dateStr : getNextTradingDayStr(dateStr);

		const closeTime = this.getMarketCloseTimeSync(nextTradingDay) ?? REGULAR_CLOSE;

		return {
			isOpen: true,
			timestamp: now,
			nextOpen: new Date(`${nextTradingDay}T${REGULAR_OPEN}:00.000-05:00`),
			nextClose: new Date(`${nextTradingDay}T${closeTime}:00.000-05:00`),
		};
	}

	/**
	 * Get calendar data for a date range.
	 */
	async getCalendarRange(start: Date | string, end: Date | string): Promise<CalendarDay[]> {
		const startStr = formatDateStr(start);
		const endStr = formatDateStr(end);
		return generateCalendarRange(startStr, endStr);
	}

	// ----------------------------------------
	// Sync Methods (Backward Compatibility)
	// ----------------------------------------

	/**
	 * Synchronous check if a date is a trading day.
	 */
	isTradingDaySync(date: Date | string): boolean {
		const dateStr = formatDateStr(date);
		return isTradingDayStr(dateStr);
	}

	/**
	 * Synchronous get trading session.
	 */
	getTradingSessionSync(datetime: Date | string): TradingSession {
		const dateObj = toDate(datetime);
		const dateStr = formatDateStr(dateObj);

		// Check if market is open on this date
		if (!isTradingDayStr(dateStr)) {
			return "CLOSED";
		}

		// Get time in ET
		const etMinutes = getETMinutes(dateObj);

		// Get close time for this date
		const closeMinutes = isEarlyClose(dateStr) ? EARLY_CLOSE_MINUTES : REGULAR_CLOSE_MINUTES;

		// Determine session based on time
		if (etMinutes < PRE_MARKET_START_MINUTES || etMinutes >= AFTER_HOURS_END_MINUTES) {
			return "CLOSED";
		}

		if (etMinutes < RTH_START_MINUTES) {
			return "PRE_MARKET";
		}

		if (etMinutes < closeMinutes) {
			return "RTH";
		}

		// After close time
		if (isEarlyClose(dateStr)) {
			// Early close day - no after hours
			return "CLOSED";
		}

		return "AFTER_HOURS";
	}

	/**
	 * Synchronous get market close time.
	 */
	getMarketCloseTimeSync(date: Date | string): string | null {
		const dateStr = formatDateStr(date);

		if (!isTradingDayStr(dateStr)) {
			return null;
		}

		return isEarlyClose(dateStr) ? EARLY_CLOSE : REGULAR_CLOSE;
	}
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new HardcodedCalendarService instance.
 *
 * @returns CalendarService for BACKTEST mode
 */
export function createHardcodedCalendarService(): CalendarService {
	return new HardcodedCalendarService();
}

// ============================================
// AlpacaCalendarService
// ============================================

/**
 * Error thrown when calendar data is not available.
 */
export class CalendarServiceError extends Error {
	constructor(
		message: string,
		public readonly code: "NOT_INITIALIZED" | "API_UNAVAILABLE" | "CACHE_MISS"
	) {
		super(message);
		this.name = "CalendarServiceError";
	}
}

/**
 * Configuration for AlpacaCalendarService.
 */
export interface AlpacaCalendarServiceConfig extends AlpacaCalendarClientConfig {
	/** Years to preload on initialization (default: current year and next year) */
	preloadYears?: number[];
}

/**
 * CalendarService implementation using Alpaca Calendar API.
 *
 * Features:
 * - Fetches calendar data from Alpaca API with caching
 * - Preloads current + next year on initialization
 * - Sync wrappers throw errors if cache not warmed
 * - NO fallback to hardcoded data - API failures throw errors
 *
 * @example
 * ```typescript
 * const service = await createAlpacaCalendarService({
 *   apiKey: process.env.ALPACA_KEY!,
 *   apiSecret: process.env.ALPACA_SECRET!,
 *   environment: "PAPER",
 * });
 *
 * // Async API (primary)
 * const isOpen = await service.isMarketOpen();
 * const session = await service.getTradingSession(new Date());
 *
 * // Sync API (uses cache, throws if not preloaded)
 * const isTradingDay = service.isTradingDaySync("2026-01-15");
 * ```
 */
export class AlpacaCalendarService implements CalendarService {
	private readonly client: AlpacaCalendarClient;
	private readonly cache: CalendarCache;

	constructor(
		config: AlpacaCalendarServiceConfig,
		client?: AlpacaCalendarClient,
		cache?: CalendarCache
	) {
		this.client = client ?? createAlpacaCalendarClient(config);
		this.cache = cache ?? createCalendarCache();
	}

	/**
	 * Initialize the service by preloading calendar data.
	 * Must be called before using sync methods.
	 */
	async initialize(preloadYears?: number[]): Promise<void> {
		const currentYear = new Date().getUTCFullYear();
		const years = preloadYears ?? [currentYear, currentYear + 1];

		try {
			await this.cache.preloadYears(years, this.client);
		} catch (error) {
			if (error instanceof CalendarClientError) {
				throw new CalendarServiceError(
					`Failed to initialize calendar service: ${error.message}`,
					"API_UNAVAILABLE"
				);
			}
			throw error;
		}
	}

	// ----------------------------------------
	// Async Methods (Primary API)
	// ----------------------------------------

	/**
	 * Check if the market is currently open.
	 */
	async isMarketOpen(): Promise<boolean> {
		const clock = await this.getClock();
		return clock.isOpen;
	}

	/**
	 * Check if a specific date is a trading day.
	 */
	async isTradingDay(date: Date | string): Promise<boolean> {
		const dateStr = formatDateStr(date);
		const year = Number.parseInt(dateStr.slice(0, 4), 10);
		const days = await this.getYearData(year);
		return days.some((d) => d.date === dateStr);
	}

	/**
	 * Get the market close time for a specific date.
	 */
	async getMarketCloseTime(date: Date | string): Promise<string | null> {
		const dateStr = formatDateStr(date);
		const year = Number.parseInt(dateStr.slice(0, 4), 10);
		const days = await this.getYearData(year);
		const day = days.find((d) => d.date === dateStr);
		return day?.close ?? null;
	}

	/**
	 * Get the current trading session for a datetime.
	 */
	async getTradingSession(datetime: Date | string): Promise<TradingSession> {
		const dateObj = toDate(datetime);
		const dateStr = formatDateStr(dateObj);
		const year = Number.parseInt(dateStr.slice(0, 4), 10);

		const days = await this.getYearData(year);
		const day = days.find((d) => d.date === dateStr);

		if (!day) {
			return "CLOSED";
		}

		// Get time in ET
		const etMinutes = getETMinutes(dateObj);
		const closeMinutes = parseTimeToMinutes(day.close);
		const openMinutes = parseTimeToMinutes(day.open);

		// Determine session based on time
		if (etMinutes < PRE_MARKET_START_MINUTES || etMinutes >= AFTER_HOURS_END_MINUTES) {
			return "CLOSED";
		}

		if (etMinutes < openMinutes) {
			return "PRE_MARKET";
		}

		if (etMinutes < closeMinutes) {
			return "RTH";
		}

		// Check if early close (no after hours)
		if (closeMinutes < REGULAR_CLOSE_MINUTES) {
			return "CLOSED";
		}

		return "AFTER_HOURS";
	}

	/**
	 * Check if currently within Regular Trading Hours (RTH).
	 */
	async isRTH(datetime?: Date | string): Promise<boolean> {
		const dt = datetime ?? new Date();
		const session = await this.getTradingSession(dt);
		return session === "RTH";
	}

	/**
	 * Get the next trading day after a date.
	 */
	async getNextTradingDay(date: Date | string): Promise<Date> {
		const dateStr = formatDateStr(date);
		const currentDate = new Date(`${dateStr}T12:00:00Z`);
		const currentYear = currentDate.getUTCFullYear();

		// Get data for current and next year
		const currentYearDays = await this.getYearData(currentYear);
		const nextYearDays = await this.getYearData(currentYear + 1);
		const allDays = [...currentYearDays, ...nextYearDays];

		// Find the next trading day
		for (const day of allDays) {
			if (day.date > dateStr) {
				return new Date(`${day.date}T12:00:00Z`);
			}
		}

		// Shouldn't happen if we have enough data, but fallback
		throw new CalendarServiceError(
			`Unable to find next trading day after ${dateStr}`,
			"CACHE_MISS"
		);
	}

	/**
	 * Get the previous trading day before a date.
	 */
	async getPreviousTradingDay(date: Date | string): Promise<Date> {
		const dateStr = formatDateStr(date);
		const currentDate = new Date(`${dateStr}T12:00:00Z`);
		const currentYear = currentDate.getUTCFullYear();

		// Get data for current and previous year
		const currentYearDays = await this.getYearData(currentYear);
		const prevYearDays = await this.getYearData(currentYear - 1);
		const allDays = [...prevYearDays, ...currentYearDays].toReversed();

		// Find the previous trading day
		for (const day of allDays) {
			if (day.date < dateStr) {
				return new Date(`${day.date}T12:00:00Z`);
			}
		}

		// Shouldn't happen if we have enough data, but fallback
		throw new CalendarServiceError(
			`Unable to find previous trading day before ${dateStr}`,
			"CACHE_MISS"
		);
	}

	/**
	 * Get the current market clock status.
	 */
	async getClock(): Promise<MarketClock> {
		// Check cache first
		const cached = this.cache.getClock();
		if (cached) {
			return cached;
		}

		// Fetch from API
		try {
			const clock = await this.client.getClock();
			this.cache.setClock(clock);
			return clock;
		} catch (error) {
			if (error instanceof CalendarClientError) {
				throw new CalendarServiceError(
					`Alpaca Calendar API unavailable: ${error.message}`,
					"API_UNAVAILABLE"
				);
			}
			throw error;
		}
	}

	/**
	 * Get calendar data for a date range.
	 */
	async getCalendarRange(start: Date | string, end: Date | string): Promise<CalendarDay[]> {
		const startStr = formatDateStr(start);
		const endStr = formatDateStr(end);
		const startYear = Number.parseInt(startStr.slice(0, 4), 10);
		const endYear = Number.parseInt(endStr.slice(0, 4), 10);

		const allDays: CalendarDay[] = [];
		for (let year = startYear; year <= endYear; year++) {
			const yearDays = await this.getYearData(year);
			allDays.push(...yearDays);
		}

		return allDays.filter((d) => d.date >= startStr && d.date <= endStr);
	}

	// ----------------------------------------
	// Sync Methods (Backward Compatibility)
	// ----------------------------------------

	/**
	 * Synchronous check if a date is a trading day.
	 * Throws if year data not preloaded.
	 */
	isTradingDaySync(date: Date | string): boolean {
		const dateStr = formatDateStr(date);
		const year = Number.parseInt(dateStr.slice(0, 4), 10);
		const days = this.getYearDataSync(year);
		return days.some((d) => d.date === dateStr);
	}

	/**
	 * Synchronous get trading session.
	 * Throws if year data not preloaded.
	 */
	getTradingSessionSync(datetime: Date | string): TradingSession {
		const dateObj = toDate(datetime);
		const dateStr = formatDateStr(dateObj);
		const year = Number.parseInt(dateStr.slice(0, 4), 10);

		const days = this.getYearDataSync(year);
		const day = days.find((d) => d.date === dateStr);

		if (!day) {
			return "CLOSED";
		}

		// Get time in ET
		const etMinutes = getETMinutes(dateObj);
		const closeMinutes = parseTimeToMinutes(day.close);
		const openMinutes = parseTimeToMinutes(day.open);

		// Determine session based on time
		if (etMinutes < PRE_MARKET_START_MINUTES || etMinutes >= AFTER_HOURS_END_MINUTES) {
			return "CLOSED";
		}

		if (etMinutes < openMinutes) {
			return "PRE_MARKET";
		}

		if (etMinutes < closeMinutes) {
			return "RTH";
		}

		// Check if early close (no after hours)
		if (closeMinutes < REGULAR_CLOSE_MINUTES) {
			return "CLOSED";
		}

		return "AFTER_HOURS";
	}

	/**
	 * Synchronous get market close time.
	 * Throws if year data not preloaded.
	 */
	getMarketCloseTimeSync(date: Date | string): string | null {
		const dateStr = formatDateStr(date);
		const year = Number.parseInt(dateStr.slice(0, 4), 10);
		const days = this.getYearDataSync(year);
		const day = days.find((d) => d.date === dateStr);
		return day?.close ?? null;
	}

	// ----------------------------------------
	// Private Helpers
	// ----------------------------------------

	/**
	 * Get year data from cache or fetch from API.
	 */
	private async getYearData(year: number): Promise<CalendarDay[]> {
		// Check cache first
		const cached = this.cache.getYear(year);
		if (cached) {
			return cached;
		}

		// Fetch from API
		try {
			await this.cache.preloadYears([year], this.client);
			const data = this.cache.getYear(year);
			if (!data) {
				throw new CalendarServiceError(
					`Failed to load calendar data for year ${year}`,
					"API_UNAVAILABLE"
				);
			}
			return data;
		} catch (error) {
			if (error instanceof CalendarServiceError) {
				throw error;
			}
			if (error instanceof CalendarClientError) {
				throw new CalendarServiceError(
					`Alpaca Calendar API unavailable: ${error.message}`,
					"API_UNAVAILABLE"
				);
			}
			throw error;
		}
	}

	/**
	 * Get year data from cache synchronously.
	 * Throws if not preloaded.
	 */
	private getYearDataSync(year: number): CalendarDay[] {
		const cached = this.cache.getYear(year);
		if (!cached) {
			throw new CalendarServiceError(
				`Calendar data for year ${year} not preloaded. Call initialize() first.`,
				"NOT_INITIALIZED"
			);
		}
		return cached;
	}
}

/**
 * Parse HH:MM time string to minutes since midnight.
 */
function parseTimeToMinutes(time: string): number {
	const parts = time.split(":").map(Number);
	const hours = parts[0] ?? 0;
	const minutes = parts[1] ?? 0;
	return hours * 60 + minutes;
}

// ============================================
// Alpaca Factory Function
// ============================================

/**
 * Create and initialize an AlpacaCalendarService instance.
 *
 * @param config - Service configuration
 * @returns Initialized CalendarService for PAPER/LIVE modes
 */
export async function createAlpacaCalendarService(
	config: AlpacaCalendarServiceConfig
): Promise<CalendarService> {
	const service = new AlpacaCalendarService(config);
	await service.initialize(config.preloadYears);
	return service;
}
