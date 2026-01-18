/**
 * Hardcoded NYSE Calendar Data (2024-2029)
 *
 * Static calendar data for testing where API calls are not available.
 * This data is consolidated from existing implementations and official NYSE schedules.
 *
 * Sources:
 * - NYSE official holiday calendar: https://www.nyse.com/markets/hours-calendars
 * - NYSE Group announcements for 2025-2028
 *
 * @see docs/plans/02-data-layer.md
 */

import type { CalendarDay } from "./types";

// ============================================
// Constants
// ============================================

/** Regular market open time (9:30 AM ET) */
export const REGULAR_OPEN = "09:30";

/** Regular market close time (4:00 PM ET) */
export const REGULAR_CLOSE = "16:00";

/** Early close time (1:00 PM ET) */
export const EARLY_CLOSE = "13:00";

/** Pre-market session open (4:00 AM ET) */
export const SESSION_OPEN = "04:00";

/** After-hours session close (8:00 PM ET) */
export const SESSION_CLOSE = "20:00";

// ============================================
// Holiday Definitions
// ============================================

/**
 * NYSE full-day market closures (2024-2029).
 *
 * Holidays observed:
 * - New Year's Day (Jan 1, or observed)
 * - Martin Luther King Jr. Day (3rd Monday in January)
 * - Presidents' Day (3rd Monday in February)
 * - Good Friday (Friday before Easter)
 * - Memorial Day (last Monday in May)
 * - Juneteenth (June 19, or observed)
 * - Independence Day (July 4, or observed)
 * - Labor Day (1st Monday in September)
 * - Thanksgiving Day (4th Thursday in November)
 * - Christmas Day (Dec 25, or observed)
 */
export const NYSE_HOLIDAYS: Set<string> = new Set([
	// 2024
	"2024-01-01", // New Year's Day
	"2024-01-15", // MLK Day
	"2024-02-19", // Presidents' Day
	"2024-03-29", // Good Friday
	"2024-05-27", // Memorial Day
	"2024-06-19", // Juneteenth
	"2024-07-04", // Independence Day
	"2024-09-02", // Labor Day
	"2024-11-28", // Thanksgiving
	"2024-12-25", // Christmas

	// 2025
	"2025-01-01", // New Year's Day
	"2025-01-20", // MLK Day
	"2025-02-17", // Presidents' Day
	"2025-04-18", // Good Friday
	"2025-05-26", // Memorial Day
	"2025-06-19", // Juneteenth
	"2025-07-04", // Independence Day
	"2025-09-01", // Labor Day
	"2025-11-27", // Thanksgiving
	"2025-12-25", // Christmas

	// 2026
	"2026-01-01", // New Year's Day
	"2026-01-19", // MLK Day
	"2026-02-16", // Presidents' Day
	"2026-04-03", // Good Friday
	"2026-05-25", // Memorial Day
	"2026-06-19", // Juneteenth
	"2026-07-03", // Independence Day (observed - July 4 is Saturday)
	"2026-09-07", // Labor Day
	"2026-11-26", // Thanksgiving
	"2026-12-25", // Christmas

	// 2027
	"2027-01-01", // New Year's Day
	"2027-01-18", // MLK Day
	"2027-02-15", // Presidents' Day
	"2027-03-26", // Good Friday
	"2027-05-31", // Memorial Day
	"2027-06-18", // Juneteenth (observed - June 19 is Saturday)
	"2027-07-05", // Independence Day (observed - July 4 is Sunday)
	"2027-09-06", // Labor Day
	"2027-11-25", // Thanksgiving
	"2027-12-24", // Christmas (observed - Dec 25 is Saturday)

	// 2028 (Note: New Year's Day 2028 falls on Saturday, not observed)
	"2028-01-17", // MLK Day
	"2028-02-21", // Presidents' Day
	"2028-04-14", // Good Friday
	"2028-05-29", // Memorial Day
	"2028-06-19", // Juneteenth
	"2028-07-04", // Independence Day
	"2028-09-04", // Labor Day
	"2028-11-23", // Thanksgiving
	"2028-12-25", // Christmas

	// 2029
	"2029-01-01", // New Year's Day
	"2029-01-15", // MLK Day
	"2029-02-19", // Presidents' Day
	"2029-03-30", // Good Friday
	"2029-05-28", // Memorial Day
	"2029-06-19", // Juneteenth
	"2029-07-04", // Independence Day
	"2029-09-03", // Labor Day
	"2029-11-22", // Thanksgiving
	"2029-12-25", // Christmas
]);

/**
 * NYSE early close dates (1:00 PM ET close).
 *
 * Early closes occur on:
 * - Day before Independence Day (July 3, if trading day)
 * - Day after Thanksgiving (Black Friday)
 * - Christmas Eve (Dec 24, if trading day)
 */
export const NYSE_EARLY_CLOSES: Set<string> = new Set([
	// 2024
	"2024-07-03", // Day before Independence Day
	"2024-11-29", // Day after Thanksgiving
	"2024-12-24", // Christmas Eve

	// 2025
	"2025-07-03", // Day before Independence Day
	"2025-11-28", // Day after Thanksgiving
	"2025-12-24", // Christmas Eve

	// 2026
	"2026-11-27", // Day after Thanksgiving
	"2026-12-24", // Christmas Eve
	// Note: July 3 is a full holiday in 2026 (Independence Day observed)

	// 2027
	"2027-11-26", // Day after Thanksgiving
	// Note: July 2 is Friday before Independence Day observed on Monday
	// Note: Dec 24 is a full holiday in 2027 (Christmas observed)

	// 2028
	"2028-07-03", // Day before Independence Day
	"2028-11-24", // Day after Thanksgiving
	// Note: Dec 24 falls on Sunday in 2028

	// 2029
	"2029-07-03", // Day before Independence Day
	"2029-11-23", // Day after Thanksgiving
	"2029-12-24", // Christmas Eve
]);

// ============================================
// Calendar Day Generation
// ============================================

/**
 * Check if a date string represents a weekend.
 */
function isWeekend(dateStr: string): boolean {
	const date = new Date(`${dateStr}T12:00:00Z`);
	const day = date.getUTCDay();
	return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

/**
 * Check if a date string is a market holiday.
 */
export function isHoliday(dateStr: string): boolean {
	return NYSE_HOLIDAYS.has(dateStr);
}

/**
 * Check if a date string is an early close day.
 */
export function isEarlyClose(dateStr: string): boolean {
	return NYSE_EARLY_CLOSES.has(dateStr);
}

/**
 * Check if a date string is a trading day.
 */
export function isTradingDay(dateStr: string): boolean {
	return !isWeekend(dateStr) && !isHoliday(dateStr);
}

/**
 * Get CalendarDay for a specific date.
 * Returns null if the date is not a trading day.
 */
export function getCalendarDay(dateStr: string): CalendarDay | null {
	if (!isTradingDay(dateStr)) {
		return null;
	}

	const close = isEarlyClose(dateStr) ? EARLY_CLOSE : REGULAR_CLOSE;

	return {
		date: dateStr,
		open: REGULAR_OPEN,
		close,
		sessionOpen: SESSION_OPEN,
		sessionClose: close === EARLY_CLOSE ? close : SESSION_CLOSE,
	};
}

/**
 * Generate CalendarDay array for a date range.
 *
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @returns Array of CalendarDay objects for trading days in range
 */
export function generateCalendarRange(startDate: string, endDate: string): CalendarDay[] {
	const days: CalendarDay[] = [];
	const start = new Date(`${startDate}T12:00:00Z`);
	const end = new Date(`${endDate}T12:00:00Z`);

	const current = new Date(start);
	while (current <= end) {
		const dateStr = current.toISOString().split("T")[0];
		if (dateStr) {
			const day = getCalendarDay(dateStr);
			if (day) {
				days.push(day);
			}
		}
		current.setUTCDate(current.getUTCDate() + 1);
	}

	return days;
}

/**
 * Get the next trading day after a given date.
 */
export function getNextTradingDay(dateStr: string): string {
	const date = new Date(`${dateStr}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() + 1);

	let nextStr = date.toISOString().split("T")[0];
	while (nextStr && !isTradingDay(nextStr)) {
		date.setUTCDate(date.getUTCDate() + 1);
		nextStr = date.toISOString().split("T")[0];
	}

	return nextStr ?? dateStr;
}

/**
 * Get the previous trading day before a given date.
 */
export function getPreviousTradingDay(dateStr: string): string {
	const date = new Date(`${dateStr}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() - 1);

	let prevStr = date.toISOString().split("T")[0];
	while (prevStr && !isTradingDay(prevStr)) {
		date.setUTCDate(date.getUTCDate() - 1);
		prevStr = date.toISOString().split("T")[0];
	}

	return prevStr ?? dateStr;
}
