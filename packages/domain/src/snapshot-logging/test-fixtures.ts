import type { MarketSnapshot, SymbolSnapshot } from "../marketSnapshot";
import type { SnapshotLogEntry, SnapshotLogger } from "./types.js";

export function createMockSymbolSnapshot(symbol: string): SymbolSnapshot {
	return {
		symbol,
		quote: {
			symbol,
			bid: 150,
			ask: 150.05,
			bidSize: 1000,
			askSize: 800,
			last: 150.02,
			lastSize: 100,
			volume: 5000000,
			timestamp: "2026-01-05T14:30:00Z",
		},
		bars: [
			{
				symbol,
				timestamp: "2026-01-05T14:00:00Z",
				timeframeMinutes: 60,
				open: 149,
				high: 151,
				low: 148.5,
				close: 150,
				volume: 100000,
			},
		],
		dayHigh: 151,
		dayLow: 148.5,
		prevClose: 149,
		open: 149.5,
		marketStatus: "OPEN",
		asOf: "2026-01-05T14:30:00Z",
	};
}

export function createMockMarketSnapshot(symbols: string[] = ["AAPL", "MSFT"]): MarketSnapshot {
	return {
		environment: "PAPER",
		asOf: "2026-01-05T14:30:00Z",
		marketStatus: "OPEN",
		regime: "BULL_TREND",
		symbols: symbols.map(createMockSymbolSnapshot),
	};
}

export function createMockLogger(): SnapshotLogger & { entries: SnapshotLogEntry[] } {
	const entries: SnapshotLogEntry[] = [];
	return {
		entries,
		debug(entry) {
			entries.push(entry);
		},
		info(entry) {
			entries.push(entry);
		},
		warn(entry) {
			entries.push(entry);
		},
		error(entry) {
			entries.push(entry);
		},
	};
}
