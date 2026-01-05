/**
 * Broker Utilities Unit Tests
 */

import { describe, expect, it } from "bun:test";
import {
  buildOptionSymbol,
  gcd,
  gcdArray,
  generateOrderId,
  isOptionSymbol,
  parseOptionSymbol,
  simplifyLegRatios,
  validateLegRatios,
  validateQuantity,
} from "../src/utils.js";

describe("generateOrderId", () => {
  it("generates unique IDs", () => {
    const id1 = generateOrderId("paper");
    const id2 = generateOrderId("paper");
    expect(id1).not.toBe(id2);
  });

  it("includes prefix", () => {
    const id = generateOrderId("live");
    expect(id.startsWith("live-")).toBe(true);
  });

  it("includes timestamp", () => {
    const before = Date.now();
    const id = generateOrderId("test");
    const after = Date.now();

    const parts = id.split("-");
    const timestampPart = parts[1];
    expect(timestampPart).toBeDefined();
    const timestamp = parseInt(timestampPart!, 10);

    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });
});

describe("gcd", () => {
  it("calculates GCD of two numbers", () => {
    expect(gcd(12, 8)).toBe(4);
    expect(gcd(8, 12)).toBe(4);
    expect(gcd(7, 5)).toBe(1);
    expect(gcd(100, 25)).toBe(25);
  });

  it("handles negative numbers", () => {
    expect(gcd(-12, 8)).toBe(4);
    expect(gcd(12, -8)).toBe(4);
    expect(gcd(-12, -8)).toBe(4);
  });

  it("handles zero", () => {
    expect(gcd(0, 5)).toBe(5);
    expect(gcd(5, 0)).toBe(5);
  });
});

describe("gcdArray", () => {
  it("calculates GCD of an array", () => {
    expect(gcdArray([12, 8, 4])).toBe(4);
    expect(gcdArray([15, 10, 5])).toBe(5);
    expect(gcdArray([7, 11, 13])).toBe(1);
  });

  it("handles single element", () => {
    expect(gcdArray([7])).toBe(7);
  });

  it("handles empty array", () => {
    expect(gcdArray([])).toBe(1);
  });
});

describe("validateLegRatios", () => {
  it("returns true for simplified ratios", () => {
    expect(
      validateLegRatios([
        { symbol: "A", ratio: 1 },
        { symbol: "B", ratio: -2 },
      ])
    ).toBe(true);
  });

  it("returns true for GCD=1 ratios", () => {
    expect(
      validateLegRatios([
        { symbol: "A", ratio: 1 },
        { symbol: "B", ratio: -1 },
        { symbol: "C", ratio: 1 },
      ])
    ).toBe(true);
  });

  it("returns false for non-simplified ratios", () => {
    expect(
      validateLegRatios([
        { symbol: "A", ratio: 2 },
        { symbol: "B", ratio: -4 },
      ])
    ).toBe(false);
  });

  it("returns true for empty legs", () => {
    expect(validateLegRatios([])).toBe(true);
  });
});

describe("simplifyLegRatios", () => {
  it("simplifies ratios", () => {
    const simplified = simplifyLegRatios([
      { symbol: "A", ratio: 2 },
      { symbol: "B", ratio: -4 },
    ]);

    expect(simplified[0]?.ratio).toBe(1);
    expect(simplified[1]?.ratio).toBe(-2);
  });

  it("preserves already simplified ratios", () => {
    const original = [
      { symbol: "A", ratio: 1 },
      { symbol: "B", ratio: -2 },
    ];
    const simplified = simplifyLegRatios(original);

    expect(simplified[0]?.ratio).toBe(1);
    expect(simplified[1]?.ratio).toBe(-2);
  });

  it("handles empty legs", () => {
    expect(simplifyLegRatios([])).toEqual([]);
  });
});

describe("parseOptionSymbol", () => {
  it("parses a call option symbol", () => {
    const result = parseOptionSymbol("AAPL  251219C00200000");

    expect(result).not.toBeNull();
    expect(result!.underlying).toBe("AAPL");
    expect(result!.expiration).toBe("2025-12-19");
    expect(result!.optionType).toBe("call");
    expect(result!.strike).toBe(200);
  });

  it("parses a put option symbol", () => {
    const result = parseOptionSymbol("SPY   251220P00450000");

    expect(result).not.toBeNull();
    expect(result!.underlying).toBe("SPY");
    expect(result!.expiration).toBe("2025-12-20");
    expect(result!.optionType).toBe("put");
    expect(result!.strike).toBe(450);
  });

  it("returns null for invalid symbols", () => {
    expect(parseOptionSymbol("AAPL")).toBeNull();
    expect(parseOptionSymbol("")).toBeNull();
    expect(parseOptionSymbol("short")).toBeNull();
  });
});

describe("buildOptionSymbol", () => {
  it("builds a call option symbol", () => {
    const symbol = buildOptionSymbol("AAPL", "2025-12-19", "call", 200);
    expect(symbol).toBe("AAPL  251219C00200000");
  });

  it("builds a put option symbol", () => {
    const symbol = buildOptionSymbol("SPY", "2025-12-20", "put", 450);
    expect(symbol).toBe("SPY   251220P00450000");
  });

  it("handles fractional strikes", () => {
    const symbol = buildOptionSymbol("TSLA", "2025-06-15", "call", 250.5);
    expect(symbol).toBe("TSLA  250615C00250500");
  });
});

describe("validateQuantity", () => {
  it("accepts positive integers", () => {
    expect(validateQuantity(1)).toBe(true);
    expect(validateQuantity(100)).toBe(true);
  });

  it("rejects zero", () => {
    expect(validateQuantity(0)).toBe(false);
  });

  it("rejects negative numbers", () => {
    expect(validateQuantity(-1)).toBe(false);
  });

  it("rejects fractional quantities", () => {
    expect(validateQuantity(1.5)).toBe(false);
  });

  it("validates options quantities", () => {
    expect(validateQuantity(1, true)).toBe(true);
    expect(validateQuantity(10, true)).toBe(true);
  });
});

describe("isOptionSymbol", () => {
  it("identifies option symbols", () => {
    expect(isOptionSymbol("AAPL  251219C00200000")).toBe(true);
    expect(isOptionSymbol("SPY   251220P00450000")).toBe(true);
  });

  it("rejects stock symbols", () => {
    expect(isOptionSymbol("AAPL")).toBe(false);
    expect(isOptionSymbol("SPY")).toBe(false);
    expect(isOptionSymbol("TSLA")).toBe(false);
  });
});
