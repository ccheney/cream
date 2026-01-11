/**
 * Chart Updaters Tests
 *
 * Tests for chart update functions.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

import { describe, expect, it } from "bun:test";
import type { EquityDataPoint } from "@/components/charts/EquityCurve.js";
import type { OHLCVData } from "./chart-config";
import {
  appendCandle,
  appendEquityPoint,
  appendSparklineValue,
  applyCandleUpdate,
  batchUpdateSparkline,
  type CandleUpdate,
  createThrottledUpdater,
  type EquityUpdate,
  filterStaleUpdates,
  parseChartUpdateMessage,
  sortByTimestamp,
  trimData,
  updateLastCandle,
  updateLastEquityPoint,
} from "./chart-updaters";

// ============================================
// Test Helpers
// ============================================

function createCandle(time: string, close: number): OHLCVData {
  return {
    time,
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// Candle Updater Tests
// ============================================

describe("appendCandle", () => {
  it("appends candle to empty array", () => {
    const candle = createCandle("2026-01-01", 100);
    const result = appendCandle([], candle);
    expect(result.length).toBe(1 as any);
    expect(result[0]).toEqual(candle);
  });

  it("appends candle to existing data", () => {
    const existing = [createCandle("2026-01-01", 100)];
    const newCandle = createCandle("2026-01-02", 101);
    const result = appendCandle(existing, newCandle);
    expect(result.length).toBe(2 as any);
    expect(result[1]).toEqual(newCandle);
  });

  it("does not mutate original array", () => {
    const existing = [createCandle("2026-01-01", 100)];
    const newCandle = createCandle("2026-01-02", 101);
    appendCandle(existing, newCandle);
    expect(existing.length).toBe(1 as any);
  });
});

describe("updateLastCandle", () => {
  it("adds candle to empty array", () => {
    const candle = createCandle("2026-01-01", 100);
    const result = updateLastCandle([], candle);
    expect(result.length).toBe(1 as any);
    expect(result[0]).toEqual(candle);
  });

  it("updates last candle with same time", () => {
    const existing = [createCandle("2026-01-01", 100)];
    const updated = createCandle("2026-01-01", 105);
    const result = updateLastCandle(existing, updated);
    expect(result.length).toBe(1 as any);
    expect(result[0]!.close).toBe(105 as any);
  });

  it("appends candle with different time", () => {
    const existing = [createCandle("2026-01-01", 100)];
    const newCandle = createCandle("2026-01-02", 101);
    const result = updateLastCandle(existing, newCandle);
    expect(result.length).toBe(2 as any);
    expect(result[1]).toEqual(newCandle);
  });
});

describe("applyCandleUpdate", () => {
  it("applies append update", () => {
    const data: OHLCVData[] = [createCandle("2026-01-01", 100)];
    const update: CandleUpdate = {
      type: "append",
      candle: createCandle("2026-01-02", 101),
    };
    const result = applyCandleUpdate(data, update);
    expect(result.length).toBe(2 as any);
  });

  it("applies update to last candle", () => {
    const data: OHLCVData[] = [createCandle("2026-01-01", 100)];
    const update: CandleUpdate = {
      type: "update",
      candle: createCandle("2026-01-01", 105),
    };
    const result = applyCandleUpdate(data, update);
    expect(result.length).toBe(1 as any);
    expect(result[0]!.close).toBe(105 as any);
  });
});

// ============================================
// Trim Data Tests
// ============================================

describe("trimData", () => {
  it("returns data unchanged if within limit", () => {
    const data = [1, 2, 3, 4, 5];
    const result = trimData(data, 10);
    expect(result).toEqual(data);
  });

  it("trims to max length keeping most recent", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = trimData(data, 5);
    expect(result).toEqual([6, 7, 8, 9, 10]);
  });

  it("handles exact length", () => {
    const data = [1, 2, 3, 4, 5];
    const result = trimData(data, 5);
    expect(result).toEqual(data);
  });

  it("handles empty array", () => {
    const result = trimData([], 5);
    expect(result).toEqual([]);
  });
});

// ============================================
// Equity Updater Tests
// ============================================

describe("appendEquityPoint", () => {
  it("appends point to empty array", () => {
    const update: EquityUpdate = {
      value: 100000,
      timestamp: "2026-01-01",
    };
    const result = appendEquityPoint([], update);
    expect(result.length).toBe(1 as any);
    expect(result[0]!.value).toBe(100000 as any);
  });

  it("includes drawdown if provided", () => {
    const update: EquityUpdate = {
      value: 95000,
      timestamp: "2026-01-02",
      drawdown: -0.05,
    };
    const result = appendEquityPoint([], update);
    expect(result[0]!.drawdown).toBe(-0.05);
  });
});

describe("updateLastEquityPoint", () => {
  it("adds point to empty array", () => {
    const update: EquityUpdate = {
      value: 100000,
      timestamp: "2026-01-01",
    };
    const result = updateLastEquityPoint([], update);
    expect(result.length).toBe(1 as any);
  });

  it("updates last point with same timestamp", () => {
    const existing: EquityDataPoint[] = [{ time: "2026-01-01", value: 100000 }];
    const update: EquityUpdate = {
      value: 100500,
      timestamp: "2026-01-01",
    };
    const result = updateLastEquityPoint(existing, update);
    expect(result.length).toBe(1 as any);
    expect(result[0]!.value).toBe(100500 as any);
  });

  it("appends with different timestamp", () => {
    const existing: EquityDataPoint[] = [{ time: "2026-01-01", value: 100000 }];
    const update: EquityUpdate = {
      value: 101000,
      timestamp: "2026-01-02",
    };
    const result = updateLastEquityPoint(existing, update);
    expect(result.length).toBe(2 as any);
  });
});

// ============================================
// Sparkline Updater Tests
// ============================================

describe("appendSparklineValue", () => {
  it("appends value to empty array", () => {
    const result = appendSparklineValue([], 100);
    expect(result).toEqual([100]);
  });

  it("appends value to existing data", () => {
    const result = appendSparklineValue([1, 2, 3], 4);
    expect(result).toEqual([1, 2, 3, 4]);
  });

  it("shifts when exceeding max length", () => {
    const result = appendSparklineValue([1, 2, 3, 4, 5], 6, 5);
    expect(result).toEqual([2, 3, 4, 5, 6]);
  });

  it("uses default max length of 20", () => {
    const data = Array.from({ length: 20 }, (_, i) => i);
    const result = appendSparklineValue(data, 20);
    expect(result.length).toBe(20 as any);
    expect(result[0]).toBe(1 as any);
    expect(result[19]).toBe(20 as any);
  });
});

describe("batchUpdateSparkline", () => {
  it("adds multiple values", () => {
    const result = batchUpdateSparkline([1, 2], [3, 4, 5]);
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it("trims to max length", () => {
    const result = batchUpdateSparkline([1, 2, 3], [4, 5, 6, 7, 8], 5);
    expect(result).toEqual([4, 5, 6, 7, 8]);
  });

  it("handles empty initial data", () => {
    const result = batchUpdateSparkline([], [1, 2, 3]);
    expect(result).toEqual([1, 2, 3]);
  });

  it("handles empty values array", () => {
    const result = batchUpdateSparkline([1, 2, 3], []);
    expect(result).toEqual([1, 2, 3]);
  });
});

// ============================================
// Throttle Tests
// ============================================

describe("createThrottledUpdater", () => {
  it("calls update function immediately first time", () => {
    let value: number | null = null;
    const throttled = createThrottledUpdater<number>((v) => {
      value = v;
    }, 50);

    throttled.update(1);
    expect(value).toBe(1 as any);
    throttled.cancel();
  });

  it("throttles rapid updates", async () => {
    const values: number[] = [];
    const throttled = createThrottledUpdater<number>((v) => {
      values.push(v);
    }, 50);

    throttled.update(1);
    throttled.update(2);
    throttled.update(3);

    expect(values).toEqual([1]); // Only first goes through

    await delay(60);
    expect(values).toEqual([1, 3]); // Last pending value sent

    throttled.cancel();
  });

  it("flush sends pending immediately", async () => {
    const values: number[] = [];
    const throttled = createThrottledUpdater<number>((v) => {
      values.push(v);
    }, 1000);

    throttled.update(1);
    throttled.update(2);
    throttled.flush();

    expect(values).toEqual([1, 2]);
    throttled.cancel();
  });

  it("cancel prevents pending updates", async () => {
    const values: number[] = [];
    const throttled = createThrottledUpdater<number>((v) => {
      values.push(v);
    }, 50);

    throttled.update(1);
    throttled.update(2);
    throttled.cancel();

    await delay(60);
    expect(values).toEqual([1]); // Pending was canceled
  });
});

// ============================================
// Message Parsing Tests
// ============================================

describe("parseChartUpdateMessage", () => {
  it("parses valid message", () => {
    const raw = {
      chartType: "candles",
      symbol: "AAPL",
      payload: { type: "append", candle: {} },
      timestamp: "2026-01-01T00:00:00Z",
    };
    const result = parseChartUpdateMessage(raw);
    expect(result).not.toBeNull();
    expect(result?.chartType).toBe("candles");
    expect(result?.symbol).toBe("AAPL");
  });

  it("returns null for invalid chart type", () => {
    const raw = {
      chartType: "invalid",
      payload: {},
      timestamp: "2026-01-01T00:00:00Z",
    };
    expect(parseChartUpdateMessage(raw)).toBeNull();
  });

  it("returns null for missing payload", () => {
    const raw = {
      chartType: "candles",
      timestamp: "2026-01-01T00:00:00Z",
    };
    expect(parseChartUpdateMessage(raw)).toBeNull();
  });

  it("returns null for missing timestamp", () => {
    const raw = {
      chartType: "candles",
      payload: {},
    };
    expect(parseChartUpdateMessage(raw)).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(parseChartUpdateMessage(null)).toBeNull();
    expect(parseChartUpdateMessage("string")).toBeNull();
    expect(parseChartUpdateMessage(123)).toBeNull();
  });

  it("handles optional symbol", () => {
    const raw = {
      chartType: "equity",
      payload: { value: 100 },
      timestamp: "2026-01-01T00:00:00Z",
    };
    const result = parseChartUpdateMessage(raw);
    expect(result?.symbol).toBeUndefined();
  });
});

// ============================================
// Sorting and Filtering Tests
// ============================================

describe("sortByTimestamp", () => {
  it("sorts updates by timestamp", () => {
    const updates = [
      { timestamp: "2026-01-03T00:00:00Z", value: 3 },
      { timestamp: "2026-01-01T00:00:00Z", value: 1 },
      { timestamp: "2026-01-02T00:00:00Z", value: 2 },
    ];
    const result = sortByTimestamp(updates);
    expect(result[0]!.value).toBe(1 as any);
    expect(result[1]!.value).toBe(2 as any);
    expect(result[2]!.value).toBe(3 as any);
  });

  it("does not mutate original array", () => {
    const updates = [
      { timestamp: "2026-01-02T00:00:00Z", value: 2 },
      { timestamp: "2026-01-01T00:00:00Z", value: 1 },
    ];
    sortByTimestamp(updates);
    expect(updates[0]!.value).toBe(2 as any);
  });

  it("handles empty array", () => {
    const result = sortByTimestamp([]);
    expect(result).toEqual([]);
  });
});

describe("filterStaleUpdates", () => {
  it("filters out old updates", () => {
    const now = new Date();
    const old = new Date(now.getTime() - 10000).toISOString();
    const recent = new Date(now.getTime() - 1000).toISOString();

    const updates = [
      { timestamp: old, value: 1 },
      { timestamp: recent, value: 2 },
    ];

    const result = filterStaleUpdates(updates, 5000);
    expect(result.length).toBe(1 as any);
    expect(result[0]!.value).toBe(2 as any);
  });

  it("keeps all recent updates", () => {
    const now = new Date();
    const recent1 = new Date(now.getTime() - 1000).toISOString();
    const recent2 = new Date(now.getTime() - 2000).toISOString();

    const updates = [
      { timestamp: recent1, value: 1 },
      { timestamp: recent2, value: 2 },
    ];

    const result = filterStaleUpdates(updates, 5000);
    expect(result.length).toBe(2 as any);
  });

  it("handles empty array", () => {
    const result = filterStaleUpdates([]);
    expect(result).toEqual([]);
  });
});
