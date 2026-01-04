/**
 * Color Scales Tests
 *
 * Tests for diverging and sequential color scale utilities.
 *
 * @see docs/plans/ui/26-data-viz.md lines 139-149
 */

import { describe, expect, it, beforeEach } from "bun:test";
import {
  hexToRgb,
  rgbToHex,
  rgbToCss,
  lerpColor,
  createDivergingScale,
  createSequentialScale,
  correlationScale,
  getCorrelationColor,
  clearColorCache,
  isHighCorrelation,
  formatCorrelation,
  CORRELATION_COLORS,
  type RGB,
} from "./color-scales.js";

// ============================================
// Hex/RGB Conversion Tests
// ============================================

describe("hexToRgb", () => {
  it("parses 6-digit hex with hash", () => {
    const rgb = hexToRgb("#FF0000");
    expect(rgb.r).toBe(255);
    expect(rgb.g).toBe(0);
    expect(rgb.b).toBe(0);
  });

  it("parses 6-digit hex without hash", () => {
    const rgb = hexToRgb("00FF00");
    expect(rgb.r).toBe(0);
    expect(rgb.g).toBe(255);
    expect(rgb.b).toBe(0);
  });

  it("handles lowercase hex", () => {
    const rgb = hexToRgb("#aabbcc");
    expect(rgb.r).toBe(170);
    expect(rgb.g).toBe(187);
    expect(rgb.b).toBe(204);
  });

  it("throws on invalid hex", () => {
    expect(() => hexToRgb("invalid")).toThrow();
    expect(() => hexToRgb("#FFF")).toThrow(); // 3-digit not supported
  });
});

describe("rgbToHex", () => {
  it("converts RGB to uppercase hex", () => {
    expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe("#FF0000");
    expect(rgbToHex({ r: 0, g: 255, b: 0 })).toBe("#00FF00");
    expect(rgbToHex({ r: 0, g: 0, b: 255 })).toBe("#0000FF");
  });

  it("pads single-digit values", () => {
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
    expect(rgbToHex({ r: 15, g: 15, b: 15 })).toBe("#0F0F0F");
  });

  it("clamps values to 0-255", () => {
    expect(rgbToHex({ r: -10, g: 300, b: 128 })).toBe("#00FF80");
  });

  it("rounds decimal values", () => {
    expect(rgbToHex({ r: 127.6, g: 127.4, b: 127.5 })).toBe("#807F80");
  });
});

describe("rgbToCss", () => {
  it("converts RGB to rgba string", () => {
    expect(rgbToCss({ r: 255, g: 128, b: 64 })).toBe("rgba(255, 128, 64, 1)");
  });

  it("includes alpha value", () => {
    expect(rgbToCss({ r: 255, g: 0, b: 0 }, 0.5)).toBe("rgba(255, 0, 0, 0.5)");
  });

  it("rounds decimal RGB values", () => {
    expect(rgbToCss({ r: 127.6, g: 127.4, b: 127.5 })).toBe("rgba(128, 127, 128, 1)");
  });
});

// ============================================
// Color Interpolation Tests
// ============================================

describe("lerpColor", () => {
  const black: RGB = { r: 0, g: 0, b: 0 };
  const white: RGB = { r: 255, g: 255, b: 255 };

  it("returns first color at t=0", () => {
    const result = lerpColor(black, white, 0);
    expect(result.r).toBe(0);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
  });

  it("returns second color at t=1", () => {
    const result = lerpColor(black, white, 1);
    expect(result.r).toBe(255);
    expect(result.g).toBe(255);
    expect(result.b).toBe(255);
  });

  it("returns midpoint at t=0.5", () => {
    const result = lerpColor(black, white, 0.5);
    expect(result.r).toBe(127.5);
    expect(result.g).toBe(127.5);
    expect(result.b).toBe(127.5);
  });

  it("clamps t to [0, 1]", () => {
    const belowZero = lerpColor(black, white, -0.5);
    expect(belowZero.r).toBe(0);

    const aboveOne = lerpColor(black, white, 1.5);
    expect(aboveOne.r).toBe(255);
  });
});

// ============================================
// Diverging Scale Tests
// ============================================

describe("createDivergingScale", () => {
  const scale = createDivergingScale("#FF0000", "#FFFFFF", "#00FF00", -1, 1);

  it("returns negative color at min value", () => {
    expect(scale(-1)).toBe("#FF0000");
  });

  it("returns neutral color at midpoint", () => {
    expect(scale(0)).toBe("#FFFFFF");
  });

  it("returns positive color at max value", () => {
    expect(scale(1)).toBe("#00FF00");
  });

  it("interpolates in negative range", () => {
    const color = scale(-0.5);
    const rgb = hexToRgb(color);
    expect(rgb.r).toBe(255);
    // Allow for rounding (127 or 128)
    expect(rgb.g).toBeGreaterThanOrEqual(127);
    expect(rgb.g).toBeLessThanOrEqual(128);
    expect(rgb.b).toBeGreaterThanOrEqual(127);
    expect(rgb.b).toBeLessThanOrEqual(128);
  });

  it("interpolates in positive range", () => {
    const color = scale(0.5);
    const rgb = hexToRgb(color);
    // Allow for rounding (127 or 128)
    expect(rgb.r).toBeGreaterThanOrEqual(127);
    expect(rgb.r).toBeLessThanOrEqual(128);
    expect(rgb.g).toBe(255);
    expect(rgb.b).toBeGreaterThanOrEqual(127);
    expect(rgb.b).toBeLessThanOrEqual(128);
  });

  it("clamps values outside range", () => {
    expect(scale(-2)).toBe("#FF0000");
    expect(scale(2)).toBe("#00FF00");
  });
});

// ============================================
// Correlation Scale Tests
// ============================================

describe("correlationScale", () => {
  it("returns negative color at -1", () => {
    expect(correlationScale(-1)).toBe(CORRELATION_COLORS.negative.toUpperCase());
  });

  it("returns neutral color at 0", () => {
    expect(correlationScale(0)).toBe(CORRELATION_COLORS.neutral.toUpperCase());
  });

  it("returns positive color at +1", () => {
    expect(correlationScale(1)).toBe(CORRELATION_COLORS.positive.toUpperCase());
  });

  it("produces different colors for different values", () => {
    const colors = [-1, -0.5, 0, 0.5, 1].map(correlationScale);
    const unique = new Set(colors);
    expect(unique.size).toBe(5);
  });
});

describe("getCorrelationColor", () => {
  beforeEach(() => {
    clearColorCache();
  });

  it("returns same result as correlationScale", () => {
    expect(getCorrelationColor(0.5)).toBe(correlationScale(0.5));
  });

  it("caches results", () => {
    const first = getCorrelationColor(0.75);
    const second = getCorrelationColor(0.75);
    expect(first).toBe(second);
  });

  it("rounds to 2 decimal places for caching", () => {
    const a = getCorrelationColor(0.751);
    const b = getCorrelationColor(0.749);
    expect(a).toBe(b);
  });
});

describe("clearColorCache", () => {
  it("clears the cache without error", () => {
    getCorrelationColor(0.5);
    expect(() => clearColorCache()).not.toThrow();
  });
});

// ============================================
// Sequential Scale Tests
// ============================================

describe("createSequentialScale", () => {
  const scale = createSequentialScale("#000000", "#FFFFFF", 0, 100);

  it("returns start color at min value", () => {
    expect(scale(0)).toBe("#000000");
  });

  it("returns end color at max value", () => {
    expect(scale(100)).toBe("#FFFFFF");
  });

  it("interpolates linearly", () => {
    const mid = scale(50);
    const rgb = hexToRgb(mid);
    // Allow for rounding (127 or 128)
    expect(rgb.r).toBeGreaterThanOrEqual(127);
    expect(rgb.r).toBeLessThanOrEqual(128);
    expect(rgb.g).toBeGreaterThanOrEqual(127);
    expect(rgb.g).toBeLessThanOrEqual(128);
    expect(rgb.b).toBeGreaterThanOrEqual(127);
    expect(rgb.b).toBeLessThanOrEqual(128);
  });

  it("clamps below min", () => {
    expect(scale(-10)).toBe("#000000");
  });

  it("clamps above max", () => {
    expect(scale(110)).toBe("#FFFFFF");
  });
});

// ============================================
// Utility Function Tests
// ============================================

describe("isHighCorrelation", () => {
  it("returns true for value > threshold", () => {
    expect(isHighCorrelation(0.8, 0.7)).toBe(true);
  });

  it("returns true for value < -threshold", () => {
    expect(isHighCorrelation(-0.8, 0.7)).toBe(true);
  });

  it("returns false for value within threshold", () => {
    expect(isHighCorrelation(0.5, 0.7)).toBe(false);
    expect(isHighCorrelation(-0.5, 0.7)).toBe(false);
  });

  it("returns false for value exactly at threshold", () => {
    expect(isHighCorrelation(0.7, 0.7)).toBe(false);
    expect(isHighCorrelation(-0.7, 0.7)).toBe(false);
  });

  it("uses default threshold of 0.7", () => {
    expect(isHighCorrelation(0.8)).toBe(true);
    expect(isHighCorrelation(0.6)).toBe(false);
  });
});

describe("formatCorrelation", () => {
  it("formats positive values with + sign", () => {
    expect(formatCorrelation(0.75)).toBe("+0.75");
  });

  it("formats negative values with - sign", () => {
    expect(formatCorrelation(-0.25)).toBe("-0.25");
  });

  it("formats zero without sign", () => {
    expect(formatCorrelation(0)).toBe("0.00");
  });

  it("rounds to 2 decimal places", () => {
    expect(formatCorrelation(0.123456)).toBe("+0.12");
    expect(formatCorrelation(-0.999)).toBe("-1.00");
  });
});

// ============================================
// Constants Tests
// ============================================

describe("CORRELATION_COLORS", () => {
  it("has negative color (red)", () => {
    expect(CORRELATION_COLORS.negative).toBe("#EF4444");
  });

  it("has neutral color (cream)", () => {
    expect(CORRELATION_COLORS.neutral).toBe("#FBF8F3");
  });

  it("has positive color (green)", () => {
    expect(CORRELATION_COLORS.positive).toBe("#22C55E");
  });
});
