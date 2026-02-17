import { describe, expect, test } from "bun:test";
import type { MarketSnapshot, SymbolSnapshot } from "./marketSnapshot";
import {
	createPerformanceTracker,
	estimateSnapshotSize,
	formatBytes,
	formatPerformanceMetrics,
	formatSizeValidation,
	PERFORMANCE_LIMITS,
	PerformanceTracker,
	truncateSnapshot,
	validateSnapshotSize,
} from "./snapshot-limits";

function createMockQuote(symbol: string) {
	return {
		symbol,
		bid: 150,
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
		open: 149,
		high: 151,
		low: 148.5,
		close: 150,
		volume: 100000,
		vwap: 149.8,
		timeframe: "1h" as const,
	};
}

function createMockMarketSnapshot(symbols: SymbolSnapshot[]): MarketSnapshot {
	return {
		environment: "PAPER",
		asOf: "2026-01-05T14:30:00Z",
		marketStatus: "OPEN",
		regime: "BULL_TREND",
		symbols,
	};
}

describe("PerformanceTracker timing", () => {
	test("tracks total time", async () => {
		const tracker = new PerformanceTracker();
		await Bun.sleep(15);
		expect(tracker.getTotalTime()).toBeGreaterThanOrEqual(8);
	});

	test("tracks individual phases", () => {
		const tracker = new PerformanceTracker();
		tracker.startPhase("fetch");
		for (let index = 0; index < 1000; index += 1) {
			Math.sqrt(index);
		}
		const fetchDuration = tracker.endPhase("fetch");
		expect(fetchDuration).toBeGreaterThanOrEqual(0);
		expect(tracker.getPhaseDuration("fetch")).toBe(fetchDuration);
	});

	test("returns 0 for non-existent or incomplete phase", () => {
		const tracker = new PerformanceTracker();
		expect(tracker.getPhaseDuration("nonexistent")).toBe(0);
		tracker.startPhase("incomplete");
		expect(tracker.getPhaseDuration("incomplete")).toBe(0);
	});
});

describe("PerformanceTracker metrics", () => {
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
		expect(Array.isArray(metrics.warnings)).toBe(true);
	});

	test("exposes withinTarget status", () => {
		const metrics = new PerformanceTracker().getMetrics();
		expect(typeof metrics.withinTarget).toBe("boolean");
	});

	test("factory returns tracker instance", () => {
		expect(createPerformanceTracker()).toBeInstanceOf(PerformanceTracker);
	});
});

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
		const formatted = formatPerformanceMetrics({
			totalMs: 150,
			fetchMs: 80,
			indicatorMs: 30,
			validationMs: 20,
			serializationMs: 10,
			withinTarget: true,
			warnings: [],
		});
		expect(formatted).toContain("Total: 150ms");
		expect(formatted).toContain("Fetch: 80ms");
		expect(formatted).toContain("Validation: 20ms");
	});

	test("adds SLOW indicator when not within target", () => {
		const formatted = formatPerformanceMetrics({
			totalMs: 500,
			fetchMs: 300,
			indicatorMs: 100,
			validationMs: 50,
			serializationMs: 30,
			withinTarget: false,
			warnings: [],
		});
		expect(formatted).toContain("[SLOW]");
	});
});

describe("formatSizeValidation", () => {
	test("formats validation result", () => {
		const validation = validateSnapshotSize(
			createMockMarketSnapshot([
				{
					symbol: "AAPL",
					quote: createMockQuote("AAPL"),
					bars: [createMockBar("2026-01-05T14:00:00Z")],
					dayHigh: 151,
					dayLow: 148.5,
					prevClose: 149,
					open: 149.5,
					marketStatus: "OPEN",
					asOf: "2026-01-05T14:30:00Z",
				},
			]),
		);
		const formatted = formatSizeValidation(validation);
		expect(formatted).toContain("Size:");
		expect(formatted).toContain("Tokens:");
	});

	test("adds OVERSIZED indicator for invalid", () => {
		const formatted = formatSizeValidation({
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
		});
		expect(formatted).toContain("[OVERSIZED]");
	});

	test("adds ABOVE TARGET indicator when over target but valid", () => {
		const formatted = formatSizeValidation({
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
		});
		expect(formatted).toContain("[ABOVE TARGET]");
	});
});

describe("PERFORMANCE_LIMITS", () => {
	test("has reasonable assembly targets", () => {
		expect(PERFORMANCE_LIMITS.TARGET_ASSEMBLY_MS).toBeLessThan(PERFORMANCE_LIMITS.MAX_ASSEMBLY_MS);
	});

	test("validation and serialization targets are bounded", () => {
		expect(PERFORMANCE_LIMITS.TARGET_VALIDATION_MS).toBeLessThanOrEqual(100);
		expect(PERFORMANCE_LIMITS.TARGET_SERIALIZATION_MS).toBeLessThanOrEqual(50);
	});
});

describe("snapshot-limits edge cases", () => {
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
		expect(validateSnapshotSize(snapshot).valid).toBe(true);
	});

	test("handles symbol with missing bars/quote fields", () => {
		const symbolNoBars: SymbolSnapshot = {
			symbol: "AAPL",
			quote: createMockQuote("AAPL"),
			bars: [],
			dayHigh: 151,
			dayLow: 148.5,
			prevClose: 149,
			open: 149.5,
			marketStatus: "OPEN",
			asOf: "2026-01-05T14:30:00Z",
		};
		const symbolNoQuote: SymbolSnapshot = {
			symbol: "MSFT",
			bars: [createMockBar("2026-01-05T14:00:00Z")],
			dayHigh: 151,
			dayLow: 148.5,
			prevClose: 149,
			open: 149.5,
			marketStatus: "OPEN",
			asOf: "2026-01-05T14:30:00Z",
		};
		const estimate = estimateSnapshotSize(createMockMarketSnapshot([symbolNoBars, symbolNoQuote]));
		expect(estimate.breakdown.bars).toBeGreaterThanOrEqual(0);
		expect(estimate.breakdown.quotes).toBeGreaterThanOrEqual(0);
	});

	test("truncateSnapshot handles undefined bars", () => {
		const symbol: SymbolSnapshot = {
			symbol: "AAPL",
			quote: createMockQuote("AAPL"),
			dayHigh: 151,
			dayLow: 148.5,
			prevClose: 149,
			open: 149.5,
			marketStatus: "OPEN",
			asOf: "2026-01-05T14:30:00Z",
		};
		const truncated = truncateSnapshot(createMockMarketSnapshot([symbol]), { maxCandles: 5 });
		expect(truncated.symbols?.[0]?.bars).toBeUndefined();
	});
});
