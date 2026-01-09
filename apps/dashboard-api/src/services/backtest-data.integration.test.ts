/**
 * Backtest Data Service Integration Tests
 *
 * These tests require `uv` (Python package manager) to be installed.
 * They test actual Parquet file writing via Python subprocess.
 *
 * Run with: bun test backtest-data.integration.test.ts
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Backtest } from "@cream/storage";
import { prepareSignals } from "./backtest-data";

// ============================================
// Environment Check
// ============================================

function checkUvAvailable(): boolean {
  try {
    const proc = Bun.spawnSync(["which", "uv"]);
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

if (!checkUvAvailable()) {
  throw new Error(
    "Integration tests require 'uv' to be installed. " +
      "Install with: curl -LsSf https://astral.sh/uv/install.sh | sh"
  );
}

// ============================================
// Mock Setup
// ============================================

// Generate enough data for SMA calculations (need at least 30 bars for SMA crossover)
const generateMockBars = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    t: 1704067200000 + i * 3600000,
    o: 100 + i * 0.1,
    h: 101 + i * 0.1,
    l: 99 + i * 0.1,
    c: 100.5 + i * 0.1 + (i % 10 === 0 ? 2 : 0),
    v: 1000 + i * 10,
  }));

const mockGetAggregates = mock(() =>
  Promise.resolve({
    results: generateMockBars(50),
    resultsCount: 50,
  })
);

mock.module("@cream/marketdata", () => ({
  createPolygonClientFromEnv: () => ({ getAggregates: mockGetAggregates }),
}));

// ============================================
// Test Helpers
// ============================================

function createTestBacktest(overrides?: Partial<Backtest>): Backtest {
  return {
    id: "test-backtest-integration",
    name: "Integration Test Backtest",
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
// Integration Tests
// ============================================

describe("Signal Generation Integration", () => {
  beforeEach(() => {
    mockGetAggregates.mockClear();
  });

  it("generates signals without crashing for sufficient data", async () => {
    const backtest = createTestBacktest();

    const signalsPath = await prepareSignals(backtest);

    expect(signalsPath).toBeDefined();
    expect(signalsPath).toContain("backtest-signals-");
    expect(signalsPath).toEndWith(".parquet");
  });

  it("writes valid Parquet file to disk", async () => {
    const backtest = createTestBacktest();

    const signalsPath = await prepareSignals(backtest);

    // File should exist
    const file = Bun.file(signalsPath);
    expect(await file.exists()).toBe(true);

    // Cleanup
    const fs = await import("node:fs/promises");
    await fs.unlink(signalsPath);
  });
});
