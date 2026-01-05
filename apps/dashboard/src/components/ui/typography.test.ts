/**
 * Typography Components Tests
 *
 * Tests for typography component types and formatting utilities.
 */

import { describe, it, expect } from "bun:test";
import type {
  TextSize,
  TextWeight,
  TextColor,
  HeadingLevel,
  DataFormat,
} from "./typography";

// ============================================
// Type Tests
// ============================================

describe("TextSize type", () => {
  it("has all expected sizes", () => {
    const sizes: TextSize[] = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"];
    expect(sizes).toHaveLength(8);
  });
});

describe("TextWeight type", () => {
  it("has all expected weights", () => {
    const weights: TextWeight[] = ["normal", "medium", "semibold", "bold"];
    expect(weights).toHaveLength(4);
  });
});

describe("TextColor type", () => {
  it("has all expected colors", () => {
    const colors: TextColor[] = [
      "heading",
      "primary",
      "secondary",
      "muted",
      "profit",
      "loss",
      "neutral",
      "inherit",
    ];
    expect(colors).toHaveLength(8);
  });
});

describe("HeadingLevel type", () => {
  it("supports levels 1-6", () => {
    const levels: HeadingLevel[] = [1, 2, 3, 4, 5, 6];
    expect(levels).toHaveLength(6);
  });
});

describe("DataFormat type", () => {
  it("has all expected formats", () => {
    const formats: DataFormat[] = [
      "price",
      "percentage",
      "number",
      "currency",
      "shares",
    ];
    expect(formats).toHaveLength(5);
  });
});

// ============================================
// Format Data Value Tests
// ============================================

describe("price formatting", () => {
  it("formats price with 2 decimals", () => {
    const formatted = formatValue(187.5, "price", 2, false);
    expect(formatted).toBe("187.50");
  });

  it("formats price with thousands separator", () => {
    const formatted = formatValue(1234567.89, "price", 2, false);
    expect(formatted).toBe("1,234,567.89");
  });

  it("formats price with sign when positive", () => {
    const formatted = formatValue(10.5, "price", 2, true);
    expect(formatted).toBe("+10.50");
  });

  it("formats price without sign when negative", () => {
    const formatted = formatValue(-10.5, "price", 2, true);
    expect(formatted).toBe("-10.50");
  });
});

describe("percentage formatting", () => {
  it("formats percentage with sign", () => {
    const formatted = formatValue(3.45, "percentage", 2, true);
    expect(formatted).toBe("+3.45%");
  });

  it("formats negative percentage", () => {
    const formatted = formatValue(-2.1, "percentage", 1, false);
    expect(formatted).toBe("-2.1%");
  });

  it("formats zero percentage", () => {
    const formatted = formatValue(0, "percentage", 2, false);
    expect(formatted).toBe("0.00%");
  });
});

describe("currency formatting", () => {
  it("formats currency with USD symbol", () => {
    const formatted = formatValue(1234.56, "currency", 2, false);
    expect(formatted).toBe("$1,234.56");
  });

  it("formats currency with sign", () => {
    const formatted = formatValue(100, "currency", 2, true);
    expect(formatted).toBe("+$100.00");
  });
});

describe("shares formatting", () => {
  it("formats shares without decimals", () => {
    const formatted = formatValue(1000, "shares", 0, false);
    expect(formatted).toBe("1,000");
  });

  it("rounds shares to whole numbers", () => {
    const formatted = formatValue(1234.5678, "shares", 0, false);
    expect(formatted).toBe("1,235");
  });
});

describe("number formatting", () => {
  it("formats number with specified decimals", () => {
    const formatted = formatValue(123.456, "number", 1, false);
    expect(formatted).toBe("123.5");
  });

  it("formats number with thousands separator", () => {
    const formatted = formatValue(1000000, "number", 0, false);
    expect(formatted).toBe("1,000,000");
  });
});

describe("edge cases", () => {
  it("handles string input", () => {
    const formatted = formatValue("123.45", "price", 2, false);
    expect(formatted).toBe("123.45");
  });

  it("handles NaN", () => {
    const formatted = formatValue(NaN, "price", 2, false);
    expect(formatted).toBe("NaN");
  });

  it("handles invalid string", () => {
    const formatted = formatValue("not a number", "price", 2, false);
    expect(formatted).toBe("not a number");
  });

  it("handles zero with sign", () => {
    const formatted = formatValue(0, "price", 2, true);
    // Zero is not positive, so no sign
    expect(formatted).toBe("0.00");
  });

  it("handles very small numbers", () => {
    const formatted = formatValue(0.0001, "number", 4, false);
    expect(formatted).toBe("0.0001");
  });

  it("handles very large numbers", () => {
    const formatted = formatValue(1e9, "number", 0, false);
    expect(formatted).toBe("1,000,000,000");
  });
});

// ============================================
// Color By Sign Tests
// ============================================

describe("colorBySign logic", () => {
  it("returns profit for positive values", () => {
    expect(getColorBySign(10)).toBe("profit");
  });

  it("returns loss for negative values", () => {
    expect(getColorBySign(-5)).toBe("loss");
  });

  it("returns muted for zero", () => {
    expect(getColorBySign(0)).toBe("muted");
  });

  it("returns muted for NaN", () => {
    expect(getColorBySign(NaN)).toBe("muted");
  });
});

// ============================================
// Heading Size Defaults Tests
// ============================================

describe("heading size defaults", () => {
  it("h1 defaults to 4xl", () => {
    expect(getHeadingSizeDefault(1)).toBe("4xl");
  });

  it("h2 defaults to 3xl", () => {
    expect(getHeadingSizeDefault(2)).toBe("3xl");
  });

  it("h3 defaults to 2xl", () => {
    expect(getHeadingSizeDefault(3)).toBe("2xl");
  });

  it("h4 defaults to xl", () => {
    expect(getHeadingSizeDefault(4)).toBe("xl");
  });

  it("h5 defaults to lg", () => {
    expect(getHeadingSizeDefault(5)).toBe("lg");
  });

  it("h6 defaults to base", () => {
    expect(getHeadingSizeDefault(6)).toBe("base");
  });
});

// ============================================
// Module Export Tests
// ============================================

describe("module exports", () => {
  it("exports Text component", async () => {
    const module = await import("./typography");
    expect(typeof module.Text).toBe("function");
  });

  it("exports Heading component", async () => {
    const module = await import("./typography");
    expect(typeof module.Heading).toBe("function");
  });

  it("exports DataValue component", async () => {
    const module = await import("./typography");
    expect(typeof module.DataValue).toBe("function");
  });

  it("exports Code component", async () => {
    const module = await import("./typography");
    expect(typeof module.Code).toBe("function");
  });

  it("exports Label component", async () => {
    const module = await import("./typography");
    expect(typeof module.Label).toBe("function");
  });

  it("exports Prose component", async () => {
    const module = await import("./typography");
    expect(typeof module.Prose).toBe("function");
  });

  it("exports PriceChange component", async () => {
    const module = await import("./typography");
    expect(typeof module.PriceChange).toBe("function");
  });
});

// ============================================
// Helper Functions (mirror implementation)
// ============================================

function formatValue(
  value: number | string,
  format: DataFormat,
  decimals: number,
  showSign: boolean
): string {
  const num = typeof value === "string" ? parseFloat(value) : value;

  if (isNaN(num)) return String(value);

  const sign = showSign && num > 0 ? "+" : "";

  switch (format) {
    case "price":
      return sign + num.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

    case "currency":
      return sign + num.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

    case "percentage":
      return sign + num.toFixed(decimals) + "%";

    case "shares":
      return num.toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });

    case "number":
    default:
      return sign + num.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
  }
}

function getColorBySign(num: number): TextColor {
  if (isNaN(num)) return "muted";
  if (num > 0) return "profit";
  if (num < 0) return "loss";
  return "muted";
}

function getHeadingSizeDefault(level: HeadingLevel): TextSize {
  const defaults: Record<HeadingLevel, TextSize> = {
    1: "4xl",
    2: "3xl",
    3: "2xl",
    4: "xl",
    5: "lg",
    6: "base",
  };
  return defaults[level];
}
