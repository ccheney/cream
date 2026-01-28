/**
 * Number Precision Safety Utilities
 *
 * Safe number handling in TypeScript, avoiding int64/BigInt friction
 * while preventing precision loss.
 *
 * ## Design Principles
 *
 * 1. **Avoid int64/BigInt**: int64 serializes as string in JSON, causing friction
 * 2. **Use sint32 for quantities**: ±2.1 billion range, safe in JS Number
 * 3. **Use Rust for money math**: JavaScript floating point is imprecise
 * 4. **Use basis points for percentages**: Avoids floating point issues
 *
 * ## Number Ranges
 *
 * - `sint32`: -2,147,483,648 to 2,147,483,647 (±2.1B)
 * - `uint32`: 0 to 4,294,967,295 (~4.3B)
 * - `Number.MAX_SAFE_INTEGER`: 9,007,199,254,740,991 (~9 quadrillion)
 *
 * @see docs/plans/00-overview.md (Schema Design Goals)
 */

import { z } from "zod";

// ============================================
// Constants
// ============================================

/**
 * sint32 range (32-bit signed integer)
 * Used for quantities in Protobuf
 */
export const SINT32_MIN = -2_147_483_648;
export const SINT32_MAX = 2_147_483_647;

/**
 * uint32 range (32-bit unsigned integer)
 * Used for counts in Protobuf
 */
export const UINT32_MAX = 4_294_967_295;

/**
 * Basis point multiplier (1 bp = 0.01%)
 */
export const BASIS_POINTS_PER_PERCENT = 100;

// ============================================
// Zod Schemas
// ============================================

/**
 * Zod schema for sint32 values (±2.1B range)
 * Use this for position quantities and signed counts
 */
export const Sint32Schema = z
	.number()
	.int()
	.min(SINT32_MIN, `Value must be >= ${SINT32_MIN} (sint32 min)`)
	.max(SINT32_MAX, `Value must be <= ${SINT32_MAX} (sint32 max)`);
export type Sint32 = z.infer<typeof Sint32Schema>;

/**
 * Zod schema for uint32 values (0 to 4.3B)
 * Use this for unsigned counts
 */
export const Uint32Schema = z
	.number()
	.int()
	.nonnegative()
	.max(UINT32_MAX, `Value must be <= ${UINT32_MAX} (uint32 max)`);
export type Uint32 = z.infer<typeof Uint32Schema>;

/**
 * Zod schema for positive prices
 * Note: Money calculations should be done in Rust with rust_decimal
 */
export const PositivePriceSchema = z.number().positive("Price must be positive");
export type PositivePrice = z.infer<typeof PositivePriceSchema>;

/**
 * Zod schema for non-negative prices (allows zero)
 */
export const NonNegativePriceSchema = z.number().nonnegative("Price must be non-negative");
export type NonNegativePrice = z.infer<typeof NonNegativePriceSchema>;

/**
 * Zod schema for basis points (integer, used for percentages)
 * Stored as sint32 to allow negative percentages
 *
 * Examples:
 * - 25.5% = 2550 bp
 * - -10% = -1000 bp
 * - 100% = 10000 bp
 */
export const BasisPointsSchema = z
	.number()
	.int()
	.min(-1_000_000, "Basis points must be >= -1,000,000 (-10000%)")
	.max(1_000_000, "Basis points must be <= 1,000,000 (10000%)");
export type BasisPoints = z.infer<typeof BasisPointsSchema>;

/**
 * Zod schema for quantity (position size)
 * Signed integer within sint32 range
 */
export const QuantitySchema = z.number().int().min(SINT32_MIN).max(SINT32_MAX);
export type Quantity = z.infer<typeof QuantitySchema>;

// ============================================
// Validation Functions
// ============================================

/**
 * Validate that a number is within sint32 range
 *
 * @param n - Number to validate
 * @throws Error if outside sint32 range
 *
 * @example
 * ```ts
 * validateSint32(100);       // OK
 * validateSint32(3_000_000_000); // throws
 * ```
 */
export function validateSint32(n: number): void {
	if (!Number.isInteger(n)) {
		throw new Error(`Value ${n} is not an integer`);
	}
	if (n < SINT32_MIN || n > SINT32_MAX) {
		throw new Error(`Value ${n} is outside sint32 range [${SINT32_MIN}, ${SINT32_MAX}]`);
	}
}

/**
 * Validate that a number is within uint32 range
 *
 * @param n - Number to validate
 * @throws Error if outside uint32 range
 */
export function validateUint32(n: number): void {
	if (!Number.isInteger(n)) {
		throw new Error(`Value ${n} is not an integer`);
	}
	if (n < 0 || n > UINT32_MAX) {
		throw new Error(`Value ${n} is outside uint32 range [0, ${UINT32_MAX}]`);
	}
}

/**
 * Check if a number is a safe integer
 * Safe integers are those that can be exactly represented in IEEE-754
 *
 * @param n - Number to check
 * @returns true if safe integer
 */
export function isSafeInteger(n: number): boolean {
	return Number.isSafeInteger(n);
}

/**
 * Check if a number is within sint32 range
 */
export function isInSint32Range(n: number): boolean {
	return Number.isInteger(n) && n >= SINT32_MIN && n <= SINT32_MAX;
}

/**
 * Check if a number is within uint32 range
 */
export function isInUint32Range(n: number): boolean {
	return Number.isInteger(n) && n >= 0 && n <= UINT32_MAX;
}

// ============================================
// Basis Points Conversion
// ============================================

/**
 * Convert percentage to basis points
 *
 * @param percent - Percentage value (e.g., 25.5 for 25.5%)
 * @returns Basis points as integer
 *
 * @example
 * ```ts
 * toBasisPoints(25.5)  // 2550
 * toBasisPoints(100)   // 10000
 * toBasisPoints(-5.25) // -525
 * ```
 */
export function toBasisPoints(percent: number): BasisPoints {
	const bp = Math.round(percent * BASIS_POINTS_PER_PERCENT);

	// Validate result is within range
	const result = BasisPointsSchema.safeParse(bp);
	if (!result.success) {
		throw new Error(`Percentage ${percent}% exceeds basis points range`);
	}

	return bp as BasisPoints;
}

/**
 * Convert basis points to percentage
 *
 * @param bp - Basis points (e.g., 2550 for 25.5%)
 * @returns Percentage value
 *
 * @example
 * ```ts
 * fromBasisPoints(2550)  // 25.5
 * fromBasisPoints(10000) // 100
 * fromBasisPoints(-525)  // -5.25
 * ```
 */
export function fromBasisPoints(bp: number): number {
	// Validate input
	const result = BasisPointsSchema.safeParse(bp);
	if (!result.success) {
		throw new Error(`Invalid basis points value: ${bp}`);
	}

	return bp / BASIS_POINTS_PER_PERCENT;
}

// ============================================
// Money Formatting
// ============================================

/**
 * Format cents to a money string
 *
 * Note: This is for display only. All money calculations
 * should be done in Rust with rust_decimal.
 *
 * @param cents - Amount in cents (integer)
 * @returns Formatted string with $ prefix
 *
 * @example
 * ```ts
 * formatMoney(12345)    // "$123.45"
 * formatMoney(1000000)  // "$10,000.00"
 * formatMoney(-500)     // "-$5.00"
 * ```
 */
export function formatMoney(cents: number): string {
	if (!Number.isInteger(cents)) {
		throw new Error("Cents must be an integer");
	}

	const isNegative = cents < 0;
	const absCents = Math.abs(cents);
	const dollars = Math.floor(absCents / 100);
	const remainingCents = absCents % 100;

	// Format with thousands separators
	const formattedDollars = dollars.toLocaleString("en-US");
	const formattedCents = remainingCents.toString().padStart(2, "0");

	const sign = isNegative ? "-" : "";
	return `${sign}$${formattedDollars}.${formattedCents}`;
}

/**
 * Parse a money string to cents
 *
 * @param str - Money string (e.g., "$123.45", "1,234.56")
 * @returns Amount in cents
 *
 * @example
 * ```ts
 * parseMoney("$123.45")   // 12345
 * parseMoney("1,234.56")  // 123456
 * parseMoney("-$5.00")    // -500
 * ```
 */
export function parseMoney(str: string): number {
	// Remove currency symbol and thousands separators
	const cleaned = str.replace(/[$,]/g, "").trim();

	// Parse as float then convert to cents
	const amount = Number.parseFloat(cleaned);
	if (Number.isNaN(amount)) {
		throw new Error(`Invalid money string: ${str}`);
	}

	// Round to avoid floating point issues
	return Math.round(amount * 100);
}

// ============================================
// Price Utilities
// ============================================

/**
 * Format price for display
 *
 * @param price - Price value
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted price string
 */
export function formatPrice(price: number, decimals = 2): string {
	if (price < 0) {
		throw new Error("Price cannot be negative");
	}
	return price.toFixed(decimals);
}

/**
 * Clamp a number to sint32 range
 *
 * @param n - Number to clamp
 * @returns Clamped value within sint32 range
 */
export function clampToSint32(n: number): number {
	const value = Number.isInteger(n) ? n : Math.round(n);
	return Math.max(SINT32_MIN, Math.min(SINT32_MAX, value));
}

/**
 * Clamp a number to uint32 range
 */
export function clampToUint32(n: number): number {
	const value = Number.isInteger(n) ? n : Math.round(n);
	return Math.max(0, Math.min(UINT32_MAX, value));
}

// ============================================
// Position Quantity Utilities
// ============================================

/**
 * Calculate the quantity change needed to reach a target position
 *
 * @param currentQty - Current position quantity (signed)
 * @param targetQty - Target position quantity (signed)
 * @returns Quantity to add (positive) or remove (negative)
 *
 * @example
 * ```ts
 * calculateQtyChange(100, 150)   // 50 (need to buy 50 more)
 * calculateQtyChange(100, 50)    // -50 (need to sell 50)
 * calculateQtyChange(-100, 100)  // 200 (cover short and go long)
 * ```
 */
export function calculateQtyChange(currentQty: number, targetQty: number): number {
	validateSint32(currentQty);
	validateSint32(targetQty);

	const change = targetQty - currentQty;

	// Validate result is within range
	if (!isInSint32Range(change)) {
		throw new Error("Quantity change would overflow sint32 range");
	}

	return change;
}

/**
 * Determine the direction of a position
 *
 * @param qty - Position quantity (signed)
 * @returns "LONG", "SHORT", or "FLAT"
 */
export function getPositionDirection(qty: number): "LONG" | "SHORT" | "FLAT" {
	if (qty > 0) {
		return "LONG";
	}
	if (qty < 0) {
		return "SHORT";
	}
	return "FLAT";
}
