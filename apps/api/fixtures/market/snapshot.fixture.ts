/**
 * Market Snapshot Test Fixtures
 *
 * Deterministic, realistic market snapshot data for testing.
 * Based on actual market data patterns from major US equities.
 *
 * Note: These are static fixtures used in test mode to ensure
 * deterministic test behavior. Prices and volumes are realistic
 * but do not represent any specific trading date.
 */

/**
 * Reference timestamp for all fixtures.
 * Using a fixed date to ensure deterministic behavior.
 */
export const FIXTURE_TIMESTAMP = new Date("2026-01-06T15:30:00.000Z").getTime();

/**
 * Internal snapshot format used by the market snapshot builder.
 * This is the normalized format after transformation from provider-specific schemas.
 */
export interface InternalSnapshot {
	symbol: string;
	lastTrade?: {
		price: number;
		size: number;
		timestamp: number;
		exchange?: string;
	};
	lastQuote?: {
		bid: number;
		ask: number;
		bidSize: number;
		askSize: number;
		timestamp: number;
	};
	volume: number;
	dayHigh: number;
	dayLow: number;
	prevClose: number;
	open: number;
}

/**
 * Snapshot fixture data keyed by symbol.
 * Each snapshot represents realistic market data for a major US equity.
 */
export const SNAPSHOT_FIXTURES: Record<string, InternalSnapshot> = {
	// Market ETFs
	SPY: {
		symbol: "SPY",
		lastTrade: {
			price: 477.82,
			size: 100,
			timestamp: FIXTURE_TIMESTAMP,
			exchange: "Q",
		},
		lastQuote: {
			bid: 477.8,
			ask: 477.84,
			bidSize: 400,
			askSize: 500,
			timestamp: FIXTURE_TIMESTAMP,
		},
		volume: 52_430_000,
		dayHigh: 478.5,
		dayLow: 474.1,
		prevClose: 475.25,
		open: 475.25,
	},

	QQQ: {
		symbol: "QQQ",
		lastTrade: {
			price: 407.65,
			size: 100,
			timestamp: FIXTURE_TIMESTAMP,
			exchange: "Q",
		},
		lastQuote: {
			bid: 407.62,
			ask: 407.68,
			bidSize: 350,
			askSize: 300,
			timestamp: FIXTURE_TIMESTAMP,
		},
		volume: 38_750_000,
		dayHigh: 408.2,
		dayLow: 404.3,
		prevClose: 405.5,
		open: 405.5,
	},

	// Mega-cap Tech
	AAPL: {
		symbol: "AAPL",
		lastTrade: {
			price: 186.95,
			size: 100,
			timestamp: FIXTURE_TIMESTAMP,
			exchange: "Q",
		},
		lastQuote: {
			bid: 186.93,
			ask: 186.97,
			bidSize: 1000,
			askSize: 800,
			timestamp: FIXTURE_TIMESTAMP,
		},
		volume: 45_120_000,
		dayHigh: 187.45,
		dayLow: 184.8,
		prevClose: 185.2,
		open: 185.2,
	},

	MSFT: {
		symbol: "MSFT",
		lastTrade: {
			price: 381.45,
			size: 100,
			timestamp: FIXTURE_TIMESTAMP,
			exchange: "Q",
		},
		lastQuote: {
			bid: 381.42,
			ask: 381.48,
			bidSize: 250,
			askSize: 200,
			timestamp: FIXTURE_TIMESTAMP,
		},
		volume: 18_340_000,
		dayHigh: 382.2,
		dayLow: 377.3,
		prevClose: 378.5,
		open: 378.5,
	},

	GOOGL: {
		symbol: "GOOGL",
		lastTrade: {
			price: 143.75,
			size: 100,
			timestamp: FIXTURE_TIMESTAMP,
			exchange: "Q",
		},
		lastQuote: {
			bid: 143.72,
			ask: 143.78,
			bidSize: 500,
			askSize: 400,
			timestamp: FIXTURE_TIMESTAMP,
		},
		volume: 22_180_000,
		dayHigh: 144.15,
		dayLow: 141.8,
		prevClose: 142.3,
		open: 142.3,
	},

	AMZN: {
		symbol: "AMZN",
		lastTrade: {
			price: 180.25,
			size: 100,
			timestamp: FIXTURE_TIMESTAMP,
			exchange: "Q",
		},
		lastQuote: {
			bid: 180.22,
			ask: 180.28,
			bidSize: 350,
			askSize: 300,
			timestamp: FIXTURE_TIMESTAMP,
		},
		volume: 35_670_000,
		dayHigh: 180.85,
		dayLow: 177.6,
		prevClose: 178.4,
		open: 178.4,
	},

	NVDA: {
		symbol: "NVDA",
		lastTrade: {
			price: 490.65,
			size: 100,
			timestamp: FIXTURE_TIMESTAMP,
			exchange: "Q",
		},
		lastQuote: {
			bid: 490.6,
			ask: 490.7,
			bidSize: 250,
			askSize: 200,
			timestamp: FIXTURE_TIMESTAMP,
		},
		volume: 42_850_000,
		dayHigh: 492.8,
		dayLow: 483.5,
		prevClose: 485.2,
		open: 485.2,
	},

	TSLA: {
		symbol: "TSLA",
		lastTrade: {
			price: 252.45,
			size: 100,
			timestamp: FIXTURE_TIMESTAMP,
			exchange: "Q",
		},
		lastQuote: {
			bid: 252.4,
			ask: 252.5,
			bidSize: 500,
			askSize: 400,
			timestamp: FIXTURE_TIMESTAMP,
		},
		volume: 98_450_000,
		dayHigh: 254.6,
		dayLow: 246.8,
		prevClose: 248.3,
		open: 248.3,
	},

	// Financial sector
	JPM: {
		symbol: "JPM",
		lastTrade: {
			price: 197.25,
			size: 100,
			timestamp: FIXTURE_TIMESTAMP,
			exchange: "Q",
		},
		lastQuote: {
			bid: 197.22,
			ask: 197.28,
			bidSize: 250,
			askSize: 200,
			timestamp: FIXTURE_TIMESTAMP,
		},
		volume: 8_450_000,
		dayHigh: 197.8,
		dayLow: 194.6,
		prevClose: 195.4,
		open: 195.4,
	},

	// Healthcare
	JNJ: {
		symbol: "JNJ",
		lastTrade: {
			price: 157.1,
			size: 100,
			timestamp: FIXTURE_TIMESTAMP,
			exchange: "Q",
		},
		lastQuote: {
			bid: 157.07,
			ask: 157.13,
			bidSize: 400,
			askSize: 300,
			timestamp: FIXTURE_TIMESTAMP,
		},
		volume: 6_230_000,
		dayHigh: 157.45,
		dayLow: 155.8,
		prevClose: 156.2,
		open: 156.2,
	},
};

/**
 * Get a snapshot fixture for a symbol.
 * Returns a copy to prevent mutation of the original fixture.
 *
 * @param symbol - The ticker symbol
 * @returns InternalSnapshot fixture or a generated default if not found
 */
export function getSnapshotFixture(symbol: string): InternalSnapshot {
	const fixture = SNAPSHOT_FIXTURES[symbol];

	if (fixture) {
		// Return a deep copy to prevent mutation
		return JSON.parse(JSON.stringify(fixture)) as InternalSnapshot;
	}

	// Generate a deterministic default based on symbol hash
	return createDefaultSnapshot(symbol);
}

/**
 * Create a deterministic default snapshot for unknown symbols.
 * Uses a simple hash of the symbol to generate consistent but varied values.
 */
function createDefaultSnapshot(symbol: string): InternalSnapshot {
	// Simple hash function for deterministic values
	const hash = symbol.split("").reduce((acc, char) => {
		return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
	}, 0);

	// Generate a base price between 50 and 300 based on hash
	const basePrice = 50 + Math.abs(hash % 250);
	const volatility = 0.02 + Math.abs(hash % 100) / 10000;

	const open = Number(basePrice.toFixed(2));
	const close = Number((basePrice * (1 + ((hash % 200) - 100) / 10000)).toFixed(2));
	const high = Number((Math.max(open, close) * (1 + volatility)).toFixed(2));
	const low = Number((Math.min(open, close) * (1 - volatility)).toFixed(2));
	const volume = 1_000_000 + Math.abs(hash % 10_000_000);

	return {
		symbol,
		lastTrade: {
			price: close,
			size: 100,
			timestamp: FIXTURE_TIMESTAMP,
			exchange: "Q",
		},
		lastQuote: {
			bid: Number((close - 0.02).toFixed(2)),
			ask: Number((close + 0.02).toFixed(2)),
			bidSize: 500,
			askSize: 500,
			timestamp: FIXTURE_TIMESTAMP,
		},
		volume,
		dayHigh: high,
		dayLow: low,
		prevClose: open,
		open,
	};
}

/**
 * Get snapshot fixtures for multiple symbols.
 *
 * @param symbols - Array of ticker symbols
 * @returns Map of symbol to InternalSnapshot
 */
export function getSnapshotFixtures(symbols: string[]): Map<string, InternalSnapshot> {
	const snapshots = new Map<string, InternalSnapshot>();
	for (const symbol of symbols) {
		snapshots.set(symbol, getSnapshotFixture(symbol));
	}
	return snapshots;
}
