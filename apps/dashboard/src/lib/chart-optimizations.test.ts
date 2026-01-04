/**
 * Chart Optimizations Tests
 *
 * Tests for data sampling algorithms and performance utilities.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

import { describe, expect, it } from "bun:test";
import {
  downsampleLTTB,
  downsampleTimeSeries,
  downsampleOHLC,
  simplifyDouglasPeucker,
  simplifyTimeSeries,
  sampleEveryN,
  sampleToLength,
  getVisibleWindow,
  calculateVisibleRange,
  LRUCache,
  memoize,
  throttle,
  autoDownsample,
  type Point,
  type TimePoint,
  type OHLCPoint,
} from "./chart-optimizations.js";

// ============================================
// Test Helpers
// ============================================

function generatePoints(count: number): Point[] {
  return Array.from({ length: count }, (_, i) => ({
    x: i,
    y: Math.sin(i * 0.1) * 100 + 100,
  }));
}

function generateTimeSeries(count: number): TimePoint[] {
  return Array.from({ length: count }, (_, i) => ({
    time: Date.now() + i * 1000,
    value: Math.sin(i * 0.1) * 100 + 100,
  }));
}

function generateOHLC(count: number): OHLCPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const base = Math.sin(i * 0.1) * 50 + 100;
    return {
      time: Date.now() + i * 60000,
      open: base,
      high: base + Math.random() * 5,
      low: base - Math.random() * 5,
      close: base + (Math.random() - 0.5) * 4,
    };
  });
}

// ============================================
// LTTB Algorithm Tests
// ============================================

describe("downsampleLTTB", () => {
  it("returns data unchanged if within threshold", () => {
    const data = generatePoints(10);
    const result = downsampleLTTB(data, { threshold: 20 });
    expect(result).toEqual(data);
  });

  it("returns data unchanged if at threshold", () => {
    const data = generatePoints(10);
    const result = downsampleLTTB(data, { threshold: 10 });
    expect(result).toEqual(data);
  });

  it("downsamples to threshold", () => {
    const data = generatePoints(1000);
    const result = downsampleLTTB(data, { threshold: 100 });
    expect(result.length).toBe(100);
  });

  it("preserves first and last points", () => {
    const data = generatePoints(100);
    const result = downsampleLTTB(data, { threshold: 10 });
    expect(result[0]).toEqual(data[0]);
    expect(result[result.length - 1]).toEqual(data[data.length - 1]);
  });

  it("handles threshold of 2", () => {
    const data = generatePoints(100);
    const result = downsampleLTTB(data, { threshold: 2 });
    expect(result.length).toBe(2);
    expect(result[0]).toEqual(data[0]);
    expect(result[1]).toEqual(data[99]);
  });

  it("handles threshold of 1", () => {
    const data = generatePoints(100);
    const result = downsampleLTTB(data, { threshold: 1 });
    expect(result.length).toBe(2);
  });

  it("handles empty array", () => {
    const result = downsampleLTTB([], { threshold: 10 });
    expect(result.length).toBe(0);
  });

  it("handles single point", () => {
    const data = [{ x: 0, y: 100 }];
    const result = downsampleLTTB(data, { threshold: 10 });
    expect(result).toEqual(data);
  });

  it("selects visually significant points", () => {
    // Create data with a clear spike
    const data: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 100 }, // Spike
      { x: 4, y: 0 },
      { x: 5, y: 0 },
      { x: 6, y: 0 },
    ];
    const result = downsampleLTTB(data, { threshold: 4 });
    // Should include the spike
    expect(result.some((p) => p.y === 100)).toBe(true);
  });
});

describe("downsampleTimeSeries", () => {
  it("downsamples time series data", () => {
    const data = generateTimeSeries(1000);
    const result = downsampleTimeSeries(data, 100);
    expect(result.length).toBe(100);
  });

  it("preserves TimePoint structure", () => {
    const data = generateTimeSeries(100);
    const result = downsampleTimeSeries(data, 10);
    result.forEach((point) => {
      expect(typeof point.time).toBe("number");
      expect(typeof point.value).toBe("number");
    });
  });

  it("returns data unchanged if within threshold", () => {
    const data = generateTimeSeries(10);
    const result = downsampleTimeSeries(data, 20);
    expect(result).toEqual(data);
  });
});

describe("downsampleOHLC", () => {
  it("downsamples OHLC data", () => {
    const data = generateOHLC(1000);
    const result = downsampleOHLC(data, 100);
    expect(result.length).toBe(100);
  });

  it("preserves OHLC structure", () => {
    const data = generateOHLC(100);
    const result = downsampleOHLC(data, 10);
    result.forEach((point) => {
      expect(typeof point.open).toBe("number");
      expect(typeof point.high).toBe("number");
      expect(typeof point.low).toBe("number");
      expect(typeof point.close).toBe("number");
    });
  });

  it("returns data unchanged if within threshold", () => {
    const data = generateOHLC(10);
    const result = downsampleOHLC(data, 20);
    expect(result).toEqual(data);
  });
});

// ============================================
// Douglas-Peucker Tests
// ============================================

describe("simplifyDouglasPeucker", () => {
  it("returns data unchanged if 2 or fewer points", () => {
    const data = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    const result = simplifyDouglasPeucker(data, 0.1);
    expect(result).toEqual(data);
  });

  it("simplifies straight line to two points", () => {
    const data: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
      { x: 4, y: 4 },
    ];
    const result = simplifyDouglasPeucker(data, 0.1);
    expect(result.length).toBe(2);
    expect(result[0]).toEqual(data[0]);
    expect(result[1]).toEqual(data[4]);
  });

  it("preserves significant curves", () => {
    const data: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 10 }, // Significant deviation
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ];
    const result = simplifyDouglasPeucker(data, 1);
    // Should include the peak at x=2
    expect(result.some((p) => p.y === 10)).toBe(true);
  });

  it("removes points within epsilon", () => {
    const data: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0.01 }, // Very small deviation
      { x: 2, y: 0 },
    ];
    const result = simplifyDouglasPeucker(data, 0.1);
    expect(result.length).toBe(2);
  });

  it("handles empty array", () => {
    const result = simplifyDouglasPeucker([], 1);
    expect(result).toEqual([]);
  });

  it("handles single point", () => {
    const data = [{ x: 0, y: 0 }];
    const result = simplifyDouglasPeucker(data, 1);
    expect(result).toEqual(data);
  });
});

describe("simplifyTimeSeries", () => {
  it("simplifies time series data", () => {
    const data = generateTimeSeries(100);
    const result = simplifyTimeSeries(data, 5);
    expect(result.length).toBeLessThan(data.length);
  });

  it("returns data unchanged if 2 or fewer points", () => {
    const data: TimePoint[] = [
      { time: 1, value: 100 },
      { time: 2, value: 101 },
    ];
    const result = simplifyTimeSeries(data, 0.1);
    expect(result).toEqual(data);
  });
});

// ============================================
// Simple Sampling Tests
// ============================================

describe("sampleEveryN", () => {
  it("samples every Nth point", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = sampleEveryN(data, 2);
    expect(result).toEqual([1, 3, 5, 7, 9, 10]);
  });

  it("always includes last point", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = sampleEveryN(data, 3);
    expect(result[result.length - 1]).toBe(10);
  });

  it("returns data unchanged if n is 1", () => {
    const data = [1, 2, 3];
    const result = sampleEveryN(data, 1);
    expect(result).toEqual(data);
  });

  it("returns data unchanged if n is 0", () => {
    const data = [1, 2, 3];
    const result = sampleEveryN(data, 0);
    expect(result).toEqual(data);
  });

  it("handles empty array", () => {
    const result = sampleEveryN([], 5);
    expect(result).toEqual([]);
  });
});

describe("sampleToLength", () => {
  it("samples data to approximate target length", () => {
    const data = Array.from({ length: 100 }, (_, i) => i);
    const result = sampleToLength(data, 10);
    expect(result.length).toBeLessThanOrEqual(12);
    expect(result.length).toBeGreaterThanOrEqual(10);
  });

  it("returns data unchanged if within target", () => {
    const data = [1, 2, 3, 4, 5];
    const result = sampleToLength(data, 10);
    expect(result).toEqual(data);
  });

  it("handles empty array", () => {
    const result = sampleToLength([], 10);
    expect(result).toEqual([]);
  });
});

// ============================================
// Windowing Tests
// ============================================

describe("getVisibleWindow", () => {
  it("returns slice of data with overscan", () => {
    const data = Array.from({ length: 100 }, (_, i) => i);
    const result = getVisibleWindow(data, 20, 30, 5);
    expect(result[0]).toBe(15);
    expect(result[result.length - 1]).toBe(34);
  });

  it("clamps to array bounds", () => {
    const data = Array.from({ length: 100 }, (_, i) => i);
    const result = getVisibleWindow(data, 0, 10, 5);
    expect(result[0]).toBe(0);
  });

  it("handles end of array", () => {
    const data = Array.from({ length: 100 }, (_, i) => i);
    const result = getVisibleWindow(data, 95, 100, 5);
    expect(result[result.length - 1]).toBe(99);
  });

  it("uses default overscan of 5", () => {
    const data = Array.from({ length: 100 }, (_, i) => i);
    const result = getVisibleWindow(data, 50, 60);
    expect(result.length).toBe(20);
  });
});

describe("calculateVisibleRange", () => {
  it("calculates visible range based on scroll", () => {
    const result = calculateVisibleRange(500, 100, 50, 100);
    expect(result.startIndex).toBe(2);
    expect(result.endIndex).toBe(12);
  });

  it("clamps to total items", () => {
    const result = calculateVisibleRange(500, 4000, 50, 100);
    // startIndex = 4000/50 = 80, visibleItems = 500/50 = 10, endIndex = min(90, 100) = 90
    expect(result.startIndex).toBe(80);
    expect(result.endIndex).toBe(90);
  });

  it("handles zero scroll", () => {
    const result = calculateVisibleRange(500, 0, 50, 100);
    expect(result.startIndex).toBe(0);
  });
});

// ============================================
// LRU Cache Tests
// ============================================

describe("LRUCache", () => {
  it("stores and retrieves values", () => {
    const cache = new LRUCache<string, number>();
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBe(2);
  });

  it("returns undefined for missing keys", () => {
    const cache = new LRUCache<string, number>();
    expect(cache.get("missing")).toBeUndefined();
  });

  it("evicts oldest entry when full", () => {
    const cache = new LRUCache<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("d", 4);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("d")).toBe(4);
  });

  it("updates LRU order on get", () => {
    const cache = new LRUCache<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.get("a"); // Access 'a' to make it most recent
    cache.set("d", 4); // Should evict 'b', not 'a'
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
  });

  it("has method checks existence", () => {
    const cache = new LRUCache<string, number>();
    cache.set("a", 1);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
  });

  it("clear removes all entries", () => {
    const cache = new LRUCache<string, number>();
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });

  it("reports correct size", () => {
    const cache = new LRUCache<string, number>();
    expect(cache.size).toBe(0);
    cache.set("a", 1);
    expect(cache.size).toBe(1);
    cache.set("b", 2);
    expect(cache.size).toBe(2);
  });

  it("updates existing key without increasing size", () => {
    const cache = new LRUCache<string, number>(3);
    cache.set("a", 1);
    cache.set("a", 2);
    expect(cache.size).toBe(1);
    expect(cache.get("a")).toBe(2);
  });
});

// ============================================
// Memoize Tests
// ============================================

describe("memoize", () => {
  it("caches function results", () => {
    let callCount = 0;
    const fn = (x: number) => {
      callCount++;
      return x * 2;
    };
    const memoized = memoize(fn);

    expect(memoized(5)).toBe(10);
    expect(memoized(5)).toBe(10);
    expect(callCount).toBe(1);
  });

  it("caches with different arguments", () => {
    let callCount = 0;
    const fn = (x: number, y: number) => {
      callCount++;
      return x + y;
    };
    const memoized = memoize(fn);

    expect(memoized(1, 2)).toBe(3);
    expect(memoized(1, 2)).toBe(3);
    expect(memoized(2, 3)).toBe(5);
    expect(callCount).toBe(2);
  });

  it("uses custom key function", () => {
    let callCount = 0;
    const fn = (obj: { id: number }) => {
      callCount++;
      return obj.id * 2;
    };
    const memoized = memoize(fn, (obj) => String(obj.id));

    expect(memoized({ id: 5 })).toBe(10);
    expect(memoized({ id: 5 })).toBe(10);
    expect(callCount).toBe(1);
  });

  it("respects max cache size", () => {
    const fn = (x: number) => x * 2;
    const memoized = memoize(fn, undefined, 2);

    memoized(1);
    memoized(2);
    memoized(3);
    // Cache should have 2 and 3, not 1
  });
});

// ============================================
// Throttle Tests
// ============================================

describe("throttle", () => {
  it("calls function immediately first time", () => {
    let callCount = 0;
    const fn = throttle(() => {
      callCount++;
    }, 100);

    fn();
    expect(callCount).toBe(1);
  });

  it("throttles rapid calls", async () => {
    let callCount = 0;
    const fn = throttle(() => {
      callCount++;
    }, 50);

    fn();
    fn();
    fn();
    expect(callCount).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(callCount).toBe(2); // Last call is executed after throttle period
  });
});

// ============================================
// Auto Downsample Tests
// ============================================

describe("autoDownsample", () => {
  it("returns data unchanged if within target", () => {
    const data = generatePoints(100);
    const result = autoDownsample(data, 1000);
    expect(result).toEqual(data);
  });

  it("downsamples large datasets with LTTB", () => {
    const data = generatePoints(10000);
    const result = autoDownsample(data, 500);
    expect(result.length).toBe(500);
  });

  it("uses simple sampling for smaller datasets", () => {
    const data = generatePoints(2000);
    const result = autoDownsample(data, 500);
    expect(result.length).toBeLessThanOrEqual(505);
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("handles very large datasets", () => {
    const data = generatePoints(100000);
    const result = downsampleLTTB(data, { threshold: 1000 });
    expect(result.length).toBe(1000);
  });

  it("handles all same values", () => {
    const data: Point[] = Array.from({ length: 100 }, (_, i) => ({
      x: i,
      y: 50,
    }));
    const result = downsampleLTTB(data, { threshold: 10 });
    expect(result.length).toBe(10);
  });

  it("handles negative values", () => {
    const data: Point[] = Array.from({ length: 100 }, (_, i) => ({
      x: i,
      y: -50 + i,
    }));
    const result = downsampleLTTB(data, { threshold: 10 });
    expect(result.length).toBe(10);
  });

  it("handles very small values", () => {
    const data: Point[] = Array.from({ length: 100 }, (_, i) => ({
      x: i,
      y: 0.0001 + i * 0.00001,
    }));
    const result = downsampleLTTB(data, { threshold: 10 });
    expect(result.length).toBe(10);
  });
});
