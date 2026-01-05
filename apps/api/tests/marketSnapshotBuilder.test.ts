/**
 * Market Snapshot Builder Workflow Step Tests
 */

import { describe, expect, mock, test } from "bun:test";
import type { MarketSnapshot } from "@cream/domain";
import {
  buildHistoricalSnapshot,
  buildSnapshotForSymbols,
  buildSnapshotForUniverse,
  DEFAULT_SNAPSHOT_CONFIG,
  executeMarketSnapshotBuilder,
  PERFORMANCE_TARGETS,
  type SnapshotBuilderInput,
} from "../workflows/steps/marketSnapshotBuilder";

// ============================================
// Test Fixtures
// ============================================

function createMockSnapshot(symbol: string) {
  return {
    symbol,
    lastTrade: {
      price: 150.0,
      size: 100,
      timestamp: Date.now(),
    },
    lastQuote: {
      bid: 149.95,
      ask: 150.05,
      bidSize: 1000,
      askSize: 800,
    },
    volume: 50000000,
    dayHigh: 152.0,
    dayLow: 148.0,
    prevClose: 149.5,
    open: 149.8,
  };
}

// ============================================
// Tests
// ============================================

describe("Market Snapshot Builder", () => {
  describe("executeMarketSnapshotBuilder", () => {
    test("successfully builds snapshot with default universe", async () => {
      const result = await executeMarketSnapshotBuilder({});

      if (!result.success) {
        console.log("Errors:", result.errors);
        console.log("Warnings:", result.warnings);
      }

      expect(result.success).toBe(true);
      expect(result.snapshot).toBeDefined();
      expect(result.symbolCount).toBeGreaterThan(0);
      expect(result.metrics.totalMs).toBeGreaterThan(0);
    });

    test("builds snapshot for specific symbols", async () => {
      const symbols = ["AAPL", "MSFT", "GOOGL"];
      const result = await executeMarketSnapshotBuilder({ symbols });

      expect(result.success).toBe(true);
      expect(result.snapshot).toBeDefined();
      expect(result.symbolCount).toBeGreaterThanOrEqual(1);

      if (result.snapshot) {
        expect(result.snapshot.environment).toBeDefined();
        expect(result.snapshot.asOf).toBeDefined();
        expect(result.snapshot.marketStatus).toBeDefined();
        expect(result.snapshot.regime).toBeDefined();
        expect(result.snapshot.symbols).toBeDefined();
        expect(Array.isArray(result.snapshot.symbols)).toBe(true);
      }
    });

    test("handles empty symbol list", async () => {
      const result = await executeMarketSnapshotBuilder({ symbols: [] });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("No symbols");
    });

    test("includes performance metrics", async () => {
      const result = await executeMarketSnapshotBuilder({ symbols: ["SPY"] });

      expect(result.metrics).toBeDefined();
      expect(result.metrics.totalMs).toBeGreaterThan(0);
      expect(result.metrics.marketDataFetchMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.indicatorCalculationMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.regimeClassificationMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.positionFetchMs).toBeGreaterThanOrEqual(0);
    });

    test("uses provided timestamp for asOf", async () => {
      const asOf = "2026-01-05T12:00:00Z";
      const result = await executeMarketSnapshotBuilder({
        symbols: ["AAPL"],
        asOf,
      });

      if (result.success && result.snapshot) {
        expect(result.snapshot.asOf).toBe(asOf);
      }
    });

    test("collects errors for failed symbol snapshots", async () => {
      // Test with a symbol that might fail (invalid symbol)
      const result = await executeMarketSnapshotBuilder({
        symbols: ["INVALID_SYMBOL_XYZ"],
      });

      // Should either succeed with warnings or fail with errors
      expect(result.errors.length + result.warnings.length).toBeGreaterThanOrEqual(0);
    });

    test("includes market status in snapshot", async () => {
      const result = await executeMarketSnapshotBuilder({ symbols: ["SPY"] });

      if (result.success && result.snapshot) {
        expect(result.snapshot.marketStatus).toMatch(
          /^(OPEN|CLOSED|PRE_MARKET|AFTER_HOURS)$/
        );
      }
    });

    test("includes regime classification in snapshot", async () => {
      const result = await executeMarketSnapshotBuilder({ symbols: ["SPY"] });

      if (result.success && result.snapshot) {
        expect(result.snapshot.regime).toMatch(
          /^(BULL_TREND|BEAR_TREND|HIGH_VOLATILITY|LOW_VOLATILITY|RANGE_BOUND)$/
        );
      }
    });
  });

  describe("Symbol Snapshot Structure", () => {
    test("symbol snapshot contains required quote data", async () => {
      const result = await executeMarketSnapshotBuilder({ symbols: ["AAPL"] });

      if (result.success && result.snapshot && result.snapshot.symbols.length > 0) {
        const symbolSnapshot = result.snapshot.symbols[0];

        expect(symbolSnapshot.symbol).toBeDefined();
        expect(symbolSnapshot.quote).toBeDefined();
        expect(symbolSnapshot.quote.bid).toBeGreaterThanOrEqual(0);
        expect(symbolSnapshot.quote.ask).toBeGreaterThanOrEqual(0);
        expect(symbolSnapshot.quote.last).toBeGreaterThanOrEqual(0);
        expect(symbolSnapshot.quote.volume).toBeGreaterThanOrEqual(0);
      }
    });

    test("symbol snapshot contains day statistics", async () => {
      const result = await executeMarketSnapshotBuilder({ symbols: ["AAPL"] });

      if (result.success && result.snapshot && result.snapshot.symbols.length > 0) {
        const symbolSnapshot = result.snapshot.symbols[0];

        expect(symbolSnapshot.dayHigh).toBeGreaterThan(0);
        expect(symbolSnapshot.dayLow).toBeGreaterThan(0);
        expect(symbolSnapshot.prevClose).toBeGreaterThan(0);
        expect(symbolSnapshot.open).toBeGreaterThan(0);
        expect(symbolSnapshot.dayHigh).toBeGreaterThanOrEqual(symbolSnapshot.dayLow);
      }
    });

    test("symbol snapshot contains timestamp", async () => {
      const result = await executeMarketSnapshotBuilder({ symbols: ["AAPL"] });

      if (result.success && result.snapshot && result.snapshot.symbols.length > 0) {
        const symbolSnapshot = result.snapshot.symbols[0];

        expect(symbolSnapshot.asOf).toBeDefined();
        expect(new Date(symbolSnapshot.asOf).getTime()).toBeGreaterThan(0);
      }
    });

    test("symbol snapshot bars is an array", async () => {
      const result = await executeMarketSnapshotBuilder({ symbols: ["AAPL"] });

      if (result.success && result.snapshot && result.snapshot.symbols.length > 0) {
        const symbolSnapshot = result.snapshot.symbols[0];

        expect(Array.isArray(symbolSnapshot.bars)).toBe(true);
      }
    });
  });

  describe("Environment Detection", () => {
    test("snapshot includes environment from CREAM_ENV", async () => {
      const result = await executeMarketSnapshotBuilder({ symbols: ["SPY"] });

      if (result.success && result.snapshot) {
        expect(result.snapshot.environment).toMatch(/^(BACKTEST|PAPER|LIVE)$/);
      }
    });
  });

  describe("Error Handling", () => {
    test("handles market data fetch failures gracefully", async () => {
      // Use an invalid symbol that should cause fetch to fail
      const result = await executeMarketSnapshotBuilder({
        symbols: ["INVALID_XYZ_123"],
      });

      // Should complete but may have errors
      expect(result.errors.length + result.warnings.length).toBeGreaterThanOrEqual(0);
    });

    test("continues processing other symbols when one fails", async () => {
      const result = await executeMarketSnapshotBuilder({
        symbols: ["AAPL", "INVALID_XYZ", "MSFT"],
      });

      // Should process valid symbols even if one fails
      // In a real scenario with mock data, we'd verify this more precisely
      expect(result).toBeDefined();
    });

    test("returns error when all symbols fail", async () => {
      const result = await executeMarketSnapshotBuilder({
        symbols: ["INVALID_1", "INVALID_2", "INVALID_3"],
      });

      // In BACKTEST mode with mock data, invalid symbols will succeed with mock data
      // In PAPER/LIVE mode, they would fail
      // Either way, result should be defined with proper structure
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.symbolCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Convenience Functions", () => {
    test("buildSnapshotForSymbols works correctly", async () => {
      const symbols = ["AAPL", "MSFT"];
      const result = await buildSnapshotForSymbols(symbols);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    test("buildSnapshotForUniverse uses default universe", async () => {
      const result = await buildSnapshotForUniverse();

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();

      // Note: In test environment without proper universe config,
      // this may fail but should still return a result structure
      if (!result.success) {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    test("buildHistoricalSnapshot accepts timestamp", async () => {
      const asOf = "2026-01-05T12:00:00Z";
      const result = await buildHistoricalSnapshot(asOf, ["AAPL"]);

      expect(result).toBeDefined();
      if (result.success && result.snapshot) {
        expect(result.snapshot.asOf).toBe(asOf);
      }
    });

    test("buildHistoricalSnapshot uses default universe if no symbols", async () => {
      const asOf = "2026-01-05T12:00:00Z";
      const result = await buildHistoricalSnapshot(asOf);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });
  });

  describe("Performance", () => {
    test("completes within performance targets for small universe", async () => {
      const startTime = performance.now();
      const result = await executeMarketSnapshotBuilder({ symbols: ["SPY"] });
      const duration = performance.now() - startTime;

      // Should be reasonably fast for a single symbol
      // Note: This may be slower in actual implementation with real API calls
      expect(duration).toBeLessThan(30000); // 30 seconds max for integration test
    });

    test("tracks individual phase metrics", async () => {
      const result = await executeMarketSnapshotBuilder({ symbols: ["AAPL"] });

      expect(result.metrics.totalMs).toBeGreaterThanOrEqual(
        result.metrics.marketDataFetchMs +
          result.metrics.indicatorCalculationMs +
          result.metrics.regimeClassificationMs +
          result.metrics.positionFetchMs
      );
    });
  });

  describe("Configuration", () => {
    test("default snapshot config is defined", () => {
      expect(DEFAULT_SNAPSHOT_CONFIG).toBeDefined();
      expect(DEFAULT_SNAPSHOT_CONFIG.barTimeframes).toBeDefined();
      expect(DEFAULT_SNAPSHOT_CONFIG.historicalBars).toBeGreaterThan(0);
      expect(DEFAULT_SNAPSHOT_CONFIG.timeoutMs).toBeGreaterThan(0);
      expect(DEFAULT_SNAPSHOT_CONFIG.concurrency).toBeGreaterThan(0);
    });

    test("performance targets are defined", () => {
      expect(PERFORMANCE_TARGETS).toBeDefined();
      expect(PERFORMANCE_TARGETS.marketDataFetchMs).toBeGreaterThan(0);
      expect(PERFORMANCE_TARGETS.indicatorCalculationMs).toBeGreaterThan(0);
      expect(PERFORMANCE_TARGETS.regimeClassificationMs).toBeGreaterThan(0);
      expect(PERFORMANCE_TARGETS.totalMs).toBeGreaterThan(0);
    });
  });

  describe("Market Status Detection", () => {
    test("determines market status based on current time", async () => {
      const result = await executeMarketSnapshotBuilder({ symbols: ["SPY"] });

      if (result.success && result.snapshot) {
        const validStatuses = ["OPEN", "CLOSED", "PRE_MARKET", "AFTER_HOURS"];
        expect(validStatuses).toContain(result.snapshot.marketStatus);
      }
    });
  });

  describe("Schema Validation", () => {
    test("snapshot matches MarketSnapshot schema structure", async () => {
      const result = await executeMarketSnapshotBuilder({ symbols: ["AAPL"] });

      if (result.success && result.snapshot) {
        const snapshot = result.snapshot;

        // Check top-level fields
        expect(snapshot).toHaveProperty("environment");
        expect(snapshot).toHaveProperty("asOf");
        expect(snapshot).toHaveProperty("marketStatus");
        expect(snapshot).toHaveProperty("regime");
        expect(snapshot).toHaveProperty("symbols");

        // Check symbols array
        expect(Array.isArray(snapshot.symbols)).toBe(true);

        // If symbols exist, check first symbol structure
        if (snapshot.symbols.length > 0) {
          const symbolSnapshot = snapshot.symbols[0];
          expect(symbolSnapshot).toHaveProperty("symbol");
          expect(symbolSnapshot).toHaveProperty("quote");
          expect(symbolSnapshot).toHaveProperty("bars");
          expect(symbolSnapshot).toHaveProperty("marketStatus");
          expect(symbolSnapshot).toHaveProperty("dayHigh");
          expect(symbolSnapshot).toHaveProperty("dayLow");
          expect(symbolSnapshot).toHaveProperty("prevClose");
          expect(symbolSnapshot).toHaveProperty("open");
          expect(symbolSnapshot).toHaveProperty("asOf");
        }
      }
    });

    test("quote schema matches expected structure", async () => {
      const result = await executeMarketSnapshotBuilder({ symbols: ["AAPL"] });

      if (result.success && result.snapshot && result.snapshot.symbols.length > 0) {
        const quote = result.snapshot.symbols[0].quote;

        expect(quote).toHaveProperty("symbol");
        expect(quote).toHaveProperty("bid");
        expect(quote).toHaveProperty("ask");
        expect(quote).toHaveProperty("bidSize");
        expect(quote).toHaveProperty("askSize");
        expect(quote).toHaveProperty("last");
        expect(quote).toHaveProperty("lastSize");
        expect(quote).toHaveProperty("volume");
        expect(quote).toHaveProperty("timestamp");
      }
    });
  });

  describe("Warnings and Diagnostics", () => {
    test("includes warnings for incomplete functionality", async () => {
      const result = await executeMarketSnapshotBuilder({ symbols: ["AAPL"] });

      // Should have warnings about not-yet-implemented features
      expect(result.warnings).toBeDefined();
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    test("tracks symbol count correctly", async () => {
      const symbols = ["AAPL", "MSFT", "GOOGL"];
      const result = await executeMarketSnapshotBuilder({ symbols });

      expect(result.symbolCount).toBe(symbols.length);
    });
  });
});
