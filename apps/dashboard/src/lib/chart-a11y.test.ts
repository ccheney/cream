/**
 * Chart Accessibility Tests
 *
 * Tests for ARIA labels, keyboard navigation, and screen reader support.
 *
 * @see docs/plans/ui/29-accessibility.md
 */

import { describe, expect, it } from "bun:test";
import {
  generateChartAriaLabel,
  generateChartDescription,
  generateUpdateAnnouncement,
  calculateStats,
  calculateOHLCStats,
  calculateEquityStats,
  handleDataPointNavigation,
  handleZoomNavigation,
  KEYBOARD_KEYS,
  FOCUS_STYLES,
  getFocusStyleString,
  toAccessibleTableData,
  toCSV,
  checkContrastRatio,
  checkGraphicsContrast,
  type ChartStats,
  type ChartDescriptionOptions,
} from "./chart-a11y.js";

// ============================================
// Mock KeyboardEvent
// ============================================

function createKeyboardEvent(key: string): KeyboardEvent {
  let defaultPrevented = false;
  return {
    key,
    preventDefault: () => {
      defaultPrevented = true;
    },
    get defaultPrevented() {
      return defaultPrevented;
    },
  } as KeyboardEvent;
}

// ============================================
// ARIA Label Generator Tests
// ============================================

describe("generateChartAriaLabel", () => {
  it("generates basic label with chart type", () => {
    const options: ChartDescriptionOptions = {
      chartType: "line",
    };
    const result = generateChartAriaLabel(options);
    expect(result).toBe("line chart");
  });

  it("includes title when provided", () => {
    const options: ChartDescriptionOptions = {
      chartType: "bar",
      title: "Monthly Sales",
    };
    const result = generateChartAriaLabel(options);
    expect(result).toBe("Monthly Sales - bar chart");
  });

  it("includes time range when provided", () => {
    const options: ChartDescriptionOptions = {
      chartType: "candlestick",
      timeRange: {
        start: "2026-01-01",
        end: "2026-01-31",
      },
    };
    const result = generateChartAriaLabel(options);
    expect(result).toContain("from Jan 1, 2026 to Jan 31, 2026");
  });

  it("includes current value when provided", () => {
    const options: ChartDescriptionOptions = {
      chartType: "line",
      stats: { current: 1500 },
    };
    const result = generateChartAriaLabel(options);
    expect(result).toContain("Current value: $1.5K");
  });

  it("handles Date objects in time range", () => {
    const options: ChartDescriptionOptions = {
      chartType: "area",
      timeRange: {
        start: new Date("2026-06-15"),
        end: new Date("2026-06-30"),
      },
    };
    const result = generateChartAriaLabel(options);
    expect(result).toContain("from Jun 15, 2026 to Jun 30, 2026");
  });

  it("combines all options", () => {
    const options: ChartDescriptionOptions = {
      chartType: "candlestick",
      title: "AAPL Price",
      timeRange: {
        start: "2026-01-01",
        end: "2026-01-07",
      },
      stats: { current: 150.5 },
    };
    const result = generateChartAriaLabel(options);
    expect(result).toContain("AAPL Price - candlestick chart");
    expect(result).toContain("from Jan 1, 2026 to Jan 7, 2026");
    expect(result).toContain("Current value: $150.50");
  });
});

describe("generateChartDescription", () => {
  it("generates basic description", () => {
    const options: ChartDescriptionOptions = {
      chartType: "line",
    };
    const result = generateChartDescription(options);
    expect(result).toBe("line visualization.");
  });

  it("includes data point count", () => {
    const options: ChartDescriptionOptions = {
      chartType: "bar",
      dataPointCount: 100,
    };
    const result = generateChartDescription(options);
    expect(result).toContain("Contains 100 data points.");
  });

  it("includes current value", () => {
    const options: ChartDescriptionOptions = {
      chartType: "line",
      stats: { current: 2500000 },
    };
    const result = generateChartDescription(options);
    expect(result).toContain("Current value: $2.50M.");
  });

  it("includes min value", () => {
    const options: ChartDescriptionOptions = {
      chartType: "line",
      stats: { min: 500 },
    };
    const result = generateChartDescription(options);
    expect(result).toContain("Minimum: $500.00.");
  });

  it("includes max value", () => {
    const options: ChartDescriptionOptions = {
      chartType: "line",
      stats: { max: 10000 },
    };
    const result = generateChartDescription(options);
    expect(result).toContain("Maximum: $10.0K.");
  });

  it("includes mean value", () => {
    const options: ChartDescriptionOptions = {
      chartType: "line",
      stats: { mean: 7500 },
    };
    const result = generateChartDescription(options);
    expect(result).toContain("Average: $7.5K.");
  });

  it("includes positive change percent", () => {
    const options: ChartDescriptionOptions = {
      chartType: "line",
      stats: { changePercent: 15.5 },
    };
    const result = generateChartDescription(options);
    expect(result).toContain("Overall gain: 15.50%.");
  });

  it("includes negative change percent", () => {
    const options: ChartDescriptionOptions = {
      chartType: "line",
      stats: { changePercent: -8.25 },
    };
    const result = generateChartDescription(options);
    expect(result).toContain("Overall loss: 8.25%.");
  });

  it("includes all stats", () => {
    const options: ChartDescriptionOptions = {
      chartType: "equity",
      dataPointCount: 250,
      stats: {
        current: 105000,
        min: 95000,
        max: 110000,
        mean: 102500,
        changePercent: 5.0,
      },
    };
    const result = generateChartDescription(options);
    expect(result).toContain("equity visualization.");
    expect(result).toContain("Contains 250 data points.");
    expect(result).toContain("Current value: $105.0K.");
    expect(result).toContain("Minimum: $95.0K.");
    expect(result).toContain("Maximum: $110.0K.");
    expect(result).toContain("Average: $102.5K.");
    expect(result).toContain("Overall gain: 5.00%.");
  });
});

describe("generateUpdateAnnouncement", () => {
  it("announces new value without previous", () => {
    const result = generateUpdateAnnouncement("equity", 100000);
    expect(result).toBe("equity updated to $100.0K");
  });

  it("announces increase", () => {
    const result = generateUpdateAnnouncement("equity", 105000, 100000);
    expect(result).toBe("equity increased to $105.0K, change of $5.0K");
  });

  it("announces decrease", () => {
    const result = generateUpdateAnnouncement("equity", 95000, 100000);
    expect(result).toBe("equity decreased to $95.0K, change of $5.0K");
  });

  it("announces no change as increase", () => {
    const result = generateUpdateAnnouncement("price", 100, 100);
    expect(result).toBe("price increased to $100.00, change of $0.00");
  });

  it("handles large values", () => {
    const result = generateUpdateAnnouncement("portfolio", 2500000, 2000000);
    expect(result).toBe("portfolio increased to $2.50M, change of $500.0K");
  });
});

// ============================================
// Statistics Calculation Tests
// ============================================

describe("calculateStats", () => {
  it("returns empty stats for empty array", () => {
    const result = calculateStats([]);
    expect(result).toEqual({});
  });

  it("calculates stats for single value", () => {
    const result = calculateStats([100]);
    expect(result.current).toBe(100);
    expect(result.min).toBe(100);
    expect(result.max).toBe(100);
    expect(result.mean).toBe(100);
    expect(result.change).toBe(0);
    expect(result.changePercent).toBe(0);
  });

  it("calculates stats for multiple values", () => {
    const result = calculateStats([100, 110, 105, 120, 115]);
    expect(result.current).toBe(115);
    expect(result.min).toBe(100);
    expect(result.max).toBe(120);
    expect(result.mean).toBe(110);
    expect(result.change).toBe(15);
    expect(result.changePercent).toBe(15);
  });

  it("handles negative values", () => {
    const result = calculateStats([-10, -5, 0, 5, 10]);
    expect(result.current).toBe(10);
    expect(result.min).toBe(-10);
    expect(result.max).toBe(10);
    expect(result.mean).toBe(0);
  });

  it("handles first value of zero", () => {
    const result = calculateStats([0, 10, 20]);
    expect(result.changePercent).toBe(0); // Avoid division by zero
  });

  it("calculates negative change percent", () => {
    const result = calculateStats([100, 90, 80]);
    expect(result.change).toBe(-20);
    expect(result.changePercent).toBe(-20);
  });
});

describe("calculateOHLCStats", () => {
  it("calculates stats from OHLC data", () => {
    const data = [
      { close: 100, time: "2026-01-01" },
      { close: 110, time: "2026-01-02" },
      { close: 105, time: "2026-01-03" },
    ];
    const result = calculateOHLCStats(data);
    expect(result.current).toBe(105);
    expect(result.min).toBe(100);
    expect(result.max).toBe(110);
  });

  it("handles empty data", () => {
    const result = calculateOHLCStats([]);
    expect(result).toEqual({});
  });
});

describe("calculateEquityStats", () => {
  it("calculates stats from equity data", () => {
    const data = [
      { value: 100000, time: "2026-01-01" },
      { value: 105000, time: "2026-01-02" },
      { value: 102000, time: "2026-01-03" },
    ];
    const result = calculateEquityStats(data);
    expect(result.current).toBe(102000);
    expect(result.min).toBe(100000);
    expect(result.max).toBe(105000);
  });

  it("handles numeric timestamps", () => {
    const data = [
      { value: 1000, time: 1704067200 },
      { value: 1100, time: 1704153600 },
    ];
    const result = calculateEquityStats(data);
    expect(result.current).toBe(1100);
    expect(result.changePercent).toBe(10);
  });
});

// ============================================
// Keyboard Navigation Tests
// ============================================

describe("KEYBOARD_KEYS", () => {
  it("defines all navigation keys", () => {
    expect(KEYBOARD_KEYS.LEFT).toBe("ArrowLeft");
    expect(KEYBOARD_KEYS.RIGHT).toBe("ArrowRight");
    expect(KEYBOARD_KEYS.UP).toBe("ArrowUp");
    expect(KEYBOARD_KEYS.DOWN).toBe("ArrowDown");
    expect(KEYBOARD_KEYS.HOME).toBe("Home");
    expect(KEYBOARD_KEYS.END).toBe("End");
    expect(KEYBOARD_KEYS.PLUS).toBe("+");
    expect(KEYBOARD_KEYS.MINUS).toBe("-");
    expect(KEYBOARD_KEYS.EQUAL).toBe("=");
    expect(KEYBOARD_KEYS.ENTER).toBe("Enter");
    expect(KEYBOARD_KEYS.SPACE).toBe(" ");
    expect(KEYBOARD_KEYS.ESCAPE).toBe("Escape");
  });
});

describe("handleDataPointNavigation", () => {
  it("handles left arrow - moves to previous", () => {
    const event = createKeyboardEvent("ArrowLeft");
    const result = handleDataPointNavigation(event, 5, 10);
    expect(result.handled).toBe(true);
    expect(result.action).toBe("prev");
    expect(result.index).toBe(4);
  });

  it("handles left arrow at start - stays at 0", () => {
    const event = createKeyboardEvent("ArrowLeft");
    const result = handleDataPointNavigation(event, 0, 10);
    expect(result.index).toBe(0);
  });

  it("handles right arrow - moves to next", () => {
    const event = createKeyboardEvent("ArrowRight");
    const result = handleDataPointNavigation(event, 5, 10);
    expect(result.handled).toBe(true);
    expect(result.action).toBe("next");
    expect(result.index).toBe(6);
  });

  it("handles right arrow at end - stays at last", () => {
    const event = createKeyboardEvent("ArrowRight");
    const result = handleDataPointNavigation(event, 9, 10);
    expect(result.index).toBe(9);
  });

  it("handles Home - goes to first", () => {
    const event = createKeyboardEvent("Home");
    const result = handleDataPointNavigation(event, 5, 10);
    expect(result.handled).toBe(true);
    expect(result.action).toBe("first");
    expect(result.index).toBe(0);
  });

  it("handles End - goes to last", () => {
    const event = createKeyboardEvent("End");
    const result = handleDataPointNavigation(event, 5, 10);
    expect(result.handled).toBe(true);
    expect(result.action).toBe("last");
    expect(result.index).toBe(9);
  });

  it("handles Enter - selects current", () => {
    const event = createKeyboardEvent("Enter");
    const result = handleDataPointNavigation(event, 5, 10);
    expect(result.handled).toBe(true);
    expect(result.action).toBe("select");
    expect(result.index).toBe(5);
  });

  it("handles Space - selects current", () => {
    const event = createKeyboardEvent(" ");
    const result = handleDataPointNavigation(event, 3, 10);
    expect(result.handled).toBe(true);
    expect(result.action).toBe("select");
    expect(result.index).toBe(3);
  });

  it("handles Escape - cancels", () => {
    const event = createKeyboardEvent("Escape");
    const result = handleDataPointNavigation(event, 5, 10);
    expect(result.handled).toBe(true);
    expect(result.action).toBe("cancel");
    expect(result.index).toBeUndefined();
  });

  it("returns unhandled for other keys", () => {
    const event = createKeyboardEvent("a");
    const result = handleDataPointNavigation(event, 5, 10);
    expect(result.handled).toBe(false);
    expect(result.action).toBeUndefined();
  });
});

describe("handleZoomNavigation", () => {
  it("handles plus key - zoom in", () => {
    const event = createKeyboardEvent("+");
    const result = handleZoomNavigation(event);
    expect(result.handled).toBe(true);
    expect(result.action).toBe("zoom-in");
  });

  it("handles equal key - zoom in", () => {
    const event = createKeyboardEvent("=");
    const result = handleZoomNavigation(event);
    expect(result.handled).toBe(true);
    expect(result.action).toBe("zoom-in");
  });

  it("handles minus key - zoom out", () => {
    const event = createKeyboardEvent("-");
    const result = handleZoomNavigation(event);
    expect(result.handled).toBe(true);
    expect(result.action).toBe("zoom-out");
  });

  it("returns unhandled for other keys", () => {
    const event = createKeyboardEvent("z");
    const result = handleZoomNavigation(event);
    expect(result.handled).toBe(false);
  });
});

// ============================================
// Focus Management Tests
// ============================================

describe("FOCUS_STYLES", () => {
  it("defines focus style constants", () => {
    expect(FOCUS_STYLES.outline).toBe("2px solid #D97706");
    expect(FOCUS_STYLES.outlineOffset).toBe("2px");
    expect(FOCUS_STYLES.borderRadius).toBe("4px");
  });
});

describe("getFocusStyleString", () => {
  it("returns CSS style string", () => {
    const result = getFocusStyleString();
    expect(result).toContain("outline: 2px solid #D97706");
    expect(result).toContain("outline-offset: 2px");
    expect(result).toContain("border-radius: 4px");
  });
});

// ============================================
// Data Table Conversion Tests
// ============================================

describe("toAccessibleTableData", () => {
  it("converts data to table format", () => {
    const data = [
      { date: "2026-01-01", value: 100, label: "A" },
      { date: "2026-01-02", value: 200, label: "B" },
    ];
    const columns = [
      { key: "date" as const, label: "Date" },
      { key: "value" as const, label: "Value" },
      { key: "label" as const, label: "Label" },
    ];
    const result = toAccessibleTableData(data, columns);

    expect(result.headers).toEqual(["Date", "Value", "Label"]);
    expect(result.rows).toEqual([
      ["2026-01-01", "100", "A"],
      ["2026-01-02", "200", "B"],
    ]);
  });

  it("uses custom formatters", () => {
    const data = [{ price: 1500 }];
    const columns = [
      {
        key: "price" as const,
        label: "Price",
        formatter: (v: unknown) => `$${(v as number).toFixed(2)}`,
      },
    ];
    const result = toAccessibleTableData(data, columns);
    expect(result.rows[0][0]).toBe("$1500.00");
  });

  it("handles null and undefined values", () => {
    const data = [{ a: null, b: undefined, c: "value" }];
    const columns = [
      { key: "a" as const, label: "A" },
      { key: "b" as const, label: "B" },
      { key: "c" as const, label: "C" },
    ];
    const result = toAccessibleTableData(data, columns);
    expect(result.rows[0]).toEqual(["", "", "value"]);
  });

  it("handles empty data array", () => {
    const columns = [{ key: "a" as const, label: "A" }];
    const result = toAccessibleTableData([], columns);
    expect(result.headers).toEqual(["A"]);
    expect(result.rows).toEqual([]);
  });
});

describe("toCSV", () => {
  it("generates CSV from data", () => {
    const data = [
      { name: "Apple", price: 150 },
      { name: "Google", price: 140 },
    ];
    const columns = [
      { key: "name" as const, label: "Name" },
      { key: "price" as const, label: "Price" },
    ];
    const result = toCSV(data, columns);

    expect(result).toBe('"Name","Price"\n"Apple","150"\n"Google","140"');
  });

  it("escapes quotes in values", () => {
    const data = [{ text: 'Say "Hello"' }];
    const columns = [{ key: "text" as const, label: "Text" }];
    const result = toCSV(data, columns);
    expect(result).toBe('"Text"\n"Say ""Hello"""');
  });

  it("handles null values", () => {
    const data = [{ a: null }];
    const columns = [{ key: "a" as const, label: "A" }];
    const result = toCSV(data, columns);
    expect(result).toBe('"A"\n""');
  });

  it("handles empty data", () => {
    const columns = [{ key: "a" as const, label: "A" }];
    const result = toCSV([], columns);
    expect(result).toBe('"A"');
  });
});

// ============================================
// Color Contrast Tests
// ============================================

describe("checkContrastRatio", () => {
  it("calculates contrast ratio for black on white", () => {
    const result = checkContrastRatio("#000000", "#FFFFFF");
    expect(result.ratio).toBeCloseTo(21, 0);
    expect(result.passesAA).toBe(true);
    expect(result.passesAAA).toBe(true);
  });

  it("calculates contrast ratio for white on black", () => {
    const result = checkContrastRatio("#FFFFFF", "#000000");
    expect(result.ratio).toBeCloseTo(21, 0);
    expect(result.passesAA).toBe(true);
    expect(result.passesAAA).toBe(true);
  });

  it("fails AA for low contrast colors", () => {
    const result = checkContrastRatio("#777777", "#888888");
    expect(result.passesAA).toBe(false);
    expect(result.passesAAA).toBe(false);
  });

  it("handles colors without hash prefix", () => {
    const result = checkContrastRatio("000000", "FFFFFF");
    expect(result.ratio).toBeCloseTo(21, 0);
  });

  it("handles medium contrast colors", () => {
    // Dark gray on light gray
    const result = checkContrastRatio("#333333", "#CCCCCC");
    expect(result.ratio).toBeGreaterThan(4.5);
    expect(result.passesAA).toBe(true);
  });

  it("throws for invalid hex color", () => {
    expect(() => checkContrastRatio("invalid", "#FFFFFF")).toThrow(
      "Invalid hex color"
    );
  });
});

describe("checkGraphicsContrast", () => {
  it("passes for high contrast", () => {
    const result = checkGraphicsContrast("#000000", "#FFFFFF");
    expect(result).toBe(true);
  });

  it("passes for 3:1 ratio", () => {
    // Orange on white typically meets 3:1
    const result = checkGraphicsContrast("#D97706", "#FFFFFF");
    expect(result).toBe(true);
  });

  it("fails for low contrast", () => {
    const result = checkGraphicsContrast("#AAAAAA", "#BBBBBB");
    expect(result).toBe(false);
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("handles very large numbers in stats", () => {
    const result = calculateStats([1000000, 2000000, 1500000]);
    expect(result.current).toBe(1500000);
    expect(result.mean).toBe(1500000);
  });

  it("handles decimal values in stats", () => {
    const result = calculateStats([0.001, 0.002, 0.0015]);
    expect(result.min).toBe(0.001);
    expect(result.max).toBe(0.002);
  });

  it("handles single data point in navigation", () => {
    const event = createKeyboardEvent("ArrowRight");
    const result = handleDataPointNavigation(event, 0, 1);
    expect(result.index).toBe(0);
  });

  it("generateChartAriaLabel handles zero values", () => {
    const options: ChartDescriptionOptions = {
      chartType: "line",
      stats: { current: 0 },
    };
    const result = generateChartAriaLabel(options);
    expect(result).toContain("Current value: $0.00");
  });
});
