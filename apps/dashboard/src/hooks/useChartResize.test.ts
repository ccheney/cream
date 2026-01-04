/**
 * Chart Resize Hook Tests
 *
 * Tests for responsive chart sizing utilities.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
  debounce,
  getBreakpoint,
  clamp,
  calculateDimensions,
  BREAKPOINTS,
  ASPECT_RATIOS,
  type UseChartResizeOptions,
} from "./useChartResize.js";

// ============================================
// Debounce Tests
// ============================================

describe("debounce", () => {
  it("delays function execution", async () => {
    let callCount = 0;
    const fn = debounce(() => {
      callCount++;
    }, 50);

    fn();
    fn();
    fn();

    expect(callCount).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(callCount).toBe(1);
  });

  it("resets timer on subsequent calls", async () => {
    let callCount = 0;
    const fn = debounce(() => {
      callCount++;
    }, 50);

    fn();
    await new Promise((resolve) => setTimeout(resolve, 30));
    fn();
    await new Promise((resolve) => setTimeout(resolve, 30));
    fn();

    expect(callCount).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(callCount).toBe(1);
  });

  it("passes arguments correctly", async () => {
    let receivedArgs: unknown[] = [];
    const fn = debounce((...args: unknown[]) => {
      receivedArgs = args;
    }, 50);

    fn(1, "test", { key: "value" });

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(receivedArgs).toEqual([1, "test", { key: "value" }]);
  });

  it("handles zero delay", async () => {
    let callCount = 0;
    const fn = debounce(() => {
      callCount++;
    }, 0);

    fn();

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(callCount).toBe(1);
  });
});

// ============================================
// Breakpoint Tests
// ============================================

describe("BREAKPOINTS", () => {
  it("defines mobile breakpoint at 768", () => {
    expect(BREAKPOINTS.mobile).toBe(768);
  });

  it("defines tablet breakpoint at 1024", () => {
    expect(BREAKPOINTS.tablet).toBe(1024);
  });
});

describe("getBreakpoint", () => {
  it("returns mobile for width < 768", () => {
    expect(getBreakpoint(0)).toBe("mobile");
    expect(getBreakpoint(320)).toBe("mobile");
    expect(getBreakpoint(767)).toBe("mobile");
  });

  it("returns tablet for width 768-1023", () => {
    expect(getBreakpoint(768)).toBe("tablet");
    expect(getBreakpoint(900)).toBe("tablet");
    expect(getBreakpoint(1023)).toBe("tablet");
  });

  it("returns desktop for width >= 1024", () => {
    expect(getBreakpoint(1024)).toBe("desktop");
    expect(getBreakpoint(1280)).toBe("desktop");
    expect(getBreakpoint(1920)).toBe("desktop");
    expect(getBreakpoint(3840)).toBe("desktop");
  });
});

// ============================================
// Clamp Tests
// ============================================

describe("clamp", () => {
  it("returns value when within range", () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });

  it("clamps to min when below", () => {
    expect(clamp(-10, 0, 100)).toBe(0);
    expect(clamp(0, 10, 100)).toBe(10);
  });

  it("clamps to max when above", () => {
    expect(clamp(150, 0, 100)).toBe(100);
    expect(clamp(200, 0, 100)).toBe(100);
  });

  it("handles undefined min", () => {
    expect(clamp(-100, undefined, 100)).toBe(-100);
    expect(clamp(150, undefined, 100)).toBe(100);
  });

  it("handles undefined max", () => {
    expect(clamp(-100, 0, undefined)).toBe(0);
    expect(clamp(1000, 0, undefined)).toBe(1000);
  });

  it("handles both undefined", () => {
    expect(clamp(-1000)).toBe(-1000);
    expect(clamp(1000)).toBe(1000);
  });

  it("handles min equals max", () => {
    expect(clamp(0, 50, 50)).toBe(50);
    expect(clamp(100, 50, 50)).toBe(50);
  });
});

// ============================================
// Aspect Ratio Constants Tests
// ============================================

describe("ASPECT_RATIOS", () => {
  it("defines widescreen as 16:9", () => {
    expect(ASPECT_RATIOS.widescreen).toBeCloseTo(16 / 9, 5);
  });

  it("defines ultrawide as 21:9", () => {
    expect(ASPECT_RATIOS.ultrawide).toBeCloseTo(21 / 9, 5);
  });

  it("defines standard as 4:3", () => {
    expect(ASPECT_RATIOS.standard).toBeCloseTo(4 / 3, 5);
  });

  it("defines golden ratio", () => {
    expect(ASPECT_RATIOS.golden).toBeCloseTo(1.618, 3);
  });

  it("defines square as 1:1", () => {
    expect(ASPECT_RATIOS.square).toBe(1);
  });

  it("defines threeTwo as 3:2", () => {
    expect(ASPECT_RATIOS.threeTwo).toBeCloseTo(3 / 2, 5);
  });
});

// ============================================
// Calculate Dimensions Tests
// ============================================

describe("calculateDimensions", () => {
  it("calculates dimensions with default 16:9 aspect ratio", () => {
    const result = calculateDimensions(1600, {});
    expect(result.width).toBe(1600);
    expect(result.height).toBe(900);
  });

  it("calculates dimensions with custom aspect ratio", () => {
    const result = calculateDimensions(1000, { aspectRatio: 1 });
    expect(result.width).toBe(1000);
    expect(result.height).toBe(1000);
  });

  it("uses fixed height when provided", () => {
    const result = calculateDimensions(800, {
      aspectRatio: 16 / 9, // Should be ignored
      fixedHeight: 100,
    });
    expect(result.width).toBe(800);
    expect(result.height).toBe(100);
  });

  it("applies minWidth constraint", () => {
    const result = calculateDimensions(200, { minWidth: 300 });
    expect(result.width).toBe(300);
  });

  it("applies maxWidth constraint", () => {
    const result = calculateDimensions(2000, { maxWidth: 1200 });
    expect(result.width).toBe(1200);
  });

  it("applies minHeight constraint", () => {
    const result = calculateDimensions(160, {
      aspectRatio: 16 / 9,
      minHeight: 100,
    });
    expect(result.height).toBe(100); // Would be 90 without constraint
  });

  it("applies maxHeight constraint", () => {
    const result = calculateDimensions(1600, {
      aspectRatio: 1,
      maxHeight: 800,
    });
    expect(result.height).toBe(800); // Would be 1600 without constraint
  });

  it("rounds dimensions to integers", () => {
    const result = calculateDimensions(1000, { aspectRatio: 3 });
    expect(result.width).toBe(1000);
    expect(result.height).toBe(333);
    expect(Number.isInteger(result.width)).toBe(true);
    expect(Number.isInteger(result.height)).toBe(true);
  });

  it("handles very small widths", () => {
    const result = calculateDimensions(1, { aspectRatio: 16 / 9 });
    expect(result.width).toBe(1);
    expect(result.height).toBe(1); // Rounded from 0.5625
  });

  it("handles zero width", () => {
    const result = calculateDimensions(0, { aspectRatio: 16 / 9 });
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  it("applies all constraints together", () => {
    const result = calculateDimensions(500, {
      aspectRatio: 1,
      minWidth: 300,
      maxWidth: 400,
      minHeight: 200,
      maxHeight: 350,
    });
    // Width should be clamped to maxWidth (400)
    expect(result.width).toBe(400);
    // Height would be 400 from aspect ratio, but clamped to 350
    expect(result.height).toBe(350);
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("handles very large widths", () => {
    const result = calculateDimensions(10000, { aspectRatio: 16 / 9 });
    expect(result.width).toBe(10000);
    expect(result.height).toBe(5625);
  });

  it("handles fractional aspect ratios", () => {
    const result = calculateDimensions(1000, { aspectRatio: 1.5 });
    expect(result.width).toBe(1000);
    expect(result.height).toBe(667);
  });

  it("handles extreme aspect ratios", () => {
    const veryWide = calculateDimensions(1000, { aspectRatio: 10 });
    expect(veryWide.height).toBe(100);

    const veryTall = calculateDimensions(1000, { aspectRatio: 0.1 });
    expect(veryTall.height).toBe(10000);
  });

  it("handles conflicting constraints", () => {
    // minWidth > containerWidth
    const result = calculateDimensions(100, { minWidth: 500 });
    expect(result.width).toBe(500);
  });

  it("handles minWidth > maxWidth", () => {
    // This is a degenerate case but should handle gracefully
    const result = calculateDimensions(300, {
      minWidth: 500,
      maxWidth: 200,
    });
    // maxWidth is applied last, so it wins
    expect(result.width).toBe(200);
  });
});

// ============================================
// Integration Scenarios
// ============================================

describe("Integration Scenarios", () => {
  it("sparkline configuration", () => {
    const result = calculateDimensions(200, { fixedHeight: 32 });
    expect(result.width).toBe(200);
    expect(result.height).toBe(32);
  });

  it("equity curve configuration (16:9)", () => {
    const result = calculateDimensions(800, {
      aspectRatio: ASPECT_RATIOS.widescreen,
    });
    expect(result.width).toBe(800);
    expect(result.height).toBe(450);
  });

  it("allocation chart configuration (square, max 400px)", () => {
    const result = calculateDimensions(600, {
      aspectRatio: ASPECT_RATIOS.square,
      maxWidth: 400,
    });
    expect(result.width).toBe(400);
    expect(result.height).toBe(400);
  });

  it("returns chart configuration (3:2)", () => {
    const result = calculateDimensions(900, {
      aspectRatio: ASPECT_RATIOS.threeTwo,
    });
    expect(result.width).toBe(900);
    expect(result.height).toBe(600);
  });

  it("tradingview chart configuration (ultrawide)", () => {
    const result = calculateDimensions(1260, {
      aspectRatio: ASPECT_RATIOS.ultrawide,
    });
    expect(result.width).toBe(1260);
    expect(result.height).toBe(540);
  });

  it("mobile sparkline", () => {
    const result = calculateDimensions(320, {
      fixedHeight: 24,
      minWidth: 100,
    });
    expect(result.width).toBe(320);
    expect(result.height).toBe(24);
  });

  it("gauge configuration (square, responsive)", () => {
    const desktopResult = calculateDimensions(300, {
      aspectRatio: ASPECT_RATIOS.square,
      minWidth: 150,
      maxWidth: 300,
    });
    expect(desktopResult.width).toBe(300);
    expect(desktopResult.height).toBe(300);

    const mobileResult = calculateDimensions(100, {
      aspectRatio: ASPECT_RATIOS.square,
      minWidth: 150,
      maxWidth: 300,
    });
    expect(mobileResult.width).toBe(150);
    expect(mobileResult.height).toBe(150);
  });
});

// ============================================
// Breakpoint Transitions
// ============================================

describe("Breakpoint Transitions", () => {
  it("transitions correctly across all breakpoints", () => {
    // Mobile range
    for (let w = 0; w < 768; w += 100) {
      expect(getBreakpoint(w)).toBe("mobile");
    }

    // Tablet range
    for (let w = 768; w < 1024; w += 50) {
      expect(getBreakpoint(w)).toBe("tablet");
    }

    // Desktop range
    for (let w = 1024; w <= 3840; w += 200) {
      expect(getBreakpoint(w)).toBe("desktop");
    }
  });

  it("handles boundary values correctly", () => {
    expect(getBreakpoint(767)).toBe("mobile");
    expect(getBreakpoint(768)).toBe("tablet");
    expect(getBreakpoint(1023)).toBe("tablet");
    expect(getBreakpoint(1024)).toBe("desktop");
  });
});
