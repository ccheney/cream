/**
 * Calendar Data Cache
 *
 * In-memory caching for calendar and clock data with TTL.
 * Used by AlpacaCalendarService to reduce API calls.
 *
 * @see docs/plans/02-data-layer.md - Session and Calendar Handling
 */

import type { AlpacaCalendarClient } from "./alpaca-client";
import type { CalendarDay, MarketClock } from "./types";

// ============================================
// Types
// ============================================

/**
 * Cache entry for year calendar data.
 */
interface YearCacheEntry {
	data: CalendarDay[];
	expiresAt: number;
}

/**
 * Cache entry for market clock.
 */
interface ClockCacheEntry {
	data: MarketClock;
	expiresAt: number;
}

/**
 * Calendar cache configuration.
 */
export interface CalendarCacheConfig {
	/** Calendar data TTL in milliseconds (default: 24 hours) */
	calendarTtlMs?: number;
	/** Clock data TTL in milliseconds (default: 30 seconds) */
	clockTtlMs?: number;
}

/**
 * Calendar cache interface for dependency injection.
 */
export interface CalendarCache {
	/** Get calendar data for a year. Returns undefined if not cached or expired. */
	getYear(year: number): CalendarDay[] | undefined;
	/** Cache calendar data for a year. */
	setYear(year: number, days: CalendarDay[]): void;
	/** Get market clock. Returns undefined if not cached or expired. */
	getClock(): MarketClock | undefined;
	/** Cache market clock. */
	setClock(clock: MarketClock): void;
	/** Preload calendar data for specified years. */
	preloadYears(years: number[], client: AlpacaCalendarClient): Promise<void>;
	/** Check if a year is loaded and not expired. */
	isYearLoaded(year: number): boolean;
	/** Clear all cached data. Useful for testing. */
	clear(): void;
}

// ============================================
// Constants
// ============================================

/** Default calendar data TTL: 24 hours */
const DEFAULT_CALENDAR_TTL_MS = 24 * 60 * 60 * 1000;

/** Default clock data TTL: 30 seconds */
const DEFAULT_CLOCK_TTL_MS = 30 * 1000;

// ============================================
// Implementation
// ============================================

/**
 * In-memory calendar cache with TTL.
 *
 * Features:
 * - Per-year calendar data caching with 24-hour TTL
 * - Clock data caching with 30-second TTL
 * - Automatic expiration checking
 * - Preload support for multiple years
 *
 * @example
 * ```typescript
 * const cache = new InMemoryCalendarCache();
 *
 * // Cache year data
 * cache.setYear(2026, calendarDays);
 *
 * // Check and get cached data
 * if (cache.isYearLoaded(2026)) {
 *   const days = cache.getYear(2026);
 * }
 *
 * // Preload multiple years
 * await cache.preloadYears([2026, 2027], alpacaClient);
 * ```
 */
export class InMemoryCalendarCache implements CalendarCache {
	private readonly yearCache = new Map<number, YearCacheEntry>();
	private clockCache: ClockCacheEntry | undefined;

	private readonly calendarTtlMs: number;
	private readonly clockTtlMs: number;

	constructor(config: CalendarCacheConfig = {}) {
		this.calendarTtlMs = config.calendarTtlMs ?? DEFAULT_CALENDAR_TTL_MS;
		this.clockTtlMs = config.clockTtlMs ?? DEFAULT_CLOCK_TTL_MS;
	}

	/**
	 * Get calendar data for a year.
	 * Returns undefined if not cached or expired.
	 */
	getYear(year: number): CalendarDay[] | undefined {
		const entry = this.yearCache.get(year);
		if (!entry) {
			return undefined;
		}

		if (Date.now() > entry.expiresAt) {
			this.yearCache.delete(year);
			return undefined;
		}

		return entry.data;
	}

	/**
	 * Cache calendar data for a year.
	 */
	setYear(year: number, days: CalendarDay[]): void {
		this.yearCache.set(year, {
			data: days,
			expiresAt: Date.now() + this.calendarTtlMs,
		});
	}

	/**
	 * Get market clock.
	 * Returns undefined if not cached or expired.
	 */
	getClock(): MarketClock | undefined {
		if (!this.clockCache) {
			return undefined;
		}

		if (Date.now() > this.clockCache.expiresAt) {
			this.clockCache = undefined;
			return undefined;
		}

		return this.clockCache.data;
	}

	/**
	 * Cache market clock.
	 */
	setClock(clock: MarketClock): void {
		this.clockCache = {
			data: clock,
			expiresAt: Date.now() + this.clockTtlMs,
		};
	}

	/**
	 * Preload calendar data for specified years.
	 * Fetches data from the Alpaca API and caches it.
	 */
	async preloadYears(years: number[], client: AlpacaCalendarClient): Promise<void> {
		await Promise.all(
			years.map(async (year) => {
				// Skip if already loaded and not expired
				if (this.isYearLoaded(year)) {
					return;
				}

				const startDate = `${year}-01-01`;
				const endDate = `${year}-12-31`;
				const days = await client.getCalendar(startDate, endDate);
				this.setYear(year, days);
			})
		);
	}

	/**
	 * Check if a year is loaded and not expired.
	 */
	isYearLoaded(year: number): boolean {
		const entry = this.yearCache.get(year);
		if (!entry) {
			return false;
		}

		if (Date.now() > entry.expiresAt) {
			this.yearCache.delete(year);
			return false;
		}

		return true;
	}

	/**
	 * Clear all cached data.
	 */
	clear(): void {
		this.yearCache.clear();
		this.clockCache = undefined;
	}
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new calendar cache instance.
 *
 * @param config - Cache configuration
 * @returns Configured cache instance
 */
export function createCalendarCache(config?: CalendarCacheConfig): CalendarCache {
	return new InMemoryCalendarCache(config);
}
