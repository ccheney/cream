/**
 * Broker Utilities
 *
 * Helper functions for order ID generation, validation, etc.
 */

import type { OrderLeg } from "./types.js";

/**
 * Generate a unique client order ID with environment prefix.
 *
 * Format: {prefix}-{timestamp}-{random}
 *
 * @param prefix - Environment prefix (e.g., "paper", "live")
 * @returns Unique order ID
 *
 * @example
 * ```typescript
 * generateOrderId("paper") // "paper-1704326400000-a1b2c3"
 * ```
 */
export function generateOrderId(prefix: string): string {
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 8);
	return `${prefix}-${timestamp}-${random}`;
}

/**
 * Calculate the Greatest Common Divisor of two numbers.
 *
 * @param a - First number
 * @param b - Second number
 * @returns GCD of a and b
 */
export function gcd(a: number, b: number): number {
	let x = Math.abs(a);
	let y = Math.abs(b);
	while (y !== 0) {
		const temp = y;
		y = x % y;
		x = temp;
	}
	return x;
}

/**
 * Calculate the GCD of an array of numbers.
 *
 * @param numbers - Array of numbers
 * @returns GCD of all numbers
 */
export function gcdArray(numbers: number[]): number {
	if (numbers.length === 0) {
		return 1;
	}
	const first = numbers[0];
	if (first === undefined) {
		return 1;
	}
	return numbers.reduce((acc, n) => gcd(acc, n), first);
}

/**
 * Validate that leg ratios are simplified (GCD = 1).
 *
 * Multi-leg options orders require simplified ratios to ensure
 * proper execution.
 *
 * @param legs - Order legs with ratios
 * @returns True if ratios are simplified
 *
 * @example
 * ```typescript
 * // Valid: ratios are simplified
 * validateLegRatios([{ symbol: "A", ratio: 1 }, { symbol: "B", ratio: -2 }]) // true
 *
 * // Invalid: ratios can be simplified (2:4 -> 1:2)
 * validateLegRatios([{ symbol: "A", ratio: 2 }, { symbol: "B", ratio: -4 }]) // false
 * ```
 */
export function validateLegRatios(legs: OrderLeg[]): boolean {
	if (legs.length === 0) {
		return true;
	}

	const ratios = legs.map((leg) => Math.abs(leg.ratio));
	const legGcd = gcdArray(ratios);

	return legGcd === 1;
}

/**
 * Simplify leg ratios by dividing by their GCD.
 *
 * @param legs - Order legs with ratios
 * @returns Legs with simplified ratios
 */
export function simplifyLegRatios(legs: OrderLeg[]): OrderLeg[] {
	if (legs.length === 0) {
		return [];
	}

	const ratios = legs.map((leg) => Math.abs(leg.ratio));
	const legGcd = gcdArray(ratios);

	if (legGcd === 1) {
		return legs;
	}

	return legs.map((leg) => ({
		...leg,
		ratio: leg.ratio / legGcd,
	}));
}

/**
 * Parse an options symbol into components.
 *
 * OCC format: SYMBOL  YYMMDD[C|P]STRIKE
 * Example: AAPL  251219C00200000 -> AAPL, 2025-12-19, Call, $200.00
 *
 * @param optionSymbol - OCC-format option symbol
 * @returns Parsed components or null if invalid
 */
export function parseOptionSymbol(optionSymbol: string): {
	underlying: string;
	expiration: string;
	optionType: "call" | "put";
	strike: number;
} | null {
	// Remove spaces and validate length
	const symbol = optionSymbol.replace(/\s+/g, "");

	if (symbol.length < 15) {
		return null;
	}

	// OCC format: SYMBOL (up to 6 chars) + YYMMDD (6 chars) + C/P (1 char) + STRIKE (8 chars)
	// Find C or P that's followed by 8 digits (the strike price)
	const match = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
	if (!match) {
		return null;
	}

	const underlying = match[1];
	const dateStr = match[2];
	const typeChar = match[3];
	const strikeStr = match[4];

	// Validate all captured groups exist
	if (!underlying || !dateStr || !typeChar || !strikeStr) {
		return null;
	}

	// Validate underlying (1-6 chars)
	if (underlying.length < 1 || underlying.length > 6) {
		return null;
	}

	// Parse date (YYMMDD)
	const year = 2000 + Number.parseInt(dateStr.substring(0, 2), 10);
	const month = dateStr.substring(2, 4);
	const day = dateStr.substring(4, 6);
	const expiration = `${year}-${month}-${day}`;

	// Option type
	const optionType: "call" | "put" = typeChar === "C" ? "call" : "put";

	// Parse strike (8 digits, last 3 are decimals -> divide by 1000)
	const strike = Number.parseInt(strikeStr, 10) / 1000;

	return { underlying, expiration, optionType, strike };
}

/**
 * Build an OCC-format option symbol.
 *
 * @param underlying - Underlying symbol
 * @param expiration - Expiration date (YYYY-MM-DD)
 * @param optionType - Call or put
 * @param strike - Strike price
 * @returns OCC-format option symbol
 */
export function buildOptionSymbol(
	underlying: string,
	expiration: string,
	optionType: "call" | "put",
	strike: number,
): string {
	// Pad underlying to 6 characters
	const paddedUnderlying = underlying.padEnd(6, " ");

	// Format date (YYMMDD)
	const parts = expiration.split("-");
	const year = parts[0] ?? "";
	const month = parts[1] ?? "";
	const day = parts[2] ?? "";
	const dateStr = year.substring(2) + month + day;

	// Format option type
	const typeChar = optionType === "call" ? "C" : "P";

	// Format strike (multiply by 1000, pad to 8 digits)
	const strikeInt = Math.round(strike * 1000);
	const strikeStr = strikeInt.toString().padStart(8, "0");

	return `${paddedUnderlying}${dateStr}${typeChar}${strikeStr}`;
}

/**
 * Validate order quantity.
 *
 * @param qty - Order quantity
 * @param isOption - Whether this is an options order
 * @returns True if quantity is valid
 */
export function validateQuantity(qty: number, isOption = false): boolean {
	if (qty <= 0) {
		return false;
	}
	if (!Number.isInteger(qty)) {
		return false;
	}

	// Options must be in contract units (typically 1 contract = 100 shares)
	// No fractional contracts allowed
	if (isOption && qty < 1) {
		return false;
	}

	return true;
}

/**
 * Check if a symbol is an options symbol (OCC format).
 *
 * @param symbol - Symbol to check
 * @returns True if it's an options symbol
 */
export function isOptionSymbol(symbol: string): boolean {
	return parseOptionSymbol(symbol) !== null;
}
