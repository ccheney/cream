/**
 * Options Symbology Initiative (OSI) Format Utilities
 *
 * The OSI format is a 21-character standardized representation for option contracts:
 *
 * Format: [Symbol (6)] [Year (2)] [Month (2)] [Day (2)] [C/P (1)] [Strike$$ (5)] [Strike¢¢¢ (3)]
 *
 * Example: "AAPL  260321C00180000" represents:
 *   - Symbol: "AAPL  " (6 chars, right-padded with spaces)
 *   - Year: "26" (2026)
 *   - Month: "03" (March)
 *   - Day: "21"
 *   - Type: "C" (Call)
 *   - Strike: "00180000" = $180.000
 *
 * @see https://www.theocc.com/Clearance-and-Settlement/Clearing/Option-Symbol
 * @see docs/plans/08-options.md
 */

import { z } from "zod";
import { type OptionContract, OptionContractSchema } from "./schemas/decision-plan.js";

// ============================================
// Constants
// ============================================

/** OSI format total length */
export const OSI_LENGTH = 21;

/** OSI format component lengths */
export const OSI_COMPONENTS = {
	SYMBOL: 6,
	YEAR: 2,
	MONTH: 2,
	DAY: 2,
	TYPE: 1,
	STRIKE_DOLLARS: 5,
	STRIKE_CENTS: 3,
} as const;

// ============================================
// Error Types
// ============================================

/** OSI parsing or validation error */
export class OSIError extends Error {
	constructor(
		message: string,
		public readonly code: OSIErrorCode,
		public readonly input?: string
	) {
		super(message);
		this.name = "OSIError";
	}
}

/** OSI error codes */
export type OSIErrorCode =
	| "INVALID_LENGTH"
	| "INVALID_SYMBOL"
	| "INVALID_DATE"
	| "INVALID_TYPE"
	| "INVALID_STRIKE"
	| "INVALID_FORMAT";

// ============================================
// OSI Format Regex
// ============================================

/**
 * OSI format regex pattern
 *
 * Groups:
 * 1. Symbol (1-6 chars, may have trailing spaces)
 * 2. Year (2 digits)
 * 3. Month (2 digits)
 * 4. Day (2 digits)
 * 5. Type (C or P)
 * 6. Strike dollars (5 digits)
 * 7. Strike cents (3 digits)
 */
export const OSI_REGEX = /^([A-Z]{1,6})\s*(\d{2})(\d{2})(\d{2})([CP])(\d{5})(\d{3})$/;

/**
 * Strict OSI format (exactly 21 chars with proper padding)
 */
export const OSI_STRICT_REGEX =
	/^[A-Z]{1,6}\s{0,5}(?<=[A-Z\s]{6})(\d{2})(\d{2})(\d{2})([CP])(\d{5})(\d{3})$/;

// ============================================
// Zod Schema for OSI Format
// ============================================

/**
 * OSI symbol schema with validation
 *
 * Validates a string as a valid 21-character OSI option symbol.
 */
export const OSISymbolSchema = z
	.string()
	.length(OSI_LENGTH, `OSI symbol must be exactly ${OSI_LENGTH} characters`)
	.refine((val) => {
		const result = parseOSI(val);
		return result.success;
	}, "Invalid OSI symbol format");

export type OSISymbol = z.infer<typeof OSISymbolSchema>;

/**
 * Lenient OSI schema (accepts non-padded symbols)
 */
export const OSISymbolLenientSchema = z
	.string()
	.min(15, "OSI symbol must be at least 15 characters")
	.max(OSI_LENGTH, `OSI symbol must be at most ${OSI_LENGTH} characters`)
	.refine((val) => {
		const result = parseOSI(val);
		return result.success;
	}, "Invalid OSI symbol format");

// ============================================
// Parse Result Type
// ============================================

/** Result of parsing an OSI symbol */
export type OSIParseResult =
	| { success: true; contract: OptionContract }
	| { success: false; error: OSIError };

// ============================================
// Conversion Functions
// ============================================

/**
 * Parse an OSI symbol string into an OptionContract.
 *
 * @param osi - The OSI symbol string (15-21 characters)
 * @returns Parse result with contract or error
 *
 * @example
 * ```ts
 * const result = parseOSI("AAPL  260321C00180000");
 * if (result.success) {
 *   console.log(result.contract.underlyingSymbol); // "AAPL"
 *   console.log(result.contract.strike); // 180
 * }
 * ```
 */
export function parseOSI(osi: string): OSIParseResult {
	// Normalize: trim and ensure proper length
	const normalized = osi.trim();

	if (normalized.length < 15 || normalized.length > OSI_LENGTH) {
		return {
			success: false,
			error: new OSIError(
				`OSI symbol must be 15-21 characters, got ${normalized.length}`,
				"INVALID_LENGTH",
				osi
			),
		};
	}

	// Pad to 21 characters if needed (symbol section)
	let padded = normalized;
	if (padded.length < OSI_LENGTH) {
		// Find where the numeric part starts (expiration)
		const match = padded.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
		if (match?.[1]) {
			const symbol = match[1].padEnd(6, " ");
			padded = symbol + padded.slice(match[1].length);
		}
	}

	// Parse components
	const symbolPart = padded.slice(0, 6).trim();
	const yearPart = padded.slice(6, 8);
	const monthPart = padded.slice(8, 10);
	const dayPart = padded.slice(10, 12);
	const typePart = padded.slice(12, 13);
	const strikeDollarsPart = padded.slice(13, 18);
	const strikeCentsPart = padded.slice(18, 21);

	// Validate symbol
	if (!/^[A-Z]{1,6}$/.test(symbolPart)) {
		return {
			success: false,
			error: new OSIError(
				`Invalid symbol "${symbolPart}": must be 1-6 uppercase letters`,
				"INVALID_SYMBOL",
				osi
			),
		};
	}

	// Validate date components
	const year = Number.parseInt(yearPart, 10);
	const month = Number.parseInt(monthPart, 10);
	const day = Number.parseInt(dayPart, 10);

	if (Number.isNaN(year) || year < 0 || year > 99) {
		return {
			success: false,
			error: new OSIError(`Invalid year "${yearPart}"`, "INVALID_DATE", osi),
		};
	}

	if (Number.isNaN(month) || month < 1 || month > 12) {
		return {
			success: false,
			error: new OSIError(`Invalid month "${monthPart}"`, "INVALID_DATE", osi),
		};
	}

	if (Number.isNaN(day) || day < 1 || day > 31) {
		return {
			success: false,
			error: new OSIError(`Invalid day "${dayPart}"`, "INVALID_DATE", osi),
		};
	}

	// Validate type
	if (typePart !== "C" && typePart !== "P") {
		return {
			success: false,
			error: new OSIError(`Invalid option type "${typePart}": must be C or P`, "INVALID_TYPE", osi),
		};
	}

	// Validate and parse strike
	const strikeDollars = Number.parseInt(strikeDollarsPart, 10);
	const strikeCents = Number.parseInt(strikeCentsPart, 10);

	if (Number.isNaN(strikeDollars) || Number.isNaN(strikeCents)) {
		return {
			success: false,
			error: new OSIError(
				`Invalid strike price "${strikeDollarsPart}.${strikeCentsPart}"`,
				"INVALID_STRIKE",
				osi
			),
		};
	}

	const strike = strikeDollars + strikeCents / 1000;

	// Construct expiration date
	// Year is 2-digit, assume 2000s for now (00-99 -> 2000-2099)
	const fullYear = 2000 + year;
	const expirationDate = `${fullYear}-${monthPart}-${dayPart}`;

	// Build contract
	const contract: OptionContract = {
		underlyingSymbol: symbolPart,
		expirationDate,
		strike,
		right: typePart === "C" ? "CALL" : "PUT",
		multiplier: 100,
	};

	return { success: true, contract };
}

/**
 * Parse an OSI symbol string, throwing on error.
 *
 * @param osi - The OSI symbol string
 * @returns Parsed OptionContract
 * @throws {OSIError} If the symbol is invalid
 */
export function parseOSIOrThrow(osi: string): OptionContract {
	const result = parseOSI(osi);
	if (!result.success) {
		throw result.error;
	}
	return result.contract;
}

/**
 * Convert an OptionContract to OSI symbol format.
 *
 * @param contract - The option contract
 * @returns OSI symbol string (21 characters)
 *
 * @example
 * ```ts
 * const osi = toOSI({
 *   underlyingSymbol: "AAPL",
 *   expirationDate: "2026-03-21",
 *   strike: 180,
 *   right: "CALL",
 *   multiplier: 100,
 * });
 * console.log(osi); // "AAPL  260321C00180000"
 * ```
 */
export function toOSI(contract: OptionContract): string {
	// Validate contract
	const validated = OptionContractSchema.parse(contract);

	// Symbol: 6 chars, right-padded
	const symbol = validated.underlyingSymbol.toUpperCase().padEnd(6, " ");
	if (symbol.length > 6) {
		throw new OSIError(
			`Symbol "${validated.underlyingSymbol}" exceeds 6 characters`,
			"INVALID_SYMBOL"
		);
	}

	// Parse date
	const dateParts = validated.expirationDate.split("-");
	if (dateParts.length !== 3) {
		throw new OSIError(
			`Invalid expiration date format "${validated.expirationDate}"`,
			"INVALID_DATE"
		);
	}

	const yearStr = dateParts[0];
	const monthStr = dateParts[1];
	const dayStr = dateParts[2];

	if (!yearStr || !monthStr || !dayStr) {
		throw new OSIError(
			`Invalid expiration date format "${validated.expirationDate}"`,
			"INVALID_DATE"
		);
	}

	const fullYear = Number.parseInt(yearStr, 10);

	// Year: last 2 digits
	const year = (fullYear % 100).toString().padStart(2, "0");
	const month = monthStr.padStart(2, "0");
	const day = dayStr.padStart(2, "0");

	// Type: C or P
	const type = validated.right === "CALL" ? "C" : "P";

	// Strike: split into dollars (5 digits) and millicents (3 digits)
	const strikeDollars = Math.floor(validated.strike);
	const strikeFraction = Math.round((validated.strike - strikeDollars) * 1000);

	const strikeDollarsStr = strikeDollars.toString().padStart(5, "0");
	const strikeFractionStr = strikeFraction.toString().padStart(3, "0");

	if (strikeDollarsStr.length > 5) {
		throw new OSIError(
			`Strike price ${validated.strike} exceeds maximum ($99,999)`,
			"INVALID_STRIKE"
		);
	}

	// Combine all parts
	return `${symbol}${year}${month}${day}${type}${strikeDollarsStr}${strikeFractionStr}`;
}

/**
 * Convert OSI to OptionContract, returning undefined on error.
 */
export function fromOSI(osi: string): OptionContract | undefined {
	const result = parseOSI(osi);
	return result.success ? result.contract : undefined;
}

/**
 * Validate an OSI symbol string.
 *
 * @param osi - The OSI symbol string
 * @returns true if valid, false otherwise
 */
export function isValidOSI(osi: string): boolean {
	return parseOSI(osi).success;
}

/**
 * Normalize an OSI symbol to standard 21-character format.
 *
 * @param osi - The OSI symbol (may be unpadded)
 * @returns Normalized 21-character OSI string
 * @throws {OSIError} If the symbol is invalid
 */
export function normalizeOSI(osi: string): string {
	const result = parseOSI(osi);
	if (!result.success) {
		throw result.error;
	}
	return toOSI(result.contract);
}

// ============================================
// Extended OptionContract Schema with OSI
// ============================================

/**
 * Extended OptionContract schema that includes OSI symbol generation.
 */
export const OptionContractWithOSISchema = OptionContractSchema.transform((contract) => ({
	...contract,
	osiSymbol: toOSI(contract),
}));

export type OptionContractWithOSI = z.infer<typeof OptionContractWithOSISchema>;

// ============================================
// Utilities
// ============================================

/**
 * Extract the underlying symbol from an OSI string.
 */
export function extractSymbol(osi: string): string | undefined {
	const result = parseOSI(osi);
	return result.success ? result.contract.underlyingSymbol : undefined;
}

/**
 * Extract the expiration date from an OSI string.
 */
export function extractExpiration(osi: string): string | undefined {
	const result = parseOSI(osi);
	return result.success ? result.contract.expirationDate : undefined;
}

/**
 * Extract the strike price from an OSI string.
 */
export function extractStrike(osi: string): number | undefined {
	const result = parseOSI(osi);
	return result.success ? result.contract.strike : undefined;
}

/**
 * Check if an OSI symbol represents a call option.
 */
export function isCall(osi: string): boolean {
	return osi.length >= 13 && osi[12] === "C";
}

/**
 * Check if an OSI symbol represents a put option.
 */
export function isPut(osi: string): boolean {
	return osi.length >= 13 && osi[12] === "P";
}
