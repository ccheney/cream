/**
 * Number Precision Safety Utilities Tests
 */

import { describe, expect, test } from "bun:test";
import {
  BASIS_POINTS_PER_PERCENT,
  BasisPointsSchema,
  // Position
  calculateQtyChange,
  // Clamping
  clampToSint32,
  clampToUint32,
  // Money
  formatMoney,
  formatPrice,
  fromBasisPoints,
  getPositionDirection,
  isInSint32Range,
  isInUint32Range,
  isSafeInteger,
  NonNegativePriceSchema,
  PositivePriceSchema,
  parseMoney,
  SINT32_MAX,
  // Constants
  SINT32_MIN,
  // Schemas
  Sint32Schema,
  // Basis points
  toBasisPoints,
  UINT32_MAX,
  Uint32Schema,
  // Validation
  validateSint32,
  validateUint32,
} from "./numbers";

// ============================================
// Constants Tests
// ============================================

describe("Constants", () => {
  test("SINT32 range is correct", () => {
    expect(SINT32_MIN).toBe(-2_147_483_648);
    expect(SINT32_MAX).toBe(2_147_483_647);
  });

  test("UINT32 max is correct", () => {
    expect(UINT32_MAX).toBe(4_294_967_295);
  });

  test("BASIS_POINTS_PER_PERCENT is 100", () => {
    expect(BASIS_POINTS_PER_PERCENT).toBe(100);
  });
});

// ============================================
// Zod Schema Tests
// ============================================

describe("Sint32Schema", () => {
  test("accepts values within range", () => {
    expect(Sint32Schema.safeParse(0).success).toBe(true);
    expect(Sint32Schema.safeParse(1000).success).toBe(true);
    expect(Sint32Schema.safeParse(-1000).success).toBe(true);
    expect(Sint32Schema.safeParse(SINT32_MIN).success).toBe(true);
    expect(Sint32Schema.safeParse(SINT32_MAX).success).toBe(true);
  });

  test("rejects values outside range", () => {
    expect(Sint32Schema.safeParse(SINT32_MAX + 1).success).toBe(false);
    expect(Sint32Schema.safeParse(SINT32_MIN - 1).success).toBe(false);
    expect(Sint32Schema.safeParse(3_000_000_000).success).toBe(false);
  });

  test("rejects non-integers", () => {
    expect(Sint32Schema.safeParse(1.5).success).toBe(false);
    expect(Sint32Schema.safeParse(0.1).success).toBe(false);
  });
});

describe("Uint32Schema", () => {
  test("accepts values within range", () => {
    expect(Uint32Schema.safeParse(0).success).toBe(true);
    expect(Uint32Schema.safeParse(1000).success).toBe(true);
    expect(Uint32Schema.safeParse(UINT32_MAX).success).toBe(true);
  });

  test("rejects negative values", () => {
    expect(Uint32Schema.safeParse(-1).success).toBe(false);
    expect(Uint32Schema.safeParse(-1000).success).toBe(false);
  });

  test("rejects values above max", () => {
    expect(Uint32Schema.safeParse(UINT32_MAX + 1).success).toBe(false);
  });
});

describe("PositivePriceSchema", () => {
  test("accepts positive prices", () => {
    expect(PositivePriceSchema.safeParse(0.01).success).toBe(true);
    expect(PositivePriceSchema.safeParse(100.5).success).toBe(true);
  });

  test("rejects zero and negative", () => {
    expect(PositivePriceSchema.safeParse(0).success).toBe(false);
    expect(PositivePriceSchema.safeParse(-1).success).toBe(false);
  });
});

describe("NonNegativePriceSchema", () => {
  test("accepts zero and positive", () => {
    expect(NonNegativePriceSchema.safeParse(0).success).toBe(true);
    expect(NonNegativePriceSchema.safeParse(100.5).success).toBe(true);
  });

  test("rejects negative", () => {
    expect(NonNegativePriceSchema.safeParse(-1).success).toBe(false);
  });
});

describe("BasisPointsSchema", () => {
  test("accepts valid basis points", () => {
    expect(BasisPointsSchema.safeParse(0).success).toBe(true);
    expect(BasisPointsSchema.safeParse(2550).success).toBe(true);
    expect(BasisPointsSchema.safeParse(-1000).success).toBe(true);
    expect(BasisPointsSchema.safeParse(1_000_000).success).toBe(true);
    expect(BasisPointsSchema.safeParse(-1_000_000).success).toBe(true);
  });

  test("rejects values outside range", () => {
    expect(BasisPointsSchema.safeParse(1_000_001).success).toBe(false);
    expect(BasisPointsSchema.safeParse(-1_000_001).success).toBe(false);
  });

  test("rejects non-integers", () => {
    expect(BasisPointsSchema.safeParse(25.5).success).toBe(false);
  });
});

// ============================================
// Validation Function Tests
// ============================================

describe("validateSint32", () => {
  test("accepts valid values", () => {
    expect(() => validateSint32(0)).not.toThrow();
    expect(() => validateSint32(SINT32_MIN)).not.toThrow();
    expect(() => validateSint32(SINT32_MAX)).not.toThrow();
  });

  test("throws for non-integer", () => {
    expect(() => validateSint32(1.5)).toThrow("not an integer");
  });

  test("throws for out of range", () => {
    expect(() => validateSint32(SINT32_MAX + 1)).toThrow("outside sint32 range");
    expect(() => validateSint32(SINT32_MIN - 1)).toThrow("outside sint32 range");
  });
});

describe("validateUint32", () => {
  test("accepts valid values", () => {
    expect(() => validateUint32(0)).not.toThrow();
    expect(() => validateUint32(UINT32_MAX)).not.toThrow();
  });

  test("throws for negative", () => {
    expect(() => validateUint32(-1)).toThrow("outside uint32 range");
  });

  test("throws for out of range", () => {
    expect(() => validateUint32(UINT32_MAX + 1)).toThrow("outside uint32 range");
  });
});

describe("isSafeInteger", () => {
  test("returns true for safe integers", () => {
    expect(isSafeInteger(0)).toBe(true);
    expect(isSafeInteger(1000)).toBe(true);
    expect(isSafeInteger(-1000)).toBe(true);
    expect(isSafeInteger(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(isSafeInteger(Number.MIN_SAFE_INTEGER)).toBe(true);
  });

  test("returns false for unsafe values", () => {
    expect(isSafeInteger(1.5)).toBe(false);
    expect(isSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(isSafeInteger(Infinity)).toBe(false);
    expect(isSafeInteger(NaN)).toBe(false);
  });
});

describe("isInSint32Range / isInUint32Range", () => {
  test("sint32 range checks work", () => {
    expect(isInSint32Range(0)).toBe(true);
    expect(isInSint32Range(SINT32_MAX)).toBe(true);
    expect(isInSint32Range(SINT32_MIN)).toBe(true);
    expect(isInSint32Range(SINT32_MAX + 1)).toBe(false);
    expect(isInSint32Range(1.5)).toBe(false);
  });

  test("uint32 range checks work", () => {
    expect(isInUint32Range(0)).toBe(true);
    expect(isInUint32Range(UINT32_MAX)).toBe(true);
    expect(isInUint32Range(-1)).toBe(false);
    expect(isInUint32Range(UINT32_MAX + 1)).toBe(false);
  });
});

// ============================================
// Basis Points Tests
// ============================================

describe("toBasisPoints", () => {
  test("converts percentages correctly", () => {
    expect(toBasisPoints(25.5)).toBe(2550);
    expect(toBasisPoints(100)).toBe(10000);
    expect(toBasisPoints(0)).toBe(0);
    expect(toBasisPoints(-5.25)).toBe(-525);
  });

  test("rounds to nearest integer", () => {
    expect(toBasisPoints(25.555)).toBe(2556);
    expect(toBasisPoints(25.554)).toBe(2555);
  });

  test("throws for out of range", () => {
    expect(() => toBasisPoints(20000)).toThrow("exceeds basis points range");
  });
});

describe("fromBasisPoints", () => {
  test("converts basis points correctly", () => {
    expect(fromBasisPoints(2550)).toBe(25.5);
    expect(fromBasisPoints(10000)).toBe(100);
    expect(fromBasisPoints(0)).toBe(0);
    expect(fromBasisPoints(-525)).toBe(-5.25);
  });

  test("throws for invalid input", () => {
    expect(() => fromBasisPoints(2_000_000)).toThrow("Invalid basis points");
  });
});

// ============================================
// Money Formatting Tests
// ============================================

describe("formatMoney", () => {
  test("formats cents correctly", () => {
    expect(formatMoney(12345)).toBe("$123.45");
    expect(formatMoney(100)).toBe("$1.00");
    expect(formatMoney(1)).toBe("$0.01");
    expect(formatMoney(0)).toBe("$0.00");
  });

  test("formats large amounts with commas", () => {
    expect(formatMoney(1000000)).toBe("$10,000.00");
    expect(formatMoney(123456789)).toBe("$1,234,567.89");
  });

  test("formats negative amounts", () => {
    expect(formatMoney(-500)).toBe("-$5.00");
    expect(formatMoney(-123456)).toBe("-$1,234.56");
  });

  test("throws for non-integer", () => {
    expect(() => formatMoney(123.45)).toThrow("must be an integer");
  });
});

describe("parseMoney", () => {
  test("parses money strings", () => {
    expect(parseMoney("$123.45")).toBe(12345);
    expect(parseMoney("1,234.56")).toBe(123456);
    expect(parseMoney("5.00")).toBe(500);
  });

  test("parses negative amounts", () => {
    expect(parseMoney("-$5.00")).toBe(-500);
    expect(parseMoney("-123.45")).toBe(-12345);
  });

  test("throws for invalid input", () => {
    expect(() => parseMoney("invalid")).toThrow("Invalid money string");
  });
});

describe("formatPrice", () => {
  test("formats prices with 2 decimals by default", () => {
    expect(formatPrice(123.456)).toBe("123.46");
    expect(formatPrice(100)).toBe("100.00");
  });

  test("respects decimal places parameter", () => {
    expect(formatPrice(123.4567, 4)).toBe("123.4567");
    expect(formatPrice(100, 0)).toBe("100");
  });

  test("throws for negative prices", () => {
    expect(() => formatPrice(-1)).toThrow("cannot be negative");
  });
});

// ============================================
// Clamping Tests
// ============================================

describe("clampToSint32", () => {
  test("clamps values to sint32 range", () => {
    expect(clampToSint32(3_000_000_000)).toBe(SINT32_MAX);
    expect(clampToSint32(-3_000_000_000)).toBe(SINT32_MIN);
    expect(clampToSint32(1000)).toBe(1000);
  });

  test("rounds floats", () => {
    expect(clampToSint32(1.6)).toBe(2);
    expect(clampToSint32(1.4)).toBe(1);
  });
});

describe("clampToUint32", () => {
  test("clamps values to uint32 range", () => {
    expect(clampToUint32(5_000_000_000)).toBe(UINT32_MAX);
    expect(clampToUint32(-100)).toBe(0);
    expect(clampToUint32(1000)).toBe(1000);
  });
});

// ============================================
// Position Tests
// ============================================

describe("calculateQtyChange", () => {
  test("calculates buy quantity", () => {
    expect(calculateQtyChange(100, 150)).toBe(50);
    expect(calculateQtyChange(0, 100)).toBe(100);
  });

  test("calculates sell quantity", () => {
    expect(calculateQtyChange(100, 50)).toBe(-50);
    expect(calculateQtyChange(100, 0)).toBe(-100);
  });

  test("calculates short cover and go long", () => {
    expect(calculateQtyChange(-100, 100)).toBe(200);
  });

  test("throws for invalid inputs", () => {
    expect(() => calculateQtyChange(1.5, 100)).toThrow("not an integer");
  });
});

describe("getPositionDirection", () => {
  test("returns LONG for positive", () => {
    expect(getPositionDirection(100)).toBe("LONG");
  });

  test("returns SHORT for negative", () => {
    expect(getPositionDirection(-100)).toBe("SHORT");
  });

  test("returns FLAT for zero", () => {
    expect(getPositionDirection(0)).toBe("FLAT");
  });
});
