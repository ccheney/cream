/**
 * Backtest Data Preparation Service Tests
 *
 * Unit tests for OHLCV data fetching and signal generation.
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { tmpdir } from "node:os";
import type { Backtest } from "@cream/storage";

// Mock dependencies before importing the module
const mockGetAggregates = mock(() =>
  Promise.resolve({
    results: [
      { t: 1704067200000, o: 100.0, h: 101.0, l: 99.0, c: 100.5, v: 1000 },
      { t: 1704153600000, o: 100.5, h: 102.0, l: 100.0, c: 101.0, v: 1100 },
      { t: 1704240000000, o: 101.0, h: 103.0, l: 100.5, c: 102.5, v: 1200 },
    ],
    resultsCount: 3,
  })
);

const mockPolygonClient = {
  getAggregates: mockGetAggregates,
};

// Mock the marketdata module
mock.module("@cream/marketdata", () => ({
  createPolygonClientFromEnv: () => mockPolygonClient,
}));

// Import after mocking
import {
  cleanupBacktestData,
  type PreparedBacktestData,
  prepareAllBacktestData,
  prepareBacktestData,
  prepareSignals,
} from "./backtest-data";

// ============================================
// Test Data
// ============================================

function createTestBacktest(overrides?: Partial<Backtest>): Backtest {
  return {
    id: "test-backtest-123",
    name: "Test Backtest",
    status: "pending",
    startDate: "2024-01-01",
    endDate: "2024-01-31",
    initialCapital: 100000,
    slippageBps: 5,
    universe: ["AAPL"],
    config: { timeframe: "1Hour" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Backtest;
}

// ============================================
// Test Suite
// ============================================

describe("Backtest Data Service", () => {
  let spawnSpy: ReturnType<typeof spyOn>;
  let unlinkSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mockGetAggregates.mockClear();

    // Mock Bun.spawn for Parquet writing
    spawnSpy = spyOn(Bun, "spawn").mockImplementation(
      () =>
        ({
          stdin: {
            write: mock(() => {}),
            end: mock(() => {}),
          },
          stdout: new ReadableStream(),
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
          pid: 12345,
        }) as any
    );
  });

  afterEach(() => {
    spawnSpy?.mockRestore();
    unlinkSpy?.mockRestore();
    mock.restore();
  });

  describe("prepareBacktestData", () => {
    it("should fetch OHLCV data via Polygon client", async () => {
      const backtest = createTestBacktest();

      await prepareBacktestData(backtest);

      expect(mockGetAggregates).toHaveBeenCalledWith(
        "AAPL",
        1,
        "hour",
        "2024-01-01",
        "2024-01-31",
        expect.objectContaining({
          adjusted: true,
          sort: "asc",
          limit: 50000,
        })
      );
    });

    it("should write Parquet file to temp directory", async () => {
      const backtest = createTestBacktest();

      const dataPath = await prepareBacktestData(backtest);

      expect(dataPath).toContain(tmpdir());
      expect(dataPath).toContain("backtest-data-");
      expect(dataPath).toEndWith(".parquet");
    });

    it("should return valid file path", async () => {
      const backtest = createTestBacktest();

      const dataPath = await prepareBacktestData(backtest);

      expect(typeof dataPath).toBe("string");
      expect(dataPath.length).toBeGreaterThan(0);
    });

    it("should throw if no symbol in universe", async () => {
      const backtest = createTestBacktest({ universe: [] });

      await expect(prepareBacktestData(backtest)).rejects.toThrow(
        "Backtest must have at least one symbol in universe"
      );
    });

    it("should throw if no market data found", async () => {
      mockGetAggregates.mockResolvedValueOnce({ results: [], resultsCount: 0 });
      const backtest = createTestBacktest();

      await expect(prepareBacktestData(backtest)).rejects.toThrow("No market data found for AAPL");
    });

    it("should use correct timeframe mapping for different timeframes", async () => {
      const backtest = createTestBacktest({ config: { timeframe: "1Day" } });

      await prepareBacktestData(backtest);

      expect(mockGetAggregates).toHaveBeenCalledWith(
        "AAPL",
        1,
        "day",
        expect.any(String),
        expect.any(String),
        expect.any(Object)
      );
    });

    it("should default to 1Hour timeframe if not specified", async () => {
      const backtest = createTestBacktest({ config: {} });

      await prepareBacktestData(backtest);

      expect(mockGetAggregates).toHaveBeenCalledWith(
        "AAPL",
        1,
        "hour",
        expect.any(String),
        expect.any(String),
        expect.any(Object)
      );
    });

    it("should throw if Parquet write fails", async () => {
      spawnSpy.mockRestore();
      spawnSpy = spyOn(Bun, "spawn").mockImplementation(
        () =>
          ({
            stdin: {
              write: mock(() => {}),
              end: mock(() => {}),
            },
            stdout: new ReadableStream(),
            stderr: new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode("Python error"));
                controller.close();
              },
            }),
            exited: Promise.resolve(1),
            pid: 12345,
          }) as any
      );

      const backtest = createTestBacktest();

      await expect(prepareBacktestData(backtest)).rejects.toThrow("Failed to write Parquet file");
    });
  });

  describe("prepareSignals", () => {
    it("should generate signals from OHLCV data", async () => {
      const backtest = createTestBacktest();

      const signalsPath = await prepareSignals(backtest);

      expect(signalsPath).toContain(tmpdir());
      expect(signalsPath).toContain("backtest-signals-");
      expect(signalsPath).toEndWith(".parquet");
    });

    it("should throw if no symbol in universe", async () => {
      const backtest = createTestBacktest({ universe: [] });

      await expect(prepareSignals(backtest)).rejects.toThrow(
        "Backtest must have at least one symbol in universe"
      );
    });

    it("should call Polygon client for data to generate signals", async () => {
      const backtest = createTestBacktest();

      await prepareSignals(backtest);

      expect(mockGetAggregates).toHaveBeenCalled();
    });
  });

  describe("prepareAllBacktestData", () => {
    it("should prepare both OHLCV data and signals", async () => {
      const backtest = createTestBacktest();

      const result = await prepareAllBacktestData(backtest);

      expect(result.dataPath).toContain("backtest-data-");
      expect(result.signalsPath).toContain("backtest-signals-");
    });

    it("should return PreparedBacktestData structure", async () => {
      const backtest = createTestBacktest();

      const result = await prepareAllBacktestData(backtest);

      expect(result).toHaveProperty("dataPath");
      expect(result).toHaveProperty("signalsPath");
      expect(typeof result.dataPath).toBe("string");
      expect(typeof result.signalsPath).toBe("string");
    });

    it("should fetch data twice (for OHLCV and signals)", async () => {
      const backtest = createTestBacktest();

      await prepareAllBacktestData(backtest);

      // Should be called twice - once for data, once for signals
      expect(mockGetAggregates).toHaveBeenCalledTimes(2);
    });
  });

  describe("cleanupBacktestData", () => {
    it("should attempt to delete both files", async () => {
      const mockUnlink = mock(() => Promise.resolve());
      const fsPromises = await import("node:fs/promises");
      unlinkSpy = spyOn(fsPromises, "unlink").mockImplementation(mockUnlink as any);

      const paths: PreparedBacktestData = {
        dataPath: "/tmp/backtest-data-123.parquet",
        signalsPath: "/tmp/backtest-signals-123.parquet",
      };

      await cleanupBacktestData(paths);

      expect(mockUnlink).toHaveBeenCalledTimes(2);
      expect(mockUnlink).toHaveBeenCalledWith("/tmp/backtest-data-123.parquet");
      expect(mockUnlink).toHaveBeenCalledWith("/tmp/backtest-signals-123.parquet");
    });

    it("should not throw if files already deleted", async () => {
      const fsPromises = await import("node:fs/promises");
      unlinkSpy = spyOn(fsPromises, "unlink").mockImplementation(() =>
        Promise.reject(new Error("ENOENT"))
      );

      const paths: PreparedBacktestData = {
        dataPath: "/tmp/nonexistent-data.parquet",
        signalsPath: "/tmp/nonexistent-signals.parquet",
      };

      // Should not throw
      await expect(cleanupBacktestData(paths)).resolves.toBeUndefined();
    });
  });
});

// ============================================
// Signal Generation Logic Tests
// ============================================

// Check if uv is available - needed for writeParquet which spawns Python
function isUvAvailable(): boolean {
  try {
    const proc = Bun.spawnSync(["which", "uv"]);
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

const uvAvailable = isUvAvailable();

describe.skipIf(!uvAvailable)("Signal Generation", () => {
  beforeEach(() => {
    // Provide enough data for SMA calculations (need at least 30 bars)
    const bars = Array.from({ length: 50 }, (_, i) => ({
      t: 1704067200000 + i * 3600000,
      o: 100 + i * 0.1,
      h: 101 + i * 0.1,
      l: 99 + i * 0.1,
      c: 100.5 + i * 0.1 + (i % 10 === 0 ? 2 : 0), // Create some crossover opportunities
      v: 1000 + i * 10,
    }));

    mockGetAggregates.mockResolvedValue({
      results: bars,
      resultsCount: bars.length,
    });
  });

  it("should generate signals without crashing for sufficient data", async () => {
    const backtest = createTestBacktest();

    // Should not throw
    const signalsPath = await prepareSignals(backtest);
    expect(signalsPath).toBeDefined();
  });
});
