/**
 * Snapshot Diff Utilities
 *
 * Utilities for comparing market snapshots.
 */

import type { MarketSnapshot, SymbolSnapshot } from "../marketSnapshot";
import type { SnapshotDiffEntry, SnapshotDiffOptions, SnapshotDiffResult } from "./types.js";

/**
 * Compare two symbol snapshots.
 */
function diffSymbolSnapshots(
	previous: SymbolSnapshot,
	current: SymbolSnapshot,
	symbol: string,
	includeBars: boolean,
	includeQuotes: boolean,
): SnapshotDiffEntry[] {
	const diffs: SnapshotDiffEntry[] = [];

	if (previous.dayHigh !== current.dayHigh) {
		diffs.push({
			path: `symbols.${symbol}.dayHigh`,
			previous: previous.dayHigh,
			current: current.dayHigh,
			changeType: "modified",
		});
	}

	if (previous.dayLow !== current.dayLow) {
		diffs.push({
			path: `symbols.${symbol}.dayLow`,
			previous: previous.dayLow,
			current: current.dayLow,
			changeType: "modified",
		});
	}

	if (includeQuotes && previous.quote && current.quote) {
		if (previous.quote.last !== current.quote.last) {
			diffs.push({
				path: `symbols.${symbol}.quote.last`,
				previous: previous.quote.last,
				current: current.quote.last,
				changeType: "modified",
			});
		}

		if (previous.quote.bid !== current.quote.bid) {
			diffs.push({
				path: `symbols.${symbol}.quote.bid`,
				previous: previous.quote.bid,
				current: current.quote.bid,
				changeType: "modified",
			});
		}

		if (previous.quote.ask !== current.quote.ask) {
			diffs.push({
				path: `symbols.${symbol}.quote.ask`,
				previous: previous.quote.ask,
				current: current.quote.ask,
				changeType: "modified",
			});
		}
	}

	if (includeBars) {
		const prevBars = previous.bars?.length ?? 0;
		const currBars = current.bars?.length ?? 0;
		if (prevBars !== currBars) {
			diffs.push({
				path: `symbols.${symbol}.bars.length`,
				previous: prevBars,
				current: currBars,
				changeType: "modified",
			});
		}
	}

	return diffs;
}

/**
 * Compare two snapshots and return differences.
 */
export function diffSnapshots(
	previous: MarketSnapshot,
	current: MarketSnapshot,
	options: SnapshotDiffOptions = {},
): SnapshotDiffResult {
	const { includeBars = false, includeQuotes = false, maxDiffs = 100 } = options;
	const summary = createDiffSummary(previous, current);
	const diffs: SnapshotDiffEntry[] = [];
	addTopLevelDiffs(previous, current, summary, diffs);

	const prevSymbols = mapSymbolsByTicker(previous);
	const currSymbols = mapSymbolsByTicker(current);
	collectAddedAndRemovedSymbols(prevSymbols, currSymbols, summary, diffs);
	collectModifiedSymbols(prevSymbols, currSymbols, summary, diffs, includeBars, includeQuotes);

	const limitedDiffs = diffs.slice(0, maxDiffs);

	return {
		identical: diffs.length === 0,
		diffCount: diffs.length,
		diffs: limitedDiffs,
		summary,
	};
}

function createDiffSummary(previous: MarketSnapshot, current: MarketSnapshot) {
	return {
		symbolsAdded: [] as string[],
		symbolsRemoved: [] as string[],
		symbolsModified: [] as string[],
		regimeChanged: previous.regime !== current.regime,
		marketStatusChanged: previous.marketStatus !== current.marketStatus,
	};
}

function addTopLevelDiffs(
	previous: MarketSnapshot,
	current: MarketSnapshot,
	summary: ReturnType<typeof createDiffSummary>,
	diffs: SnapshotDiffEntry[],
): void {
	if (summary.regimeChanged) {
		diffs.push({
			path: "regime",
			previous: previous.regime,
			current: current.regime,
			changeType: "modified",
		});
	}

	if (summary.marketStatusChanged) {
		diffs.push({
			path: "marketStatus",
			previous: previous.marketStatus,
			current: current.marketStatus,
			changeType: "modified",
		});
	}
}

function mapSymbolsByTicker(snapshot: MarketSnapshot): Map<string, SymbolSnapshot> {
	return new Map((snapshot.symbols ?? []).map((symbol) => [symbol.symbol, symbol]));
}

function collectAddedAndRemovedSymbols(
	prevSymbols: Map<string, SymbolSnapshot>,
	currSymbols: Map<string, SymbolSnapshot>,
	summary: ReturnType<typeof createDiffSummary>,
	diffs: SnapshotDiffEntry[],
): void {
	for (const [symbol] of currSymbols) {
		if (prevSymbols.has(symbol)) {
			continue;
		}
		summary.symbolsAdded.push(symbol);
		diffs.push({
			path: `symbols.${symbol}`,
			previous: undefined,
			current: symbol,
			changeType: "added",
		});
	}

	for (const [symbol] of prevSymbols) {
		if (currSymbols.has(symbol)) {
			continue;
		}
		summary.symbolsRemoved.push(symbol);
		diffs.push({
			path: `symbols.${symbol}`,
			previous: symbol,
			current: undefined,
			changeType: "removed",
		});
	}
}

function collectModifiedSymbols(
	prevSymbols: Map<string, SymbolSnapshot>,
	currSymbols: Map<string, SymbolSnapshot>,
	summary: ReturnType<typeof createDiffSummary>,
	diffs: SnapshotDiffEntry[],
	includeBars: boolean,
	includeQuotes: boolean,
): void {
	for (const [symbol, currentSymbol] of currSymbols) {
		const previousSymbol = prevSymbols.get(symbol);
		if (!previousSymbol) {
			continue;
		}

		const symbolDiffs = diffSymbolSnapshots(
			previousSymbol,
			currentSymbol,
			symbol,
			includeBars,
			includeQuotes,
		);
		if (symbolDiffs.length === 0) {
			continue;
		}
		summary.symbolsModified.push(symbol);
		diffs.push(...symbolDiffs);
	}
}
