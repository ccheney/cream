import { describe, expect, test } from "bun:test";
import type { MarketSnapshot, SymbolSnapshot } from "./marketSnapshot";
import { diffSnapshots, formatSnapshotDiff } from "./snapshot-logging";
import { createMockMarketSnapshot } from "./snapshot-logging/test-fixtures";

describe("diffSnapshots equality and top-level changes", () => {
	test("detects identical snapshots", () => {
		const snapshot = createMockMarketSnapshot();
		const result = diffSnapshots(snapshot, snapshot);
		expect(result.identical).toBe(true);
		expect(result.diffCount).toBe(0);
	});

	test("detects regime and market status changes", () => {
		const previous = createMockMarketSnapshot();
		const current = { ...previous, regime: "BEAR_TREND" as const, marketStatus: "CLOSED" as const };
		const result = diffSnapshots(previous, current);
		expect(result.identical).toBe(false);
		expect(result.summary.regimeChanged).toBe(true);
		expect(result.summary.marketStatusChanged).toBe(true);
		expect(result.diffs.some((diff) => diff.path === "regime")).toBe(true);
		expect(result.diffs.some((diff) => diff.path === "marketStatus")).toBe(true);
	});
});

describe("diffSnapshots symbol list changes", () => {
	test("detects added symbols", () => {
		const result = diffSnapshots(
			createMockMarketSnapshot(["AAPL"]),
			createMockMarketSnapshot(["AAPL", "MSFT"]),
		);
		expect(result.summary.symbolsAdded).toContain("MSFT");
	});

	test("detects removed symbols", () => {
		const result = diffSnapshots(
			createMockMarketSnapshot(["AAPL", "MSFT"]),
			createMockMarketSnapshot(["AAPL"]),
		);
		expect(result.summary.symbolsRemoved).toContain("MSFT");
	});

	test("detects modified symbols", () => {
		const previous = createMockMarketSnapshot(["AAPL"]);
		const current = createMockMarketSnapshot(["AAPL"]);
		if (current.symbols?.[0]) {
			current.symbols[0].dayHigh = 200;
		}
		const result = diffSnapshots(previous, current);
		expect(result.summary.symbolsModified).toContain("AAPL");
	});
});

describe("diffSnapshots options", () => {
	test("respects includeQuotes option", () => {
		const previous = createMockMarketSnapshot(["AAPL"]);
		const current = createMockMarketSnapshot(["AAPL"]);
		if (current.symbols?.[0]?.quote) {
			current.symbols[0].quote.last = 200;
		}
		const withQuotes = diffSnapshots(previous, current, { includeQuotes: true });
		const withoutQuotes = diffSnapshots(previous, current, { includeQuotes: false });
		expect(withQuotes.diffs.some((diff) => diff.path.includes("quote.last"))).toBe(true);
		expect(withoutQuotes.diffs.some((diff) => diff.path.includes("quote.last"))).toBe(false);
	});

	test("respects includeBars option", () => {
		const previous = createMockMarketSnapshot(["AAPL"]);
		const current = createMockMarketSnapshot(["AAPL"]);
		if (current.symbols?.[0]?.bars) {
			current.symbols[0].bars.push({
				symbol: "AAPL",
				timestamp: "2026-01-05T15:00:00Z",
				timeframeMinutes: 60,
				open: 152,
				high: 153,
				low: 151,
				close: 152.5,
				volume: 1500000,
			});
		}
		const result = diffSnapshots(previous, current, { includeBars: true });
		expect(result.diffs.some((diff) => diff.path.includes("bars.length"))).toBe(true);
	});

	test("respects maxDiffs option", () => {
		const previous = createMockMarketSnapshot(["AAPL", "MSFT", "GOOGL"]);
		const current = createMockMarketSnapshot(["AAPL", "MSFT", "GOOGL"]);
		if (current.symbols) {
			for (const symbol of current.symbols) {
				symbol.dayHigh = 200;
				symbol.dayLow = 100;
			}
		}
		const result = diffSnapshots(previous, current, { maxDiffs: 2 });
		expect(result.diffs.length).toBe(2);
		expect(result.diffCount).toBeGreaterThanOrEqual(2);
	});
});

describe("formatSnapshotDiff", () => {
	test("formats identical snapshots", () => {
		const snapshot = createMockMarketSnapshot();
		expect(formatSnapshotDiff(diffSnapshots(snapshot, snapshot))).toBe("Snapshots are identical");
	});

	test("formats regime and symbol changes", () => {
		const previous = createMockMarketSnapshot(["AAPL"]);
		const current = createMockMarketSnapshot(["AAPL", "MSFT"]);
		current.regime = "BEAR_TREND";
		const formatted = formatSnapshotDiff(diffSnapshots(previous, current));
		expect(formatted).toContain("differences found");
		expect(formatted).toContain("Regime changed");
		expect(formatted).toContain("symbols added");
		expect(formatted).toContain("MSFT");
	});

	test("formats market status, removals, and modifications", () => {
		const previous = createMockMarketSnapshot(["AAPL", "MSFT"]);
		const current = createMockMarketSnapshot(["AAPL"]);
		current.marketStatus = "CLOSED";
		if (current.symbols?.[0]) {
			current.symbols[0].dayHigh = 200;
		}
		const formatted = formatSnapshotDiff(diffSnapshots(previous, current));
		expect(formatted).toContain("Market status changed");
		expect(formatted).toContain("symbols removed");
		expect(formatted).toContain("symbols modified");
	});
});

describe("snapshot-logging edge cases", () => {
	test("diffSnapshots handles empty and undefined symbol arrays", () => {
		const empty: MarketSnapshot = {
			environment: "PAPER",
			asOf: "2026-01-05T14:30:00Z",
			marketStatus: "OPEN",
			regime: "BULL_TREND",
			symbols: [],
		};
		expect(diffSnapshots(empty, { ...empty }).identical).toBe(true);

		const undefinedSymbols: MarketSnapshot = {
			...empty,
			symbols: undefined as unknown as SymbolSnapshot[],
		};
		expect(diffSnapshots(undefinedSymbols, { ...undefinedSymbols }).identical).toBe(true);
	});
});
