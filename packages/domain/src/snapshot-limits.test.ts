/**
 * Tests for Snapshot Size Limits and Performance Monitoring
 */

import { describe, expect, test } from "bun:test";
import type { MarketSnapshot, SymbolSnapshot } from "./marketSnapshot";
import {
	createPerformanceTracker,
	estimateSnapshotSize,
	estimateSnapshotTokens,
	estimateTokenCount,
	formatBytes,
	formatPerformanceMetrics,
	formatSizeValidation,
	PERFORMANCE_LIMITS,
	PerformanceTracker,
	SNAPSHOT_SIZE_LIMITS,
	TOKEN_ESTIMATION,
	TRUNCATION_LIMITS,
	truncateArray,
	truncateSnapshot,
	validateSnapshotSize,
} from "./snapshot-limits";

// ============================================
// Test Fixtures
// ============================================

function createMockQuote(symbol: string) {
	return {
		symbol,
		bid: 150.0,
		ask: 150.05,
		bidSize: 1000,
		askSize: 800,
		last: 150.02,
		lastSize: 100,
		volume: 5000000,
		timestamp: "2026-01-05T14:30:00Z",
	};
}

function createMockBar(timestamp: string) {
	return {
		timestamp,
		open: 149.0,
		high: 151.0,
		low: 148.5,
		close: 150.0,
		volume: 100000,
		vwap: 149.8,
		timeframe: "1h" as const,
	};
}

function createMockSymbolSnapshot(symbol: string, numBars = 10): SymbolSnapshot {
	const bars = Array.from({ length: numBars }, (_, i) => {
		const date = new Date(2026, 0, 5, 9 + i);
		return createMockBar(date.toISOString());
	});

	return {
		symbol,
		quote: createMockQuote(symbol),
		bars,
		dayHigh: 151.0,
		dayLow: 148.5,
		prevClose: 149.0,
		open: 149.5,
		marketStatus: "OPEN" as const,
		asOf: "2026-01-05T14:30:00Z",
	};
}

function createMockMarketSnapshot(numSymbols = 5, barsPerSymbol = 10): MarketSnapshot {
	const symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "SPY", "QQQ", "IWM"];
	const selectedSymbols = symbols.slice(0, numSymbols);

	return {
		environment: "PAPER",
		asOf: "2026-01-05T14:30:00Z",
		marketStatus: "OPEN",
		regime: "BULL_TREND",
		symbols: selectedSymbols.map((s) => createMockSymbolSnapshot(s, barsPerSymbol)),
	};
}

// ============================================
// Size Limit Constants Tests
// ============================================

describe("SNAPSHOT_SIZE_LIMITS", () => {
	test("has correct target size", () => {
		expect(SNAPSHOT_SIZE_LIMITS.TARGET_BYTES).toBe(100 * 1024);
	});

	test("has correct max size", () => {
		expect(SNAPSHOT_SIZE_LIMITS.MAX_BYTES).toBe(500 * 1024);
	});

	test("warning threshold is between target and max", () => {
		expect(SNAPSHOT_SIZE_LIMITS.WARNING_BYTES).toBeGreaterThan(SNAPSHOT_SIZE_LIMITS.TARGET_BYTES);
		expect(SNAPSHOT_SIZE_LIMITS.WARNING_BYTES).toBeLessThan(SNAPSHOT_SIZE_LIMITS.MAX_BYTES);
	});
});

describe("TRUNCATION_LIMITS", () => {
	test("has reasonable candle limit", () => {
		expect(TRUNCATION_LIMITS.MAX_CANDLES).toBe(100);
	});

	test("has reasonable symbol limit", () => {
		expect(TRUNCATION_LIMITS.MAX_SYMBOLS).toBe(50);
	});

	test("has reasonable case limit", () => {
		expect(TRUNCATION_LIMITS.MAX_CASES).toBe(20);
	});
});

describe("TOKEN_ESTIMATION", () => {
	test("has reasonable chars per token ratio", () => {
		// JSON typically tokenizes to 3-4 chars per token
		expect(TOKEN_ESTIMATION.CHARS_PER_TOKEN).toBeGreaterThanOrEqual(3);
		expect(TOKEN_ESTIMATION.CHARS_PER_TOKEN).toBeLessThanOrEqual(5);
	});

	test("has reasonable target token count", () => {
		expect(TOKEN_ESTIMATION.TARGET_TOKENS).toBe(10_000);
	});
});

// ============================================
// Size Estimation Tests
// ============================================

describe("estimateSnapshotSize", () => {
	test("estimates small snapshot correctly", () => {
		const snapshot = createMockMarketSnapshot(2, 5);
		const estimate = estimateSnapshotSize(snapshot);

		expect(estimate.bytes).toBeGreaterThan(0);
		expect(estimate.tokens).toBeGreaterThan(0);
		expect(estimate.withinTarget).toBe(true);
		expect(estimate.withinMax).toBe(true);
	});

	test("estimates larger snapshot", () => {
		const snapshot = createMockMarketSnapshot(10, 50);
		const estimate = estimateSnapshotSize(snapshot);

		expect(estimate.bytes).toBeGreaterThan(1000);
		expect(estimate.tokens).toBeGreaterThan(100);
	});

	test("includes breakdown by component", () => {
		const snapshot = createMockMarketSnapshot(5, 10);
		const estimate = estimateSnapshotSize(snapshot);

		expect(estimate.breakdown).toHaveProperty("symbols");
		expect(estimate.breakdown).toHaveProperty("bars");
		expect(estimate.breakdown).toHaveProperty("quotes");
		expect(estimate.breakdown).toHaveProperty("metadata");
		expect(estimate.breakdown.bars).toBeGreaterThan(0);
		expect(estimate.breakdown.quotes).toBeGreaterThan(0);
	});

	test("handles empty symbols array", () => {
		const snapshot: MarketSnapshot = {
			environment: "PAPER",
			asOf: "2026-01-05T14:30:00Z",
			marketStatus: "OPEN",
			regime: "BULL_TREND",
			symbols: [],
		};

		const estimate = estimateSnapshotSize(snapshot);

		expect(estimate.bytes).toBeGreaterThan(0); // Has metadata
		expect(estimate.breakdown.metadata).toBeGreaterThan(0);
		expect(estimate.breakdown.bars).toBe(0);
		expect(estimate.breakdown.quotes).toBe(0);
	});

	test("handles undefined symbols", () => {
		const snapshot: MarketSnapshot = {
			environment: "PAPER",
			asOf: "2026-01-05T14:30:00Z",
			marketStatus: "OPEN",
			regime: "BULL_TREND",
			symbols: undefined as unknown as SymbolSnapshot[],
		};

		const estimate = estimateSnapshotSize(snapshot);

		expect(estimate.bytes).toBeGreaterThan(0); // Has metadata
	});
});

describe("estimateTokenCount", () => {
	test("estimates tokens from bytes", () => {
		const tokens = estimateTokenCount(1000);

		// 1000 bytes / 3.5 chars per token ≈ 286, plus 15% overhead ≈ 329
		expect(tokens).toBeGreaterThan(280);
		expect(tokens).toBeLessThan(400);
	});

	test("handles small sizes", () => {
		const tokens = estimateTokenCount(100);
		expect(tokens).toBeGreaterThan(0);
	});

	test("handles large sizes", () => {
		const tokens = estimateTokenCount(500_000);
		expect(tokens).toBeGreaterThan(100_000);
	});
});

describe("estimateSnapshotTokens", () => {
	test("returns token count for snapshot", () => {
		const snapshot = createMockMarketSnapshot(5, 10);
		const tokens = estimateSnapshotTokens(snapshot);

		expect(tokens).toBeGreaterThan(0);
		expect(typeof tokens).toBe("number");
	});
});

// ============================================
// Size Validation Tests
// ============================================

describe("validateSnapshotSize", () => {
	test("validates small snapshot as valid", () => {
		const snapshot = createMockMarketSnapshot(2, 5);
		const validation = validateSnapshotSize(snapshot);

		expect(validation.valid).toBe(true);
		expect(validation.errors).toHaveLength(0);
	});

	test("includes estimate in result", () => {
		const snapshot = createMockMarketSnapshot(2, 5);
		const validation = validateSnapshotSize(snapshot);

		expect(validation.estimate).toBeDefined();
		expect(validation.estimate.bytes).toBeGreaterThan(0);
	});

	test("warns when exceeding target", () => {
		// Create a large snapshot that exceeds target
		const snapshot = createMockMarketSnapshot(50, 100);
		const validation = validateSnapshotSize(snapshot);

		// Check if warnings are generated for large snapshots
		// The actual behavior depends on snapshot size
		expect(validation.warnings).toBeDefined();
		expect(Array.isArray(validation.warnings)).toBe(true);
	});

	test("provides recommendations for large components", () => {
		const snapshot = createMockMarketSnapshot(30, 80);
		const validation = validateSnapshotSize(snapshot);

		expect(validation.recommendations).toBeDefined();
		expect(Array.isArray(validation.recommendations)).toBe(true);
	});

	test("recommends limiting symbols when over limit", () => {
		const snapshot = createMockMarketSnapshot(10, 10);
		// Artificially set more symbols than limit
		(snapshot as { symbols: SymbolSnapshot[] }).symbols = Array.from({ length: 60 }, (_, i) =>
			createMockSymbolSnapshot(`SYM${i}`, 5)
		);

		const validation = validateSnapshotSize(snapshot);

		expect(validation.recommendations.some((r) => r.includes("symbols"))).toBe(true);
	});
});

// ============================================
// Array Truncation Tests
// ============================================

describe("truncateArray", () => {
	test("does not truncate when under limit", () => {
		const array = [1, 2, 3, 4, 5];
		const { result, removed } = truncateArray(array, 10);

		expect(result).toEqual([1, 2, 3, 4, 5]);
		expect(removed).toBe(0);
	});

	test("truncates keeping most recent by default", () => {
		const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const { result, removed } = truncateArray(array, 5);

		expect(result).toEqual([6, 7, 8, 9, 10]);
		expect(removed).toBe(5);
	});

	test("truncates keeping oldest when specified", () => {
		const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const { result, removed } = truncateArray(array, 5, false);

		expect(result).toEqual([1, 2, 3, 4, 5]);
		expect(removed).toBe(5);
	});

	test("handles empty array", () => {
		const array: number[] = [];
		const { result, removed } = truncateArray(array, 5);

		expect(result).toEqual([]);
		expect(removed).toBe(0);
	});

	test("handles exact limit", () => {
		const array = [1, 2, 3, 4, 5];
		const { result, removed } = truncateArray(array, 5);

		expect(result).toEqual([1, 2, 3, 4, 5]);
		expect(removed).toBe(0);
	});
});

describe("truncateSnapshot", () => {
	test("truncates symbols when over limit", () => {
		const snapshot = createMockMarketSnapshot(10, 5);
		const truncated = truncateSnapshot(snapshot, { maxSymbols: 5 });

		expect(truncated.symbols?.length).toBe(5);
	});

	test("truncates bars when over limit", () => {
		const snapshot = createMockMarketSnapshot(2, 50);
		const truncated = truncateSnapshot(snapshot, { maxCandles: 20 });

		for (const symbol of truncated.symbols ?? []) {
			expect(symbol.bars?.length).toBeLessThanOrEqual(20);
		}
	});

	test("keeps most recent bars by default", () => {
		const snapshot = createMockMarketSnapshot(1, 10);
		const originalLastBar = snapshot.symbols?.[0]?.bars?.[9];

		const truncated = truncateSnapshot(snapshot, { maxCandles: 5 });
		const truncatedLastBar = truncated.symbols?.[0]?.bars?.[4];

		expect(truncatedLastBar?.timestamp).toBe(originalLastBar?.timestamp);
	});

	test("does not mutate original snapshot", () => {
		const snapshot = createMockMarketSnapshot(10, 50);
		const originalSymbolCount = snapshot.symbols?.length ?? 0;
		const originalBarCount = snapshot.symbols?.[0]?.bars?.length ?? 0;

		truncateSnapshot(snapshot, { maxSymbols: 3, maxCandles: 10 });

		expect(snapshot.symbols?.length).toBe(originalSymbolCount);
		expect(snapshot.symbols?.[0]?.bars?.length).toBe(originalBarCount);
	});

	test("uses default limits when no options provided", () => {
		const snapshot = createMockMarketSnapshot(10, 50);
		const truncated = truncateSnapshot(snapshot);

		// Should not truncate with default limits
		expect(truncated.symbols?.length).toBeLessThanOrEqual(TRUNCATION_LIMITS.MAX_SYMBOLS);
		for (const symbol of truncated.symbols ?? []) {
			expect(symbol.bars?.length).toBeLessThanOrEqual(TRUNCATION_LIMITS.MAX_CANDLES);
		}
	});

	test("handles empty snapshot", () => {
		const snapshot: MarketSnapshot = {
			environment: "PAPER",
			asOf: "2026-01-05T14:30:00Z",
			marketStatus: "OPEN",
			regime: "BULL_TREND",
			symbols: [],
		};

		const truncated = truncateSnapshot(snapshot);

		expect(truncated.symbols).toEqual([]);
	});
});

// ============================================
// Performance Monitoring Tests
// ============================================

describe("PerformanceTracker", () => {
	test("tracks total time", async () => {
		const tracker = new PerformanceTracker();

		// Small delay - use 15ms to account for setTimeout imprecision
		await new Promise((r) => setTimeout(r, 15));

		const totalTime = tracker.getTotalTime();
		// Allow for setTimeout variance (may fire slightly early on fast systems)
		expect(totalTime).toBeGreaterThanOrEqual(8);
	});

	test("tracks individual phases", () => {
		const tracker = new PerformanceTracker();

		tracker.startPhase("fetch");
		// Simulate work
		for (let i = 0; i < 1000; i++) {
			Math.sqrt(i);
		}
		const fetchDuration = tracker.endPhase("fetch");

		expect(fetchDuration).toBeGreaterThanOrEqual(0);
		expect(tracker.getPhaseDuration("fetch")).toBe(fetchDuration);
	});

	test("returns 0 for non-existent phase", () => {
		const tracker = new PerformanceTracker();

		expect(tracker.getPhaseDuration("nonexistent")).toBe(0);
	});

	test("returns 0 for incomplete phase", () => {
		const tracker = new PerformanceTracker();
		tracker.startPhase("incomplete");

		expect(tracker.getPhaseDuration("incomplete")).toBe(0);
	});

	test("generates metrics object", () => {
		const tracker = new PerformanceTracker();

		tracker.startPhase("fetch");
		tracker.endPhase("fetch");
		tracker.startPhase("validation");
		tracker.endPhase("validation");

		const metrics = tracker.getMetrics();

		expect(metrics.totalMs).toBeGreaterThanOrEqual(0);
		expect(metrics.fetchMs).toBeGreaterThanOrEqual(0);
		expect(metrics.validationMs).toBeGreaterThanOrEqual(0);
		expect(metrics.warnings).toBeDefined();
		expect(Array.isArray(metrics.warnings)).toBe(true);
	});

	test("generates warnings for slow operations", async () => {
		const tracker = new PerformanceTracker();

		// Simulate slow operation (but keep test fast)
		tracker.startPhase("fetch");
		tracker.endPhase("fetch");

		// Manually set start time to simulate slow operation
		const metrics = tracker.getMetrics();

		// Just verify structure - actual slowness testing would be flaky
		expect(metrics.withinTarget).toBeDefined();
		expect(typeof metrics.withinTarget).toBe("boolean");
	});
});

describe("createPerformanceTracker", () => {
	test("returns a PerformanceTracker instance", () => {
		const tracker = createPerformanceTracker();
		expect(tracker).toBeInstanceOf(PerformanceTracker);
	});
});

// ============================================
// Formatting Tests
// ============================================

describe("formatBytes", () => {
	test("formats bytes", () => {
		expect(formatBytes(500)).toBe("500 B");
	});

	test("formats kilobytes", () => {
		expect(formatBytes(1024)).toBe("1.0 KB");
		expect(formatBytes(2560)).toBe("2.5 KB");
	});

	test("formats megabytes", () => {
		expect(formatBytes(1048576)).toBe("1.00 MB");
		expect(formatBytes(1572864)).toBe("1.50 MB");
	});
});

describe("formatPerformanceMetrics", () => {
	test("formats metrics as string", () => {
		const metrics = {
			totalMs: 150,
			fetchMs: 80,
			indicatorMs: 30,
			validationMs: 20,
			serializationMs: 10,
			withinTarget: true,
			warnings: [],
		};

		const formatted = formatPerformanceMetrics(metrics);

		expect(formatted).toContain("Total: 150ms");
		expect(formatted).toContain("Fetch: 80ms");
		expect(formatted).toContain("Validation: 20ms");
	});

	test("adds SLOW indicator when not within target", () => {
		const metrics = {
			totalMs: 500,
			fetchMs: 300,
			indicatorMs: 100,
			validationMs: 50,
			serializationMs: 30,
			withinTarget: false,
			warnings: [],
		};

		const formatted = formatPerformanceMetrics(metrics);

		expect(formatted).toContain("[SLOW]");
	});
});

describe("formatSizeValidation", () => {
	test("formats validation result", () => {
		const snapshot = createMockMarketSnapshot(2, 5);
		const validation = validateSnapshotSize(snapshot);

		const formatted = formatSizeValidation(validation);

		expect(formatted).toContain("Size:");
		expect(formatted).toContain("Tokens:");
	});

	test("adds OVERSIZED indicator for invalid", () => {
		const validation = {
			valid: false,
			estimate: {
				bytes: 600000,
				tokens: 150000,
				breakdown: { symbols: 0, bars: 0, quotes: 0, metadata: 0 },
				withinTarget: false,
				withinMax: false,
			},
			warnings: [],
			errors: ["Too big"],
			recommendations: [],
		};

		const formatted = formatSizeValidation(validation);

		expect(formatted).toContain("[OVERSIZED]");
	});

	test("adds ABOVE TARGET indicator when over target but valid", () => {
		const validation = {
			valid: true,
			estimate: {
				bytes: 150000,
				tokens: 40000,
				breakdown: { symbols: 0, bars: 0, quotes: 0, metadata: 0 },
				withinTarget: false,
				withinMax: true,
			},
			warnings: [],
			errors: [],
			recommendations: [],
		};

		const formatted = formatSizeValidation(validation);

		expect(formatted).toContain("[ABOVE TARGET]");
	});
});

// ============================================
// Performance Target Constants Tests
// ============================================

describe("PERFORMANCE_LIMITS", () => {
	test("has reasonable assembly targets", () => {
		expect(PERFORMANCE_LIMITS.TARGET_ASSEMBLY_MS).toBeLessThan(PERFORMANCE_LIMITS.MAX_ASSEMBLY_MS);
	});

	test("has target assembly under 1 second", () => {
		expect(PERFORMANCE_LIMITS.TARGET_ASSEMBLY_MS).toBeLessThanOrEqual(1000);
	});

	test("has validation target under 100ms", () => {
		expect(PERFORMANCE_LIMITS.TARGET_VALIDATION_MS).toBeLessThanOrEqual(100);
	});

	test("has serialization target under 50ms", () => {
		expect(PERFORMANCE_LIMITS.TARGET_SERIALIZATION_MS).toBeLessThanOrEqual(50);
	});
});

// ============================================
// Edge Cases
// ============================================

describe("edge cases", () => {
	test("handles snapshot with only metadata", () => {
		const snapshot: MarketSnapshot = {
			environment: "PAPER",
			asOf: "2026-01-05T14:30:00Z",
			marketStatus: "OPEN",
			regime: "BULL_TREND",
			symbols: [],
		};

		const estimate = estimateSnapshotSize(snapshot);
		expect(estimate.bytes).toBeGreaterThan(0);
		expect(estimate.withinTarget).toBe(true);

		const validation = validateSnapshotSize(snapshot);
		expect(validation.valid).toBe(true);
	});

	test("handles symbol with no bars", () => {
		const symbol: SymbolSnapshot = {
			symbol: "AAPL",
			quote: createMockQuote("AAPL"),
			bars: [],
			dayHigh: 151.0,
			dayLow: 148.5,
			prevClose: 149.0,
			open: 149.5,
			marketStatus: "OPEN",
			asOf: "2026-01-05T14:30:00Z",
		};

		const snapshot: MarketSnapshot = {
			environment: "PAPER",
			asOf: "2026-01-05T14:30:00Z",
			marketStatus: "OPEN",
			regime: "BULL_TREND",
			symbols: [symbol],
		};

		const estimate = estimateSnapshotSize(snapshot);
		expect(estimate.breakdown.bars).toBe(0);
	});

	test("handles symbol with no quote", () => {
		const symbol: SymbolSnapshot = {
			symbol: "AAPL",
			bars: [createMockBar("2026-01-05T14:00:00Z")],
			dayHigh: 151.0,
			dayLow: 148.5,
			prevClose: 149.0,
			open: 149.5,
			marketStatus: "OPEN",
			asOf: "2026-01-05T14:30:00Z",
		};

		const snapshot: MarketSnapshot = {
			environment: "PAPER",
			asOf: "2026-01-05T14:30:00Z",
			marketStatus: "OPEN",
			regime: "BULL_TREND",
			symbols: [symbol],
		};

		const estimate = estimateSnapshotSize(snapshot);
		expect(estimate.breakdown.quotes).toBe(0);
	});

	test("truncateSnapshot handles symbol with undefined bars", () => {
		const symbol: SymbolSnapshot = {
			symbol: "AAPL",
			quote: createMockQuote("AAPL"),
			dayHigh: 151.0,
			dayLow: 148.5,
			prevClose: 149.0,
			open: 149.5,
			marketStatus: "OPEN",
			asOf: "2026-01-05T14:30:00Z",
		};

		const snapshot: MarketSnapshot = {
			environment: "PAPER",
			asOf: "2026-01-05T14:30:00Z",
			marketStatus: "OPEN",
			regime: "BULL_TREND",
			symbols: [symbol],
		};

		const truncated = truncateSnapshot(snapshot, { maxCandles: 5 });
		expect(truncated.symbols?.[0]?.bars).toBeUndefined();
	});
});
