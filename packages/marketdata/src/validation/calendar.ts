/**
 * Trading Calendar
 *
 * Calendar-aware validation for US equity markets.
 * Handles weekends, holidays, and market hours.
 *
 * Delegates to CalendarService from @cream/domain for trading day checks,
 * while providing time-aware market hours validation for data processing.
 *
 * @see docs/plans/02-data-layer.md
 */

import {
	getMarketCloseTime as getDomainMarketCloseTime,
	isMarketOpen as isDomainTradingDay,
} from "@cream/domain";

// ============================================
// Types
// ============================================

export interface MarketHours {
	open: { hour: number; minute: number };
	close: { hour: number; minute: number };
	timezone: string;
}

export interface MarketCalendarConfig {
	/** Regular market hours */
	regularHours: MarketHours;
	/** Extended/pre-market hours (optional) */
	extendedHours?: MarketHours;
}

// ============================================
// US Market Constants
// ============================================

/**
 * US equity market regular hours (EST/EDT).
 */
export const US_MARKET_HOURS: MarketHours = {
	open: { hour: 9, minute: 30 },
	close: { hour: 16, minute: 0 },
	timezone: "America/New_York",
};

/**
 * US equity extended hours.
 */
export const US_EXTENDED_HOURS: MarketHours = {
	open: { hour: 4, minute: 0 },
	close: { hour: 20, minute: 0 },
	timezone: "America/New_York",
};

/**
 * Default US market calendar configuration.
 */
export const DEFAULT_US_CALENDAR: MarketCalendarConfig = {
	regularHours: US_MARKET_HOURS,
	extendedHours: US_EXTENDED_HOURS,
};

// ============================================
// Calendar Functions
// ============================================

/**
 * Check if a date is a weekend (Saturday or Sunday).
 */
export function isWeekend(date: Date): boolean {
	const day = date.getDay();
	return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

/**
 * Check if a date is a US market holiday.
 * Delegates to CalendarService from @cream/domain.
 */
export function isHoliday(date: Date): boolean {
	// Use domain's isMarketOpen which checks weekends AND holidays
	// We need to isolate just the holiday check
	const isWeekendDay = isWeekend(date);
	if (isWeekendDay) {
		return false; // Weekends aren't holidays for this function's semantics
	}

	// If it's a weekday but not a trading day, it's a holiday
	return !isDomainTradingDay(date);
}

/**
 * Check if a date is an early close day.
 * Delegates to CalendarService from @cream/domain.
 */
export function isEarlyClose(date: Date): boolean {
	const closeTime = getDomainMarketCloseTime(date);
	// Early close if close time is before 16:00
	if (!closeTime) {
		return false;
	}
	const [hours] = closeTime.split(":").map(Number);
	return hours !== undefined && hours < 16;
}

/**
 * Check if a date is a trading day (not weekend or holiday).
 * Delegates to CalendarService from @cream/domain.
 */
export function isTradingDay(date: Date): boolean {
	return isDomainTradingDay(date);
}

/**
 * Check if market is open at a given timestamp.
 *
 * @param timestamp - ISO timestamp or Date
 * @param config - Calendar configuration
 * @param includeExtended - Include extended hours
 * @returns true if market is open
 */
export function isMarketOpen(
	timestamp: string | Date,
	config = DEFAULT_US_CALENDAR,
	includeExtended = false
): boolean {
	const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;

	// Check if trading day (delegates to domain)
	if (!isTradingDay(date)) {
		return false;
	}

	// Get hours in ET
	const etTime = new Date(date.toLocaleString("en-US", { timeZone: config.regularHours.timezone }));
	const hour = etTime.getHours();
	const minute = etTime.getMinutes();
	const totalMinutes = hour * 60 + minute;

	// Get applicable hours
	const hours =
		includeExtended && config.extendedHours ? config.extendedHours : config.regularHours;

	const openMinutes = hours.open.hour * 60 + hours.open.minute;
	let closeMinutes = hours.close.hour * 60 + hours.close.minute;

	// Handle early close
	if (isEarlyClose(date)) {
		closeMinutes = 13 * 60; // 1pm ET
	}

	return totalMinutes >= openMinutes && totalMinutes < closeMinutes;
}

/**
 * Get the next trading day after a given date.
 *
 * @param date - Starting date
 * @returns Next trading day
 */
export function getNextTradingDay(date: Date): Date {
	const nextDay = new Date(date);
	nextDay.setDate(nextDay.getDate() + 1);
	nextDay.setHours(0, 0, 0, 0);

	// Skip weekends and holidays
	while (!isTradingDay(nextDay)) {
		nextDay.setDate(nextDay.getDate() + 1);
	}

	return nextDay;
}

/**
 * Get the previous trading day before a given date.
 *
 * @param date - Starting date
 * @returns Previous trading day
 */
export function getPreviousTradingDay(date: Date): Date {
	const prevDay = new Date(date);
	prevDay.setDate(prevDay.getDate() - 1);
	prevDay.setHours(0, 0, 0, 0);

	// Skip weekends and holidays
	while (!isTradingDay(prevDay)) {
		prevDay.setDate(prevDay.getDate() - 1);
	}

	return prevDay;
}

/**
 * Calculate trading days between two dates (exclusive of start, inclusive of end).
 */
export function getTradingDaysBetween(start: Date, end: Date): number {
	let count = 0;
	const current = new Date(start);
	current.setDate(current.getDate() + 1);

	while (current <= end) {
		if (isTradingDay(current)) {
			count++;
		}
		current.setDate(current.getDate() + 1);
	}

	return count;
}

/**
 * Check if a gap between timestamps is expected (crosses non-trading period).
 *
 * @param timestamp1 - First timestamp (earlier)
 * @param timestamp2 - Second timestamp (later)
 * @param config - Calendar configuration
 * @returns true if gap is expected due to non-trading period
 */
export function isExpectedGap(
	timestamp1: string,
	timestamp2: string,
	config = DEFAULT_US_CALENDAR
): boolean {
	const date1 = new Date(timestamp1);
	const date2 = new Date(timestamp2);

	const day1 = date1.toISOString().split("T")[0] ?? "";
	const day2 = date2.toISOString().split("T")[0] ?? "";

	if (day1 !== day2) {
		const nextTrading = getNextTradingDay(date1);
		const nextTradingStr = nextTrading.toISOString().split("T")[0] ?? "";

		// If next trading day is the same as day2, gap is expected (overnight)
		if (nextTradingStr === day2) {
			return true;
		}

		// If there are non-trading days between, gap is expected
		return nextTradingStr !== day2;
	}

	// Same day - check if gap crosses market close
	const etTime1 = new Date(
		date1.toLocaleString("en-US", { timeZone: config.regularHours.timezone })
	);
	const etTime2 = new Date(
		date2.toLocaleString("en-US", { timeZone: config.regularHours.timezone })
	);

	const closeMinutes = config.regularHours.close.hour * 60 + config.regularHours.close.minute;
	const openMinutes = config.regularHours.open.hour * 60 + config.regularHours.open.minute;

	const minutes1 = etTime1.getHours() * 60 + etTime1.getMinutes();
	const minutes2 = etTime2.getHours() * 60 + etTime2.getMinutes();

	// If first is before close and second is after open next day (or crosses overnight)
	return minutes1 < closeMinutes && minutes2 >= openMinutes && minutes2 < minutes1;
}

export default {
	isWeekend,
	isHoliday,
	isEarlyClose,
	isTradingDay,
	isMarketOpen,
	getNextTradingDay,
	getPreviousTradingDay,
	getTradingDaysBetween,
	isExpectedGap,
	DEFAULT_US_CALENDAR,
	US_MARKET_HOURS,
	US_EXTENDED_HOURS,
};
