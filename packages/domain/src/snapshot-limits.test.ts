import { describe, expect, test } from "bun:test";
import type { MarketSnapshot, SymbolSnapshot } from "./marketSnapshot";
import {
	estimateSnapshotSize,
	estimateSnapshotTokens,
	estimateTokenCount,
	SNAPSHOT_SIZE_LIMITS,
	TOKEN_ESTIMATION,
	TRUNCATION_LIMITS,
	truncateArray,
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

function createMockSymbolSnapshot(symbol: string, numBars = 10): SymbolSnapshot {
	const bars = Array.from({ length: numBars }, (_, index) => {
		const date = new Date(2026, 0, 5, 9 + index);
		return createMockBar(date.toISOString());
	});

	return {
		symbol,
		quote: createMockQuote(symbol),
		bars,
		dayHigh: 151,
		dayLow: 148.5,
		prevClose: 149,
		open: 149.5,
		marketStatus: "OPEN" as const,
		asOf: "2026-01-05T14:30:00Z",
	};
}

function createMockMarketSnapshot(numSymbols = 5, barsPerSymbol = 10): MarketSnapshot {
	const symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "SPY", "QQQ", "IWM"];
	return {
		environment: "PAPER",
		asOf: "2026-01-05T14:30:00Z",
		marketStatus: "OPEN",
		regime: "BULL_TREND",
		symbols: symbols
			.slice(0, numSymbols)
			.map((symbol) => createMockSymbolSnapshot(symbol, barsPerSymbol)),
	};
}

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
		expect(TOKEN_ESTIMATION.CHARS_PER_TOKEN).toBeGreaterThanOrEqual(3);
		expect(TOKEN_ESTIMATION.CHARS_PER_TOKEN).toBeLessThanOrEqual(5);
	});

	test("has reasonable target token count", () => {
		expect(TOKEN_ESTIMATION.TARGET_TOKENS).toBe(10_000);
	});
});

describe("estimateSnapshotSize basic behavior", () => {
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
});

describe("estimateSnapshotSize edge handling", () => {
	test("handles empty symbols array", () => {
		const snapshot: MarketSnapshot = {
			environment: "PAPER",
			asOf: "2026-01-05T14:30:00Z",
			marketStatus: "OPEN",
			regime: "BULL_TREND",
			symbols: [],
		};
		const estimate = estimateSnapshotSize(snapshot);
		expect(estimate.bytes).toBeGreaterThan(0);
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
		expect(estimate.bytes).toBeGreaterThan(0);
	});
});

describe("estimateTokenCount", () => {
	test("estimates tokens from bytes", () => {
		const tokens = estimateTokenCount(1000);
		expect(tokens).toBeGreaterThan(280);
		expect(tokens).toBeLessThan(400);
	});

	test("handles small sizes", () => {
		expect(estimateTokenCount(100)).toBeGreaterThan(0);
	});

	test("handles large sizes", () => {
		expect(estimateTokenCount(500_000)).toBeGreaterThan(100_000);
	});
});

describe("estimateSnapshotTokens", () => {
	test("returns token count for snapshot", () => {
		const tokens = estimateSnapshotTokens(createMockMarketSnapshot(5, 10));
		expect(tokens).toBeGreaterThan(0);
		expect(typeof tokens).toBe("number");
	});
});

describe("validateSnapshotSize", () => {
	test("validates small snapshot as valid", () => {
		const validation = validateSnapshotSize(createMockMarketSnapshot(2, 5));
		expect(validation.valid).toBe(true);
		expect(validation.errors).toHaveLength(0);
	});

	test("includes estimate in result", () => {
		const validation = validateSnapshotSize(createMockMarketSnapshot(2, 5));
		expect(validation.estimate).toBeDefined();
		expect(validation.estimate.bytes).toBeGreaterThan(0);
	});

	test("warns when exceeding target", () => {
		const validation = validateSnapshotSize(createMockMarketSnapshot(50, 100));
		expect(Array.isArray(validation.warnings)).toBe(true);
	});

	test("provides recommendations for large components", () => {
		const validation = validateSnapshotSize(createMockMarketSnapshot(30, 80));
		expect(Array.isArray(validation.recommendations)).toBe(true);
	});

	test("recommends limiting symbols when over limit", () => {
		const snapshot = createMockMarketSnapshot(10, 10);
		(snapshot as { symbols: SymbolSnapshot[] }).symbols = Array.from({ length: 60 }, (_, index) =>
			createMockSymbolSnapshot(`SYM${index}`, 5),
		);
		const validation = validateSnapshotSize(snapshot);
		expect(
			validation.recommendations.some((recommendation) => recommendation.includes("symbols")),
		).toBe(true);
	});
});

describe("truncateArray", () => {
	test("does not truncate when under limit", () => {
		const { result, removed } = truncateArray([1, 2, 3, 4, 5], 10);
		expect(result).toEqual([1, 2, 3, 4, 5]);
		expect(removed).toBe(0);
	});

	test("truncates keeping most recent by default", () => {
		const { result, removed } = truncateArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
		expect(result).toEqual([6, 7, 8, 9, 10]);
		expect(removed).toBe(5);
	});

	test("truncates keeping oldest when specified", () => {
		const { result, removed } = truncateArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5, false);
		expect(result).toEqual([1, 2, 3, 4, 5]);
		expect(removed).toBe(5);
	});

	test("handles empty array", () => {
		const { result, removed } = truncateArray<number>([], 5);
		expect(result).toEqual([]);
		expect(removed).toBe(0);
	});

	test("handles exact limit", () => {
		const { result, removed } = truncateArray([1, 2, 3, 4, 5], 5);
		expect(result).toEqual([1, 2, 3, 4, 5]);
		expect(removed).toBe(0);
	});
});

describe("truncateSnapshot with limits", () => {
	test("truncates symbols when over limit", () => {
		const truncated = truncateSnapshot(createMockMarketSnapshot(10, 5), { maxSymbols: 5 });
		expect(truncated.symbols?.length).toBe(5);
	});

	test("truncates bars when over limit", () => {
		const truncated = truncateSnapshot(createMockMarketSnapshot(2, 50), { maxCandles: 20 });
		for (const symbol of truncated.symbols ?? []) {
			expect(symbol.bars?.length).toBeLessThanOrEqual(20);
		}
	});

	test("keeps most recent bars by default", () => {
		const snapshot = createMockMarketSnapshot(1, 10);
		const originalLastBar = snapshot.symbols?.[0]?.bars?.[9];
		const truncated = truncateSnapshot(snapshot, { maxCandles: 5 });
		expect(truncated.symbols?.[0]?.bars?.[4]?.timestamp).toBe(originalLastBar?.timestamp);
	});
});

describe("truncateSnapshot behavior", () => {
	test("does not mutate original snapshot", () => {
		const snapshot = createMockMarketSnapshot(10, 50);
		const originalSymbolCount = snapshot.symbols?.length ?? 0;
		const originalBarCount = snapshot.symbols?.[0]?.bars?.length ?? 0;
		truncateSnapshot(snapshot, { maxSymbols: 3, maxCandles: 10 });
		expect(snapshot.symbols?.length).toBe(originalSymbolCount);
		expect(snapshot.symbols?.[0]?.bars?.length).toBe(originalBarCount);
	});

	test("uses default limits when no options provided", () => {
		const truncated = truncateSnapshot(createMockMarketSnapshot(10, 50));
		expect(truncated.symbols?.length).toBeLessThanOrEqual(TRUNCATION_LIMITS.MAX_SYMBOLS);
		for (const symbol of truncated.symbols ?? []) {
			expect(symbol.bars?.length).toBeLessThanOrEqual(TRUNCATION_LIMITS.MAX_CANDLES);
		}
	});

	test("handles empty snapshot", () => {
		const truncated = truncateSnapshot({
			environment: "PAPER",
			asOf: "2026-01-05T14:30:00Z",
			marketStatus: "OPEN",
			regime: "BULL_TREND",
			symbols: [],
		});
		expect(truncated.symbols).toEqual([]);
	});
});
