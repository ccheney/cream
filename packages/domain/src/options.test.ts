/**
 * Tests for Options Symbology Initiative (OSI) Format Utilities
 */

import { describe, expect, test } from "bun:test";
import {
	extractExpiration,
	extractStrike,
	extractSymbol,
	fromOSI,
	isCall,
	isPut,
	isValidOSI,
	normalizeOSI,
	OSI_LENGTH,
	OSIError,
	OSISymbolLenientSchema,
	OSISymbolSchema,
	parseOSI,
	parseOSIOrThrow,
	toOSI,
} from "./options.js";
import type { OptionContract } from "./schemas/decision-plan.js";

// ============================================
// Test Data
// ============================================

const VALID_CONTRACTS: Array<{ osi: string; contract: OptionContract }> = [
	{
		osi: "AAPL  260321C00180000",
		contract: {
			underlyingSymbol: "AAPL",
			expirationDate: "2026-03-21",
			strike: 180,
			right: "CALL",
			multiplier: 100,
		},
	},
	{
		osi: "SPY   260117P00450000",
		contract: {
			underlyingSymbol: "SPY",
			expirationDate: "2026-01-17",
			strike: 450,
			right: "PUT",
			multiplier: 100,
		},
	},
	{
		osi: "GOOGL 260620C02500000",
		contract: {
			underlyingSymbol: "GOOGL",
			expirationDate: "2026-06-20",
			strike: 2500,
			right: "CALL",
			multiplier: 100,
		},
	},
	{
		// Strike with decimals
		osi: "QQQ   260321C00450500",
		contract: {
			underlyingSymbol: "QQQ",
			expirationDate: "2026-03-21",
			strike: 450.5,
			right: "CALL",
			multiplier: 100,
		},
	},
	{
		// Low strike (single digit)
		osi: "SNDL  260117C00001000",
		contract: {
			underlyingSymbol: "SNDL",
			expirationDate: "2026-01-17",
			strike: 1,
			right: "CALL",
			multiplier: 100,
		},
	},
	{
		// Single-letter symbol
		osi: "F     260321P00015000",
		contract: {
			underlyingSymbol: "F",
			expirationDate: "2026-03-21",
			strike: 15,
			right: "PUT",
			multiplier: 100,
		},
	},
];

const INVALID_OSI_SYMBOLS = [
	{ osi: "TOOLONG260321C00180000", error: "INVALID_LENGTH" },
	{ osi: "AAP", error: "INVALID_LENGTH" },
	{ osi: "AAPL  261321C00180000", error: "INVALID_DATE" }, // Invalid month 13
	{ osi: "AAPL  260032C00180000", error: "INVALID_DATE" }, // Invalid day 32
	{ osi: "AAPL  260321X00180000", error: "INVALID_TYPE" }, // Invalid type X
	{ osi: "123456260321C00180000", error: "INVALID_SYMBOL" }, // Numeric symbol
	{ osi: "aapl  260321C00180000", error: "INVALID_SYMBOL" }, // Lowercase
];

// ============================================
// Tests
// ============================================

describe("OSI Format Utilities", () => {
	describe("parseOSI", () => {
		test("parses valid OSI symbols", () => {
			for (const { osi, contract } of VALID_CONTRACTS) {
				const result = parseOSI(osi);
				expect(result.success).toBe(true);
				if (result.success) {
					expect(result.contract.underlyingSymbol).toBe(contract.underlyingSymbol);
					expect(result.contract.expirationDate).toBe(contract.expirationDate);
					expect(result.contract.strike).toBe(contract.strike);
					expect(result.contract.right).toBe(contract.right);
				}
			}
		});

		test("handles unpadded symbols", () => {
			const result = parseOSI("AAPL260321C00180000"); // 18 chars, no padding
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.contract.underlyingSymbol).toBe("AAPL");
			}
		});

		test("rejects invalid symbols", () => {
			for (const { osi, error } of INVALID_OSI_SYMBOLS) {
				const result = parseOSI(osi);
				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error.code).toBe(error);
				}
			}
		});

		test("rejects empty string", () => {
			const result = parseOSI("");
			expect(result.success).toBe(false);
		});
	});

	describe("parseOSIOrThrow", () => {
		test("returns contract for valid OSI", () => {
			const contract = parseOSIOrThrow("AAPL  260321C00180000");
			expect(contract.underlyingSymbol).toBe("AAPL");
		});

		test("throws for invalid OSI", () => {
			expect(() => parseOSIOrThrow("INVALID")).toThrow(OSIError);
		});
	});

	describe("toOSI", () => {
		test("converts contracts to OSI format", () => {
			for (const { osi, contract } of VALID_CONTRACTS) {
				const result = toOSI(contract);
				expect(result).toBe(osi);
				expect(result.length).toBe(OSI_LENGTH);
			}
		});

		test("pads short symbols correctly", () => {
			const osi = toOSI({
				underlyingSymbol: "F",
				expirationDate: "2026-03-21",
				strike: 15,
				right: "PUT",
				multiplier: 100,
			});
			expect(osi).toBe("F     260321P00015000");
			expect(osi.length).toBe(21);
		});

		test("handles decimal strikes", () => {
			const osi = toOSI({
				underlyingSymbol: "SPY",
				expirationDate: "2026-01-17",
				strike: 450.5,
				right: "CALL",
				multiplier: 100,
			});
			expect(osi).toBe("SPY   260117C00450500");
		});

		test("handles three-decimal strikes", () => {
			const osi = toOSI({
				underlyingSymbol: "SPY",
				expirationDate: "2026-01-17",
				strike: 450.125,
				right: "CALL",
				multiplier: 100,
			});
			expect(osi).toBe("SPY   260117C00450125");
		});

		test("throws for symbol too long", () => {
			expect(() =>
				toOSI({
					underlyingSymbol: "VERYLONGSYMBOL",
					expirationDate: "2026-03-21",
					strike: 100,
					right: "CALL",
					multiplier: 100,
				}),
			).toThrow(OSIError);
		});

		test("throws for strike too high", () => {
			expect(() =>
				toOSI({
					underlyingSymbol: "AAPL",
					expirationDate: "2026-03-21",
					strike: 100000, // Exceeds 5-digit max
					right: "CALL",
					multiplier: 100,
				}),
			).toThrow(OSIError);
		});
	});

	describe("roundtrip conversion", () => {
		test("OSI -> Contract -> OSI preserves data", () => {
			for (const { osi } of VALID_CONTRACTS) {
				const contract = parseOSIOrThrow(osi);
				const roundtrip = toOSI(contract);
				expect(roundtrip).toBe(osi);
			}
		});

		test("Contract -> OSI -> Contract preserves data", () => {
			for (const { contract } of VALID_CONTRACTS) {
				const osi = toOSI(contract);
				const roundtrip = parseOSIOrThrow(osi);
				expect(roundtrip.underlyingSymbol).toBe(contract.underlyingSymbol);
				expect(roundtrip.expirationDate).toBe(contract.expirationDate);
				expect(roundtrip.strike).toBe(contract.strike);
				expect(roundtrip.right).toBe(contract.right);
			}
		});
	});

	describe("fromOSI", () => {
		test("returns contract for valid OSI", () => {
			const contract = fromOSI("AAPL  260321C00180000");
			expect(contract).toBeDefined();
			expect(contract?.underlyingSymbol).toBe("AAPL");
		});

		test("returns undefined for invalid OSI", () => {
			const contract = fromOSI("INVALID");
			expect(contract).toBeUndefined();
		});
	});

	describe("isValidOSI", () => {
		test("returns true for valid OSI", () => {
			expect(isValidOSI("AAPL  260321C00180000")).toBe(true);
		});

		test("returns false for invalid OSI", () => {
			expect(isValidOSI("INVALID")).toBe(false);
		});
	});

	describe("normalizeOSI", () => {
		test("pads unpadded symbols", () => {
			const normalized = normalizeOSI("AAPL260321C00180000");
			expect(normalized).toBe("AAPL  260321C00180000");
			expect(normalized.length).toBe(21);
		});

		test("preserves already normalized symbols", () => {
			const normalized = normalizeOSI("AAPL  260321C00180000");
			expect(normalized).toBe("AAPL  260321C00180000");
		});

		test("throws for invalid symbols", () => {
			expect(() => normalizeOSI("INVALID")).toThrow(OSIError);
		});
	});

	describe("utility functions", () => {
		test("extractSymbol extracts underlying", () => {
			expect(extractSymbol("AAPL  260321C00180000")).toBe("AAPL");
			expect(extractSymbol("INVALID")).toBeUndefined();
		});

		test("extractExpiration extracts date", () => {
			expect(extractExpiration("AAPL  260321C00180000")).toBe("2026-03-21");
			expect(extractExpiration("INVALID")).toBeUndefined();
		});

		test("extractStrike extracts price", () => {
			expect(extractStrike("AAPL  260321C00180000")).toBe(180);
			expect(extractStrike("QQQ   260321C00450500")).toBe(450.5);
			expect(extractStrike("INVALID")).toBeUndefined();
		});

		test("isCall identifies calls", () => {
			expect(isCall("AAPL  260321C00180000")).toBe(true);
			expect(isCall("AAPL  260321P00180000")).toBe(false);
		});

		test("isPut identifies puts", () => {
			expect(isPut("AAPL  260321P00180000")).toBe(true);
			expect(isPut("AAPL  260321C00180000")).toBe(false);
		});
	});

	describe("Zod schemas", () => {
		test("OSISymbolSchema validates strict 21-char format", () => {
			const valid = OSISymbolSchema.safeParse("AAPL  260321C00180000");
			expect(valid.success).toBe(true);

			const invalid = OSISymbolSchema.safeParse("AAPL260321C00180000");
			expect(invalid.success).toBe(false);
		});

		test("OSISymbolLenientSchema accepts unpadded", () => {
			const valid = OSISymbolLenientSchema.safeParse("AAPL260321C00180000");
			expect(valid.success).toBe(true);

			const invalid = OSISymbolLenientSchema.safeParse("INVALID");
			expect(invalid.success).toBe(false);
		});
	});

	describe("edge cases", () => {
		test("handles year 2000", () => {
			const contract = parseOSIOrThrow("AAPL  000321C00180000");
			expect(contract.expirationDate).toBe("2000-03-21");
		});

		test("handles year 2099", () => {
			const contract = parseOSIOrThrow("AAPL  990321C00180000");
			expect(contract.expirationDate).toBe("2099-03-21");
		});

		test("handles zero strike", () => {
			const contract = parseOSIOrThrow("AAPL  260321C00000000");
			expect(contract.strike).toBe(0);
		});

		test("handles max strike", () => {
			const osi = toOSI({
				underlyingSymbol: "AAPL",
				expirationDate: "2026-03-21",
				strike: 99999.999,
				right: "CALL",
				multiplier: 100,
			});
			expect(osi).toBe("AAPL  260321C99999999");
		});
	});
});
