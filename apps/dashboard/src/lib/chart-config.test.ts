/**
 * Chart Configuration Tests
 *
 * Tests for TradingView chart configuration and helpers.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

import { describe, expect, it } from "bun:test";
import {
  CHART_COLORS,
  createEntryMarker,
  createExitMarker,
  createStopLossLine,
  createTakeProfitLine,
  DEFAULT_CANDLESTICK_OPTIONS,
  DEFAULT_CHART_OPTIONS,
  DEFAULT_LINE_OPTIONS,
  SAMPLE_OHLCV_DATA,
} from "./chart-config.js";

// ============================================
// Color Constants Tests
// ============================================

describe("CHART_COLORS", () => {
  it("has correct profit color (green)", () => {
    expect(CHART_COLORS.profit).toBe("#22C55E");
  });

  it("has correct loss color (red)", () => {
    expect(CHART_COLORS.loss).toBe("#EF4444");
  });

  it("has correct primary color (amber)", () => {
    expect(CHART_COLORS.primary).toBe("#D97706");
  });

  it("has correct text color (stone-400)", () => {
    expect(CHART_COLORS.text).toBe("#78716C");
  });

  it("has transparent background", () => {
    expect(CHART_COLORS.background).toBe("transparent");
  });
});

// ============================================
// Chart Options Tests
// ============================================

describe("DEFAULT_CHART_OPTIONS", () => {
  it("has transparent background", () => {
    expect(DEFAULT_CHART_OPTIONS.layout?.background?.color).toBe("transparent");
  });

  it("has correct text color", () => {
    expect(DEFAULT_CHART_OPTIONS.layout?.textColor).toBe("#78716C");
  });

  it("has correct font size", () => {
    expect(DEFAULT_CHART_OPTIONS.layout?.fontSize).toBe(11);
  });

  it("has correct font family", () => {
    expect(DEFAULT_CHART_OPTIONS.layout?.fontFamily).toBe("Geist Mono, monospace");
  });

  it("has grid lines configured", () => {
    expect(DEFAULT_CHART_OPTIONS.grid?.vertLines?.color).toBeDefined();
    expect(DEFAULT_CHART_OPTIONS.grid?.horzLines?.color).toBeDefined();
  });

  it("has crosshair configured with primary color", () => {
    expect(DEFAULT_CHART_OPTIONS.crosshair?.vertLine?.color).toBe("#D97706");
    expect(DEFAULT_CHART_OPTIONS.crosshair?.horzLine?.color).toBe("#D97706");
  });

  it("has dashed crosshair lines", () => {
    expect(DEFAULT_CHART_OPTIONS.crosshair?.vertLine?.style).toBe(2);
    expect(DEFAULT_CHART_OPTIONS.crosshair?.horzLine?.style).toBe(2);
  });
});

// ============================================
// Candlestick Options Tests
// ============================================

describe("DEFAULT_CANDLESTICK_OPTIONS", () => {
  it("has correct up color", () => {
    expect(DEFAULT_CANDLESTICK_OPTIONS.upColor).toBe("#22C55E");
  });

  it("has correct down color", () => {
    expect(DEFAULT_CANDLESTICK_OPTIONS.downColor).toBe("#EF4444");
  });

  it("has correct wick up color", () => {
    expect(DEFAULT_CANDLESTICK_OPTIONS.wickUpColor).toBe("#22C55E");
  });

  it("has correct wick down color", () => {
    expect(DEFAULT_CANDLESTICK_OPTIONS.wickDownColor).toBe("#EF4444");
  });

  it("has border disabled", () => {
    expect(DEFAULT_CANDLESTICK_OPTIONS.borderVisible).toBe(false);
  });
});

// ============================================
// Line Options Tests
// ============================================

describe("DEFAULT_LINE_OPTIONS", () => {
  it("has correct line color", () => {
    expect(DEFAULT_LINE_OPTIONS.color).toBe("#D97706");
  });

  it("has correct line width", () => {
    expect(DEFAULT_LINE_OPTIONS.lineWidth).toBe(2);
  });

  it("has crosshair marker enabled", () => {
    expect(DEFAULT_LINE_OPTIONS.crosshairMarkerVisible).toBe(true);
  });
});

// ============================================
// Marker Creation Tests
// ============================================

describe("createEntryMarker", () => {
  it("creates marker with correct position", () => {
    const marker = createEntryMarker("2026-01-01");
    expect(marker.position).toBe("belowBar");
  });

  it("creates marker with green color", () => {
    const marker = createEntryMarker("2026-01-01");
    expect(marker.color).toBe("#22C55E");
  });

  it("creates marker with arrow up shape", () => {
    const marker = createEntryMarker("2026-01-01");
    expect(marker.shape).toBe("arrowUp");
  });

  it("creates marker with default BUY text", () => {
    const marker = createEntryMarker("2026-01-01");
    expect(marker.text).toBe("BUY");
  });

  it("creates marker with custom text", () => {
    const marker = createEntryMarker("2026-01-01", "LONG");
    expect(marker.text).toBe("LONG");
  });

  it("creates marker with correct time", () => {
    const marker = createEntryMarker("2026-01-01");
    expect(marker.time).toBe("2026-01-01");
  });
});

describe("createExitMarker", () => {
  it("creates marker with correct position", () => {
    const marker = createExitMarker("2026-01-01");
    expect(marker.position).toBe("aboveBar");
  });

  it("creates marker with red color", () => {
    const marker = createExitMarker("2026-01-01");
    expect(marker.color).toBe("#EF4444");
  });

  it("creates marker with arrow down shape", () => {
    const marker = createExitMarker("2026-01-01");
    expect(marker.shape).toBe("arrowDown");
  });

  it("creates marker with default SELL text", () => {
    const marker = createExitMarker("2026-01-01");
    expect(marker.text).toBe("SELL");
  });

  it("creates marker with custom text", () => {
    const marker = createExitMarker("2026-01-01", "CLOSE");
    expect(marker.text).toBe("CLOSE");
  });
});

// ============================================
// Price Line Creation Tests
// ============================================

describe("createStopLossLine", () => {
  it("creates line with correct price", () => {
    const line = createStopLossLine(145.0);
    expect(line.price).toBe(145.0);
  });

  it("creates line with red color", () => {
    const line = createStopLossLine(145.0);
    expect(line.color).toContain("239, 68, 68");
  });

  it("creates line with dashed style", () => {
    const line = createStopLossLine(145.0);
    expect(line.lineStyle).toBe(2);
  });

  it("creates line with Stop title", () => {
    const line = createStopLossLine(145.0);
    expect(line.title).toBe("Stop");
  });

  it("creates line with axis label visible", () => {
    const line = createStopLossLine(145.0);
    expect(line.axisLabelVisible).toBe(true);
  });
});

describe("createTakeProfitLine", () => {
  it("creates line with correct price", () => {
    const line = createTakeProfitLine(155.0);
    expect(line.price).toBe(155.0);
  });

  it("creates line with green color", () => {
    const line = createTakeProfitLine(155.0);
    expect(line.color).toContain("34, 197, 94");
  });

  it("creates line with Target title", () => {
    const line = createTakeProfitLine(155.0);
    expect(line.title).toBe("Target");
  });
});

// ============================================
// Sample Data Tests
// ============================================

describe("SAMPLE_OHLCV_DATA", () => {
  it("has correct number of entries", () => {
    expect(SAMPLE_OHLCV_DATA.length).toBe(5);
  });

  it("has all required fields", () => {
    for (const candle of SAMPLE_OHLCV_DATA) {
      expect(candle.time).toBeDefined();
      expect(candle.open).toBeDefined();
      expect(candle.high).toBeDefined();
      expect(candle.low).toBeDefined();
      expect(candle.close).toBeDefined();
    }
  });

  it("has valid OHLC relationships", () => {
    for (const candle of SAMPLE_OHLCV_DATA) {
      expect(candle.high).toBeGreaterThanOrEqual(candle.open);
      expect(candle.high).toBeGreaterThanOrEqual(candle.close);
      expect(candle.high).toBeGreaterThanOrEqual(candle.low);
      expect(candle.low).toBeLessThanOrEqual(candle.open);
      expect(candle.low).toBeLessThanOrEqual(candle.close);
    }
  });
});
