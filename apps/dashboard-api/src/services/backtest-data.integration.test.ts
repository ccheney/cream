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

/**
 * Check if Python with required dependencies (pandas, pyarrow) is available.
 * This is more robust than just checking for uv, as CI may have uv
 * but not the Python dependencies installed.
 */
function checkPythonDepsAvailable(): boolean {
	try {
		// First check if uv is available
		const uvCheck = Bun.spawnSync(["which", "uv"]);
		if (uvCheck.exitCode !== 0) {
			return false;
		}

		// Check if pandas and pyarrow are importable
		const proc = Bun.spawnSync(["uv", "run", "python", "-c", "import pandas; import pyarrow"], {
			cwd: `${import.meta.dir}/../../../../packages/research`,
		});
		return proc.exitCode === 0;
	} catch {
		return false;
	}
}

const PYTHON_DEPS_AVAILABLE = checkPythonDepsAvailable();

// ============================================
// Mock Setup
// ============================================

// Generate enough data for SMA calculations (need at least 30 bars for SMA crossover)
const generateMockBars = (count: number) =>
	Array.from({ length: count }, (_, i) => ({
		symbol: "AAPL",
		timestamp: new Date(1704067200000 + i * 3600000).toISOString(),
		open: 100 + i * 0.1,
		high: 101 + i * 0.1,
		low: 99 + i * 0.1,
		close: 100.5 + i * 0.1 + (i % 10 === 0 ? 2 : 0),
		volume: 1000 + i * 10,
	}));

const mockGetBars = mock(() => Promise.resolve(generateMockBars(50)));

mock.module("@cream/marketdata", () => ({
	createAlpacaClientFromEnv: () => ({ getBars: mockGetBars }),
	isAlpacaConfigured: () => true,
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

describe.skipIf(!PYTHON_DEPS_AVAILABLE)("Signal Generation Integration", () => {
	beforeEach(() => {
		mockGetBars.mockClear();
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
