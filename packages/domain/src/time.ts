/**
 * ISO-8601 / RFC 3339 Timestamp Utilities
 *
 * Cross-language compatible timestamp handling for the polyglot stack.
 * Uses ISO-8601 format (RFC 3339 subset) for consistency between TypeScript and Rust.
 *
 * ## Format Specification
 * - **Full timestamp**: "2026-01-04T15:30:45.123Z" (UTC only, no timezone offset)
 * - **Date only**: "2026-01-04" (for option expirations)
 * - Always use UTC (Z suffix), never local timezone offsets
 * - Millisecond precision (3 decimal places)
 *
 * ## Why ISO-8601 Strings Instead of Protobuf Timestamp
 * 1. JSON-friendly: No special serialization needed
 * 2. Human-readable: Easy to debug and log
 * 3. Cross-language: Same format in TypeScript, Rust, Python
 * 4. Avoids BigInt: Protobuf Timestamp uses int64 seconds which causes friction
 *
 * ## Why Not JavaScript Date Directly
 * 1. Date.toISOString() doesn't guarantee millisecond precision
 * 2. Date parsing is locale-dependent and error-prone
 * 3. This module provides explicit validation and formatting
 *
 * @see packages/proto/cream/v1/common.proto (uses google.protobuf.Timestamp)
 * @see https://datatracker.ietf.org/doc/html/rfc3339
 */

import { z } from "zod";

// ============================================
// Constants
// ============================================

/**
 * ISO-8601 timestamp regex with optional milliseconds
 * For parsing flexibility - accepts .sss or no milliseconds
 */
const ISO_8601_FLEXIBLE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

/**
 * Date-only regex (YYYY-MM-DD)
 * Used for option expirations
 */
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Unix epoch start for validation
 */
const UNIX_EPOCH = new Date("1970-01-01T00:00:00.000Z");

// ============================================
// Zod Schemas
// ============================================

/**
 * Zod schema for ISO-8601 timestamp with timezone offset
 * Uses Zod's built-in datetime validation
 */
export const Iso8601Schema = z.string().datetime({ offset: true });
export type Iso8601 = z.infer<typeof Iso8601Schema>;

/**
 * Zod schema for strict UTC timestamp (Z suffix only)
 * Use this when you specifically need UTC-only validation
 */
export const Iso8601UtcSchema = z
	.string()
	.refine((val) => ISO_8601_FLEXIBLE_REGEX.test(val), {
		message: "Invalid ISO-8601 UTC timestamp format. Must be YYYY-MM-DDTHH:mm:ss.sssZ",
	})
	.refine(
		(val) => {
			const date = new Date(val);
			return !Number.isNaN(date.getTime());
		},
		{ message: "Invalid date value" }
	)
	.refine((val) => new Date(val) >= UNIX_EPOCH, {
		message: "Timestamp must be after Unix epoch (1970-01-01)",
	});
export type Iso8601Utc = z.infer<typeof Iso8601UtcSchema>;

/**
 * Zod schema for date-only string (YYYY-MM-DD)
 * Used for option expirations
 */
export const DateOnlySchema = z
	.string()
	.refine((val) => DATE_ONLY_REGEX.test(val), {
		message: "Invalid date format. Must be YYYY-MM-DD",
	})
	.refine(
		(val) => {
			// Validate it's a real date (e.g., reject 2026-02-30)
			const parts = val.split("-");
			const year = Number(parts[0]);
			const month = Number(parts[1]);
			const day = Number(parts[2]);

			if (!month || !day) {
				return false;
			}

			const date = new Date(year, month - 1, day);
			return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
		},
		{ message: "Invalid date value" }
	);
export type DateOnly = z.infer<typeof DateOnlySchema>;

// ============================================
// Conversion Functions
// ============================================

/**
 * Convert a Date to ISO-8601 string with guaranteed millisecond precision
 *
 * @param date - JavaScript Date object
 * @returns ISO-8601 formatted string (e.g., "2026-01-04T15:30:45.123Z")
 *
 * @example
 * ```ts
 * const timestamp = toIso8601(new Date());
 * // "2026-01-04T15:30:45.123Z"
 * ```
 */
export function toIso8601(date: Date): Iso8601Utc {
	if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
		throw new Error("Invalid Date object");
	}

	// Date.toISOString() already produces the correct format
	// with milliseconds and Z suffix
	return date.toISOString() as Iso8601Utc;
}

/**
 * Parse an ISO-8601 string to a JavaScript Date
 *
 * @param str - ISO-8601 formatted string
 * @returns JavaScript Date object
 * @throws Error if the string is not a valid ISO-8601 timestamp
 *
 * @example
 * ```ts
 * const date = fromIso8601("2026-01-04T15:30:45.123Z");
 * ```
 */
export function fromIso8601(str: string): Date {
	// Validate format first
	if (!isValidIso8601(str)) {
		throw new Error(`Invalid ISO-8601 format: ${str}`);
	}

	const date = new Date(str);

	if (Number.isNaN(date.getTime())) {
		throw new Error(`Invalid date value: ${str}`);
	}

	return date;
}

/**
 * Get the current time as an ISO-8601 string
 *
 * @returns Current time as ISO-8601 string (e.g., "2026-01-04T15:30:45.123Z")
 *
 * @example
 * ```ts
 * const now = nowIso8601();
 * // "2026-01-04T15:30:45.123Z"
 * ```
 */
export function nowIso8601(): Iso8601Utc {
	return toIso8601(new Date());
}

/**
 * Convert a Date to date-only string (YYYY-MM-DD)
 * Used for option expirations
 *
 * @param date - JavaScript Date object
 * @returns Date-only string (e.g., "2026-01-04")
 *
 * @example
 * ```ts
 * const expiration = toDateOnly(new Date());
 * // "2026-01-04"
 * ```
 */
export function toDateOnly(date: Date): DateOnly {
	if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
		throw new Error("Invalid Date object");
	}

	// Use UTC date to avoid timezone issues
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");

	return `${year}-${month}-${day}` as DateOnly;
}

/**
 * Parse a date-only string (YYYY-MM-DD) to a Date at midnight UTC
 *
 * @param str - Date-only string (e.g., "2026-01-04")
 * @returns JavaScript Date at midnight UTC
 * @throws Error if the string is not a valid date
 *
 * @example
 * ```ts
 * const date = fromDateOnly("2026-01-04");
 * // Date at 2026-01-04T00:00:00.000Z
 * ```
 */
export function fromDateOnly(str: string): Date {
	const result = DateOnlySchema.safeParse(str);
	if (!result.success) {
		throw new Error(`Invalid date format: ${str}`);
	}

	// Parse as UTC midnight
	const date = new Date(`${str}T00:00:00.000Z`);

	if (Number.isNaN(date.getTime())) {
		throw new Error(`Invalid date value: ${str}`);
	}

	return date;
}

// ============================================
// Validation Functions
// ============================================

/**
 * Check if a string is a valid ISO-8601 timestamp
 *
 * @param str - String to validate
 * @returns true if valid ISO-8601 UTC timestamp
 *
 * @example
 * ```ts
 * isValidIso8601("2026-01-04T15:30:45.123Z") // true
 * isValidIso8601("2026-01-04T15:30:45")      // false (no Z)
 * isValidIso8601("2026-01-04")               // false (no time)
 * ```
 */
export function isValidIso8601(str: string): boolean {
	if (!ISO_8601_FLEXIBLE_REGEX.test(str)) {
		return false;
	}

	const date = new Date(str);
	if (Number.isNaN(date.getTime())) {
		return false;
	}

	// Ensure it's after Unix epoch
	if (date < UNIX_EPOCH) {
		return false;
	}

	return true;
}

/**
 * Check if a string is a valid date-only string (YYYY-MM-DD)
 *
 * @param str - String to validate
 * @returns true if valid YYYY-MM-DD format
 *
 * @example
 * ```ts
 * isValidDateOnly("2026-01-04")  // true
 * isValidDateOnly("2026-02-30")  // false (invalid day)
 * isValidDateOnly("01-04-2026")  // false (wrong format)
 * ```
 */
export function isValidDateOnly(str: string): boolean {
	return DateOnlySchema.safeParse(str).success;
}

// ============================================
// Comparison Functions
// ============================================

/**
 * Compare two ISO-8601 timestamps
 *
 * @param a - First timestamp
 * @param b - Second timestamp
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareIso8601(a: string, b: string): -1 | 0 | 1 {
	const dateA = fromIso8601(a);
	const dateB = fromIso8601(b);

	if (dateA < dateB) {
		return -1;
	}
	if (dateA > dateB) {
		return 1;
	}
	return 0;
}

/**
 * Check if timestamp a is before timestamp b
 */
export function isBefore(a: string, b: string): boolean {
	return compareIso8601(a, b) < 0;
}

/**
 * Check if timestamp a is after timestamp b
 */
export function isAfter(a: string, b: string): boolean {
	return compareIso8601(a, b) > 0;
}

/**
 * Check if timestamp a is between start and end (inclusive)
 */
export function isBetween(timestamp: string, start: string, end: string): boolean {
	return compareIso8601(timestamp, start) >= 0 && compareIso8601(timestamp, end) <= 0;
}

// ============================================
// Arithmetic Functions
// ============================================

/**
 * Add milliseconds to a timestamp
 *
 * @param timestamp - ISO-8601 timestamp
 * @param ms - Milliseconds to add (can be negative)
 * @returns New ISO-8601 timestamp
 */
export function addMilliseconds(timestamp: string, ms: number): Iso8601Utc {
	const date = fromIso8601(timestamp);
	date.setTime(date.getTime() + ms);
	return toIso8601(date);
}

/**
 * Add seconds to a timestamp
 */
export function addSeconds(timestamp: string, seconds: number): Iso8601Utc {
	return addMilliseconds(timestamp, seconds * 1000);
}

/**
 * Add minutes to a timestamp
 */
export function addMinutes(timestamp: string, minutes: number): Iso8601Utc {
	return addMilliseconds(timestamp, minutes * 60 * 1000);
}

/**
 * Add hours to a timestamp
 */
export function addHours(timestamp: string, hours: number): Iso8601Utc {
	return addMilliseconds(timestamp, hours * 60 * 60 * 1000);
}

/**
 * Add days to a timestamp
 */
export function addDays(timestamp: string, days: number): Iso8601Utc {
	return addMilliseconds(timestamp, days * 24 * 60 * 60 * 1000);
}

/**
 * Get the difference between two timestamps in milliseconds
 *
 * @param a - First timestamp
 * @param b - Second timestamp
 * @returns Difference in milliseconds (a - b)
 */
export function diffMilliseconds(a: string, b: string): number {
	const dateA = fromIso8601(a);
	const dateB = fromIso8601(b);
	return dateA.getTime() - dateB.getTime();
}

// ============================================
// Trading-Specific Utilities
// ============================================

/**
 * Round timestamp down to the start of the hour
 * Useful for aligning to trading cycles
 *
 * @param timestamp - ISO-8601 timestamp
 * @returns Timestamp at the start of the hour
 *
 * @example
 * ```ts
 * startOfHour("2026-01-04T15:30:45.123Z")
 * // "2026-01-04T15:00:00.000Z"
 * ```
 */
export function startOfHour(timestamp: string): Iso8601Utc {
	const date = fromIso8601(timestamp);
	date.setUTCMinutes(0, 0, 0);
	return toIso8601(date);
}

/**
 * Round timestamp down to the start of the day (UTC)
 *
 * @param timestamp - ISO-8601 timestamp
 * @returns Timestamp at midnight UTC
 */
export function startOfDay(timestamp: string): Iso8601Utc {
	const date = fromIso8601(timestamp);
	date.setUTCHours(0, 0, 0, 0);
	return toIso8601(date);
}

/**
 * Check if two timestamps are on the same trading day (UTC)
 */
export function isSameTradingDay(a: string, b: string): boolean {
	return startOfDay(a) === startOfDay(b);
}

/**
 * Get the trading day as a date-only string
 *
 * @param timestamp - ISO-8601 timestamp
 * @returns Date-only string for the trading day
 */
export function getTradingDay(timestamp: string): DateOnly {
	const date = fromIso8601(timestamp);
	return toDateOnly(date);
}

/**
 * Calculate option expiration from a date-only string
 * Options typically expire at 4:00 PM ET on expiration date
 * This function returns the expiration moment in UTC
 *
 * @param expirationDate - Expiration date (YYYY-MM-DD)
 * @returns ISO-8601 timestamp of expiration (approx 9:00 PM UTC for ET)
 *
 * @example
 * ```ts
 * getOptionExpirationTime("2026-01-17")
 * // "2026-01-17T21:00:00.000Z" (4:00 PM ET = 9:00 PM UTC)
 * ```
 */
export function getOptionExpirationTime(expirationDate: string): Iso8601Utc {
	if (!isValidDateOnly(expirationDate)) {
		throw new Error(`Invalid expiration date format: ${expirationDate}`);
	}

	// Options expire at 4:00 PM ET
	// ET is UTC-5 (EST) or UTC-4 (EDT)
	// We use UTC-5 (21:00 UTC) as a conservative approximation
	return `${expirationDate}T21:00:00.000Z` as Iso8601Utc;
}

/**
 * Check if an option has expired
 *
 * @param expirationDate - Expiration date (YYYY-MM-DD)
 * @param currentTime - Current time (defaults to now)
 * @returns true if the option has expired
 */
export function isOptionExpired(expirationDate: string, currentTime?: string): boolean {
	const expiry = getOptionExpirationTime(expirationDate);
	const now = currentTime ?? nowIso8601();
	return isAfter(now, expiry);
}

/**
 * Get days until option expiration
 *
 * @param expirationDate - Expiration date (YYYY-MM-DD)
 * @param currentTime - Current time (defaults to now)
 * @returns Days until expiration (negative if expired)
 */
export function daysToExpiration(expirationDate: string, currentTime?: string): number {
	const expiry = getOptionExpirationTime(expirationDate);
	const now = currentTime ?? nowIso8601();
	const diffMs = diffMilliseconds(expiry, now);
	return diffMs / (24 * 60 * 60 * 1000);
}
