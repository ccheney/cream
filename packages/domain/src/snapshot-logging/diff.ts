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
	includeQuotes: boolean
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
	options: SnapshotDiffOptions = {}
): SnapshotDiffResult {
	const { includeBars = false, includeQuotes = false, maxDiffs = 100 } = options;

	const diffs: SnapshotDiffEntry[] = [];
	const summary = {
		symbolsAdded: [] as string[],
		symbolsRemoved: [] as string[],
		symbolsModified: [] as string[],
		regimeChanged: previous.regime !== current.regime,
		marketStatusChanged: previous.marketStatus !== current.marketStatus,
	};

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

	const prevSymbols = new Map((previous.symbols ?? []).map((s) => [s.symbol, s]));
	const currSymbols = new Map((current.symbols ?? []).map((s) => [s.symbol, s]));

	for (const [symbol] of currSymbols) {
		if (!prevSymbols.has(symbol)) {
			summary.symbolsAdded.push(symbol);
			diffs.push({
				path: `symbols.${symbol}`,
				previous: undefined,
				current: symbol,
				changeType: "added",
			});
		}
	}

	for (const [symbol] of prevSymbols) {
		if (!currSymbols.has(symbol)) {
			summary.symbolsRemoved.push(symbol);
			diffs.push({
				path: `symbols.${symbol}`,
				previous: symbol,
				current: undefined,
				changeType: "removed",
			});
		}
	}

	for (const [symbol, currSymbol] of currSymbols) {
		const prevSymbol = prevSymbols.get(symbol);
		if (!prevSymbol) {
			continue;
		}

		const symbolDiffs = diffSymbolSnapshots(
			prevSymbol,
			currSymbol,
			symbol,
			includeBars,
			includeQuotes
		);
		if (symbolDiffs.length > 0) {
			summary.symbolsModified.push(symbol);
			diffs.push(...symbolDiffs);
		}
	}

	const limitedDiffs = diffs.slice(0, maxDiffs);

	return {
		identical: diffs.length === 0,
		diffCount: diffs.length,
		diffs: limitedDiffs,
		summary,
	};
}
