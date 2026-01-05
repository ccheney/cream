/**
 * Clock Synchronization and Timestamp Validation Tests
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
  DEFAULT_CLOCK_THRESHOLDS,
  checkClockSkew,
  validateTimestamp,
  validateTimestampConsistency,
  alignToHourlyCandle,
  alignToDailyCandle,
  isHourlyAligned,
  validateCandleSequence,
  selectDatabentoTimestamp,
  calculateDatabentoLatency,
  periodicClockCheck,
  getClockMonitorState,
  resetClockMonitorState,
  type DatabentoTimestamps,
} from "./clock";

// ============================================
// Configuration Tests
// ============================================

describe("Clock Thresholds", () => {
  it("has reasonable default thresholds", () => {
    expect(DEFAULT_CLOCK_THRESHOLDS.warnThresholdMs).toBe(100);
    expect(DEFAULT_CLOCK_THRESHOLDS.errorThresholdMs).toBe(1000);
    expect(DEFAULT_CLOCK_THRESHOLDS.componentSkewWarnMs).toBe(10);
  });
});

// ============================================
// Timestamp Validation Tests
// ============================================

describe("validateTimestamp", () => {
  it("accepts valid current timestamp", () => {
    const now = new Date().toISOString();
    const result = validateTimestamp(now);

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("accepts timestamp from 1 hour ago", () => {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result = validateTimestamp(hourAgo);

    expect(result.valid).toBe(true);
  });

  it("rejects future timestamp by default", () => {
    const future = new Date(Date.now() + 60 * 1000).toISOString(); // 1 min ahead
    const result = validateTimestamp(future);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("in the future");
  });

  it("allows future timestamp within tolerance", () => {
    const nearFuture = new Date(Date.now() + 3000).toISOString(); // 3s ahead
    const result = validateTimestamp(nearFuture, { futureTolerance: 5000 });

    expect(result.valid).toBe(true);
  });

  it("allows future timestamp when allowFuture is true", () => {
    const future = new Date(Date.now() + 60 * 1000).toISOString();
    const result = validateTimestamp(future, { allowFuture: true });

    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain("in the future");
  });

  it("rejects stale timestamp", () => {
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(); // 40 days ago
    const result = validateTimestamp(oldDate, { maxAgeMs: 30 * 24 * 60 * 60 * 1000 });

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("days old");
  });

  it("rejects invalid timestamp format", () => {
    const result = validateTimestamp("not-a-timestamp");

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Invalid timestamp format");
  });

  it("rejects pre-epoch timestamp", () => {
    const result = validateTimestamp("1960-01-01T00:00:00.000Z");

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("before Unix epoch");
  });
});

// ============================================
// Timestamp Consistency Tests
// ============================================

describe("validateTimestampConsistency", () => {
  it("accepts identical timestamps", () => {
    const ts = new Date().toISOString();
    const result = validateTimestampConsistency(ts, ts);

    expect(result.consistent).toBe(true);
    expect(result.diffMs).toBe(0);
  });

  it("accepts timestamps within threshold", () => {
    const ts1 = new Date().toISOString();
    const ts2 = new Date(Date.now() + 5).toISOString(); // 5ms later

    const result = validateTimestampConsistency(ts1, ts2, 10);

    expect(result.consistent).toBe(true);
    expect(result.diffMs).toBeLessThanOrEqual(10);
  });

  it("rejects timestamps exceeding threshold", () => {
    const ts1 = new Date().toISOString();
    const ts2 = new Date(Date.now() + 100).toISOString(); // 100ms later

    const result = validateTimestampConsistency(ts1, ts2, 10);

    expect(result.consistent).toBe(false);
    expect(result.diffMs).toBeGreaterThan(10);
    expect(result.warning).toContain("exceeds threshold");
  });

  it("handles invalid timestamps", () => {
    const result = validateTimestampConsistency("invalid", new Date().toISOString());

    expect(result.consistent).toBe(false);
    expect(Number.isNaN(result.diffMs)).toBe(true);
  });
});

// ============================================
// Candle Alignment Tests
// ============================================

describe("alignToHourlyCandle", () => {
  it("aligns timestamp to start of hour", () => {
    const result = alignToHourlyCandle("2026-01-04T15:35:42.123Z");

    expect(result).toBe("2026-01-04T15:00:00.000Z");
  });

  it("preserves timestamp already at hour boundary", () => {
    const result = alignToHourlyCandle("2026-01-04T15:00:00.000Z");

    expect(result).toBe("2026-01-04T15:00:00.000Z");
  });

  it("handles end of day", () => {
    const result = alignToHourlyCandle("2026-01-04T23:59:59.999Z");

    expect(result).toBe("2026-01-04T23:00:00.000Z");
  });
});

describe("alignToDailyCandle", () => {
  it("aligns timestamp to start of UTC day", () => {
    const result = alignToDailyCandle("2026-01-04T15:35:42.123Z");

    expect(result).toBe("2026-01-04T00:00:00.000Z");
  });

  it("preserves timestamp already at day boundary", () => {
    const result = alignToDailyCandle("2026-01-04T00:00:00.000Z");

    expect(result).toBe("2026-01-04T00:00:00.000Z");
  });
});

describe("isHourlyAligned", () => {
  it("returns true for aligned timestamp", () => {
    expect(isHourlyAligned("2026-01-04T15:00:00.000Z")).toBe(true);
  });

  it("returns false for unaligned timestamp", () => {
    expect(isHourlyAligned("2026-01-04T15:30:00.000Z")).toBe(false);
    expect(isHourlyAligned("2026-01-04T15:00:30.000Z")).toBe(false);
    expect(isHourlyAligned("2026-01-04T15:00:00.100Z")).toBe(false);
  });
});

// ============================================
// Candle Sequence Validation Tests
// ============================================

describe("validateCandleSequence", () => {
  it("validates correct hourly sequence", () => {
    const timestamps = [
      "2026-01-04T14:00:00.000Z",
      "2026-01-04T15:00:00.000Z",
      "2026-01-04T16:00:00.000Z",
      "2026-01-04T17:00:00.000Z",
    ];

    const result = validateCandleSequence(timestamps);

    expect(result.valid).toBe(true);
    expect(result.gaps.length).toBe(0);
    expect(result.outOfOrder.length).toBe(0);
  });

  it("detects gaps in sequence", () => {
    const timestamps = [
      "2026-01-04T14:00:00.000Z",
      "2026-01-04T15:00:00.000Z",
      // Missing 16:00 and 17:00
      "2026-01-04T18:00:00.000Z",
    ];

    const result = validateCandleSequence(timestamps);

    expect(result.valid).toBe(false);
    expect(result.gaps.length).toBe(1);
    expect(result.gaps[0].missingHours).toBe(2);
    expect(result.gaps[0].from).toBe("2026-01-04T15:00:00.000Z");
    expect(result.gaps[0].to).toBe("2026-01-04T18:00:00.000Z");
  });

  it("detects out-of-order timestamps", () => {
    const timestamps = [
      "2026-01-04T14:00:00.000Z",
      "2026-01-04T16:00:00.000Z",
      "2026-01-04T15:00:00.000Z", // Out of order
    ];

    const result = validateCandleSequence(timestamps);

    expect(result.valid).toBe(false);
    expect(result.outOfOrder.length).toBe(1);
    expect(result.outOfOrder[0].index).toBe(2);
  });

  it("handles empty sequence", () => {
    const result = validateCandleSequence([]);

    expect(result.valid).toBe(true);
  });

  it("handles single timestamp", () => {
    const result = validateCandleSequence(["2026-01-04T14:00:00.000Z"]);

    expect(result.valid).toBe(true);
  });
});

// ============================================
// Databento Timestamp Tests
// ============================================

describe("selectDatabentoTimestamp", () => {
  const timestamps: DatabentoTimestamps = {
    ts_event: "2026-01-04T15:00:00.000Z",
    ts_recv: "2026-01-04T15:00:00.005Z",
    ts_in_delta: 5000000, // 5ms in nanoseconds
    ts_out: "2026-01-04T15:00:00.010Z",
  };

  it("selects ts_event for analysis", () => {
    expect(selectDatabentoTimestamp(timestamps, "analysis")).toBe(timestamps.ts_event);
  });

  it("selects ts_recv for latency", () => {
    expect(selectDatabentoTimestamp(timestamps, "latency")).toBe(timestamps.ts_recv);
  });

  it("selects ts_out for processing", () => {
    expect(selectDatabentoTimestamp(timestamps, "processing")).toBe(timestamps.ts_out);
  });
});

describe("calculateDatabentoLatency", () => {
  it("calculates latency components", () => {
    const timestamps: DatabentoTimestamps = {
      ts_event: "2026-01-04T15:00:00.000Z",
      ts_recv: "2026-01-04T15:00:00.005Z",
      ts_out: "2026-01-04T15:00:00.010Z",
    };

    const latency = calculateDatabentoLatency(timestamps);

    expect(latency.exchangeToRecvMs).toBe(5);
    expect(latency.recvToProcessMs).toBe(5);
    expect(latency.totalMs).toBe(10);
  });
});

// ============================================
// Clock Monitoring Tests
// ============================================

describe("Clock Monitoring", () => {
  beforeEach(() => {
    resetClockMonitorState();
  });

  it("starts with clean state", () => {
    const state = getClockMonitorState();

    expect(state.lastCheck).toBeNull();
    expect(state.checkCount).toBe(0);
    expect(state.warningCount).toBe(0);
    expect(state.errorCount).toBe(0);
  });

  it("resetClockMonitorState clears state", () => {
    // Manually mutate state first
    periodicClockCheck().catch(() => {}); // Ignore result

    resetClockMonitorState();
    const state = getClockMonitorState();

    expect(state.checkCount).toBe(0);
  });
});

// ============================================
// Clock Skew Check Tests
// ============================================

describe("checkClockSkew", () => {
  // Note: These tests may be skipped in CI without network access

  it("returns result with required fields", async () => {
    // This will either succeed or return a warning about network
    const result = await checkClockSkew();

    expect(result.ok).toBeDefined();
    expect(result.skewMs).toBeDefined();
    expect(result.checkedAt).toBeDefined();
  });

  it("skips check in BACKTEST mode", async () => {
    // Save env
    const savedEnv = process.env.CREAM_ENV;
    process.env.CREAM_ENV = "BACKTEST";

    try {
      const result = await checkClockSkew();

      expect(result.ok).toBe(true);
      expect(result.skewMs).toBe(0);
      expect(result.warning).toContain("BACKTEST");
    } finally {
      // Restore env
      if (savedEnv) {
        process.env.CREAM_ENV = savedEnv;
      } else {
        delete process.env.CREAM_ENV;
      }
    }
  });
});
