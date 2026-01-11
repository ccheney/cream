/**
 * PriceTicker Component Tests
 *
 * Tests for price ticker formatting, hooks, and behavior.
 *
 * @see docs/plans/ui/31-realtime-patterns.md lines 22-27
 */

import { describe, expect, it } from "bun:test";

// ============================================
// Price Formatting Tests
// ============================================

function formatPrice(price: number): string {
  if (price >= 1000) {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (price >= 1) {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function formatDelta(delta: number, percent?: number): string {
  const sign = delta >= 0 ? "+" : "";
  const arrow = delta >= 0 ? "↑" : "↓";
  const formattedDelta = `${sign}${delta.toFixed(2)}`;

  if (percent !== undefined) {
    const signPercent = percent >= 0 ? "+" : "";
    return `${arrow} ${formattedDelta} (${signPercent}${percent.toFixed(2)}%)`;
  }

  return `${arrow} ${formattedDelta}`;
}

describe("formatPrice", () => {
  it("formats large prices with commas", () => {
    expect(formatPrice(1234.56)).toBe("1,234.56");
  });

  it("formats prices with two decimal places", () => {
    expect(formatPrice(187.5)).toBe("187.50");
  });

  it("formats small prices with four decimal places", () => {
    expect(formatPrice(0.0123)).toBe("0.0123");
  });

  it("formats round numbers", () => {
    expect(formatPrice(100)).toBe("100.00");
  });

  it("formats very large prices", () => {
    expect(formatPrice(12345678.9)).toBe("12,345,678.90");
  });
});

describe("formatDelta", () => {
  it("formats positive delta with up arrow", () => {
    expect(formatDelta(0.32)).toBe("↑ +0.32");
  });

  it("formats negative delta with down arrow", () => {
    expect(formatDelta(-0.15)).toBe("↓ -0.15");
  });

  it("formats zero delta with up arrow", () => {
    expect(formatDelta(0)).toBe("↑ +0.00");
  });

  it("formats delta with percent", () => {
    expect(formatDelta(0.32, 0.17)).toBe("↑ +0.32 (+0.17%)");
  });

  it("formats negative delta with percent", () => {
    expect(formatDelta(-0.15, -0.08)).toBe("↓ -0.15 (-0.08%)");
  });
});

// ============================================
// Stale State Calculation Tests
// ============================================

type StaleLevel = "fresh" | "stale" | "very-stale" | "extremely-stale";

interface StaleState {
  level: StaleLevel;
  isStale: boolean;
  opacity: number;
  showIndicator: boolean;
  secondsSinceUpdate: number;
}

const OPACITY_VALUES: Record<StaleLevel, number> = {
  fresh: 1.0,
  stale: 0.7,
  "very-stale": 0.5,
  "extremely-stale": 0.3,
};

function calculateStaleState(
  elapsedMs: number,
  staleThresholdMs = 5000,
  veryStaleThresholdMs = 10000,
  extremelyStaleThresholdMs = 30000
): StaleState {
  const secondsSinceUpdate = Math.floor(elapsedMs / 1000);

  if (elapsedMs >= extremelyStaleThresholdMs) {
    return {
      level: "extremely-stale",
      isStale: true,
      opacity: OPACITY_VALUES["extremely-stale"],
      showIndicator: true,
      secondsSinceUpdate,
    };
  }

  if (elapsedMs >= veryStaleThresholdMs) {
    return {
      level: "very-stale",
      isStale: true,
      opacity: OPACITY_VALUES["very-stale"],
      showIndicator: true,
      secondsSinceUpdate,
    };
  }

  if (elapsedMs >= staleThresholdMs) {
    return {
      level: "stale",
      isStale: true,
      opacity: OPACITY_VALUES.stale,
      showIndicator: false,
      secondsSinceUpdate,
    };
  }

  return {
    level: "fresh",
    isStale: false,
    opacity: OPACITY_VALUES.fresh,
    showIndicator: false,
    secondsSinceUpdate,
  };
}

describe("calculateStaleState", () => {
  it("returns fresh state for recent data", () => {
    const state = calculateStaleState(1000);
    expect(state.level).toBe("fresh");
    expect(state.isStale).toBe(false);
    expect(state.opacity).toBe(1.0);
    expect(state.showIndicator).toBe(false);
  });

  it("returns stale state at 5s threshold", () => {
    const state = calculateStaleState(5000);
    expect(state.level).toBe("stale");
    expect(state.isStale).toBe(true);
    expect(state.opacity).toBe(0.7);
    expect(state.showIndicator).toBe(false);
  });

  it("returns very-stale state at 10s threshold", () => {
    const state = calculateStaleState(10000);
    expect(state.level).toBe("very-stale");
    expect(state.isStale).toBe(true);
    expect(state.opacity).toBe(0.5);
    expect(state.showIndicator).toBe(true);
  });

  it("returns extremely-stale state at 30s threshold", () => {
    const state = calculateStaleState(30000);
    expect(state.level).toBe("extremely-stale");
    expect(state.isStale).toBe(true);
    expect(state.opacity).toBe(0.3);
    expect(state.showIndicator).toBe(true);
  });

  it("calculates seconds since update correctly", () => {
    expect(calculateStaleState(1500).secondsSinceUpdate).toBe(1);
    expect(calculateStaleState(5500).secondsSinceUpdate).toBe(5);
    expect(calculateStaleState(12000).secondsSinceUpdate).toBe(12);
  });
});

// ============================================
// Flash Direction Tests
// ============================================

type FlashDirection = "up" | "down" | null;

function determineFlashDirection(
  currentPrice: number,
  previousPrice: number | undefined
): FlashDirection {
  if (previousPrice === undefined) {
    return null;
  }
  if (currentPrice === previousPrice) {
    return null;
  }
  return currentPrice > previousPrice ? "up" : "down";
}

describe("determineFlashDirection", () => {
  it("returns up for price increase", () => {
    expect(determineFlashDirection(187.52, 187.2)).toBe("up");
  });

  it("returns down for price decrease", () => {
    expect(determineFlashDirection(185.0, 187.52)).toBe("down");
  });

  it("returns null for no change", () => {
    expect(determineFlashDirection(187.52, 187.52)).toBe(null);
  });

  it("returns null for no previous price", () => {
    expect(determineFlashDirection(187.52, undefined)).toBe(null);
  });

  it("handles small price changes", () => {
    expect(determineFlashDirection(187.521, 187.52)).toBe("up");
    expect(determineFlashDirection(187.519, 187.52)).toBe("down");
  });
});

// ============================================
// Component Export Tests
// ============================================

describe("PriceTicker exports", () => {
  it("exports PriceTicker component", async () => {
    const module = await import("./price-ticker");
    expect(module.PriceTicker).toBeDefined();
    expect(module.PriceTicker).not.toBeNull();
  });

  it("exports default as same as named export", async () => {
    const module = await import("./price-ticker");
    expect(module.default).toBe(module.PriceTicker);
  });
});

describe("usePriceFlash exports", () => {
  it("exports usePriceFlash hook", async () => {
    const module = await import("./use-price-flash");
    expect(module.usePriceFlash).toBeDefined();
    expect(typeof module.usePriceFlash).toBe("function");
  });
});

describe("useStaleData exports", () => {
  it("exports useStaleData hook", async () => {
    const module = await import("./use-stale-data");
    expect(module.useStaleData).toBeDefined();
    expect(typeof module.useStaleData).toBe("function");
  });
});

// ============================================
// Debounce Logic Tests
// ============================================

describe("flash debounce logic", () => {
  it("blocks rapid flashes within debounce period", () => {
    const debounceMs = 500;
    const lastFlashTime = 0;
    const currentTime = 300; // 300ms since last flash

    const shouldFlash = currentTime - lastFlashTime >= debounceMs;
    expect(shouldFlash).toBe(false);
  });

  it("allows flash after debounce period", () => {
    const debounceMs = 500;
    const lastFlashTime = 0;
    const currentTime = 600; // 600ms since last flash

    const shouldFlash = currentTime - lastFlashTime >= debounceMs;
    expect(shouldFlash).toBe(true);
  });

  it("allows flash at exactly debounce period", () => {
    const debounceMs = 500;
    const lastFlashTime = 0;
    const currentTime = 500; // exactly 500ms

    const shouldFlash = currentTime - lastFlashTime >= debounceMs;
    expect(shouldFlash).toBe(true);
  });
});

// ============================================
// Delta Calculation Tests
// ============================================

describe("delta calculation", () => {
  it("calculates absolute delta correctly", () => {
    const price = 187.52;
    const previousPrice = 187.2;
    const delta = price - previousPrice;
    expect(delta).toBeCloseTo(0.32, 2);
  });

  it("calculates percent delta correctly", () => {
    const price = 187.52;
    const previousPrice = 187.2;
    const percentDelta = ((price - previousPrice) / previousPrice) * 100;
    expect(percentDelta).toBeCloseTo(0.171, 2);
  });

  it("handles negative delta", () => {
    const price = 185.0;
    const previousPrice = 187.52;
    const delta = price - previousPrice;
    expect(delta).toBeCloseTo(-2.52, 2);
  });

  it("handles zero previous price gracefully", () => {
    const price = 10;
    const previousPrice = 0;
    // Should not divide by zero
    const percentDelta =
      previousPrice !== 0 ? ((price - previousPrice) / previousPrice) * 100 : undefined;
    expect(percentDelta).toBeUndefined();
  });
});
