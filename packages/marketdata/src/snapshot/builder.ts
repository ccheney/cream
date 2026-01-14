/**
 * Feature Snapshot Builder
 *
 * Aggregates candles, indicators, normalized features, and regime labels
 * into a single context object for agent consumption.
 *
 * @see docs/plans/02-data-layer.md - Feature Computation
 */

import type { Candle as IndicatorCandle, IndicatorPipelineConfig } from "@cream/indicators";
import {
	applyTransforms,
	calculateMultiTimeframeIndicators,
	DEFAULT_PIPELINE_CONFIG,
	DEFAULT_TRANSFORM_CONFIG,
} from "@cream/indicators";
import { classifyRegime, DEFAULT_RULE_BASED_CONFIG } from "@cream/regime";
import type { ResolvedInstrument } from "@cream/universe";

import { getGlobalCache, type SnapshotCache } from "./cache";
import {
	type CandlesByTimeframe,
	classifyMarketCap,
	DEFAULT_SNAPSHOT_CONFIG,
	type ExternalEventSummary,
	type FeatureSnapshot,
	type IndicatorValues,
	type NormalizedValues,
	type RegimeClassification,
	type SnapshotBuilderConfig,
	type Timeframe,
	type UniverseMetadata,
} from "./schema";

/**
 * Candle data source interface.
 * Implement this to provide candle data from your storage.
 */
export interface CandleDataSource {
	/**
	 * Fetch candles for a symbol and timeframe.
	 *
	 * @param symbol - Ticker symbol
	 * @param timeframe - Candle timeframe
	 * @param limit - Maximum candles to fetch
	 * @param before - Fetch candles before this timestamp (optional)
	 * @returns Array of candles (oldest first)
	 */
	getCandles(
		symbol: string,
		timeframe: Timeframe,
		limit: number,
		before?: number
	): Promise<IndicatorCandle[]>;
}

/**
 * External event source interface.
 * Implement this to provide external events from HelixDB.
 */
export interface ExternalEventSource {
	/**
	 * Fetch recent external events for a symbol.
	 *
	 * @param symbol - Ticker symbol
	 * @param lookbackHours - Hours to look back
	 * @param limit - Maximum events to return
	 * @returns Array of event summaries (newest first)
	 */
	getRecentEvents(
		symbol: string,
		lookbackHours: number,
		limit: number
	): Promise<ExternalEventSummary[]>;
}

/**
 * Universe metadata source interface.
 * Implement this to provide instrument metadata.
 */
export interface UniverseMetadataSource {
	/**
	 * Get metadata for a symbol.
	 *
	 * @param symbol - Ticker symbol
	 * @returns Instrument metadata or null if not found
	 */
	getMetadata(symbol: string): Promise<ResolvedInstrument | null>;
}

/**
 * Data sources for snapshot builder.
 */
export interface SnapshotDataSources {
	candles: CandleDataSource;
	events?: ExternalEventSource;
	universe?: UniverseMetadataSource;
}

/**
 * Build options for a single snapshot.
 */
export interface BuildSnapshotOptions {
	/** Override default configuration */
	config?: Partial<SnapshotBuilderConfig>;
	/** Indicator pipeline configuration */
	indicatorConfig?: IndicatorPipelineConfig;
	/** Use cache (default: true) */
	useCache?: boolean;
	/** Custom cache instance (default: global cache) */
	cache?: SnapshotCache;
}

/**
 * Build a feature snapshot for a symbol at a specific timestamp.
 *
 * Aggregates:
 * - Latest candles across multiple timeframes
 * - Technical indicators (RSI, SMA, EMA, ATR, Bollinger, etc.)
 * - Normalized values (z-score, percentile rank, returns)
 * - Regime classification (BULL_TREND, BEAR_TREND, RANGE, etc.)
 * - Recent external events (news, sentiment, macro)
 * - Universe metadata (sector, market cap, volume)
 *
 * @param symbol - Ticker symbol
 * @param timestamp - Unix timestamp in milliseconds
 * @param sources - Data sources
 * @param options - Build options
 * @returns Feature snapshot for agent consumption
 *
 * @example
 * ```typescript
 * const snapshot = await buildSnapshot("AAPL", Date.now(), {
 *   candles: myCandleSource,
 *   events: myEventSource,
 *   universe: myUniverseSource,
 * });
 *
 * console.log(snapshot.regime.regime); // "BULL_TREND"
 * console.log(snapshot.indicators["rsi_14_1h"]); // 65.5
 * ```
 */
export async function buildSnapshot(
	symbol: string,
	timestamp: number,
	sources: SnapshotDataSources,
	options: BuildSnapshotOptions = {}
): Promise<FeatureSnapshot> {
	const config = { ...DEFAULT_SNAPSHOT_CONFIG, ...options.config };
	const indicatorConfig = options.indicatorConfig ?? DEFAULT_PIPELINE_CONFIG;
	const useCache = options.useCache ?? true;
	const cache = options.cache ?? getGlobalCache();

	if (useCache) {
		const cached = cache.get(symbol, timestamp);
		if (cached) {
			return cached;
		}
	}

	const candlePromises = config.timeframes.map(async (tf) => {
		const candles = await sources.candles.getCandles(symbol, tf, config.lookbackWindow, timestamp);
		return [tf, candles] as const;
	});

	const candleResults = await Promise.all(candlePromises);

	const candlesByTimeframe: CandlesByTimeframe = {};
	const candleMap = new Map<Timeframe, IndicatorCandle[]>();

	for (const [tf, candles] of candleResults) {
		candlesByTimeframe[tf] = candles;
		candleMap.set(tf, candles);
	}

	const primaryTimeframe = config.timeframes[0] ?? "1h";
	const primaryCandles = candlesByTimeframe[primaryTimeframe] ?? [];
	const latestCandle = primaryCandles[primaryCandles.length - 1];

	if (!latestCandle) {
		throw new Error(
			`No candle data available for ${symbol} at ${new Date(timestamp).toISOString()}`
		);
	}

	const indicatorSnapshot = calculateMultiTimeframeIndicators(primaryCandles, indicatorConfig);
	// Flatten multi-timeframe indicators to flat key-value map
	const indicators: IndicatorValues = {};
	for (const [timeframe, values] of Object.entries(indicatorSnapshot)) {
		for (const [key, value] of Object.entries(values)) {
			indicators[`${key}_${timeframe}`] = value;
		}
	}

	let normalized: NormalizedValues = {};
	if (config.includeNormalized) {
		const transformResult = applyTransforms(
			primaryCandles,
			primaryTimeframe,
			DEFAULT_TRANSFORM_CONFIG
		);
		normalized = transformResult ?? {};
	}

	const regimeInput = { candles: primaryCandles };
	const regime: RegimeClassification = classifyRegime(regimeInput, DEFAULT_RULE_BASED_CONFIG);

	let recentEvents: ExternalEventSummary[] = [];
	if (config.includeEvents && sources.events) {
		recentEvents = await sources.events.getRecentEvents(
			symbol,
			config.eventLookbackHours,
			config.maxEvents
		);
	}

	let metadata: UniverseMetadata = { symbol };
	if (sources.universe) {
		const resolved = await sources.universe.getMetadata(symbol);
		if (resolved) {
			metadata = {
				symbol: resolved.symbol,
				name: resolved.name,
				sector: resolved.sector,
				industry: resolved.industry,
				marketCap: resolved.marketCap,
				marketCapBucket: classifyMarketCap(resolved.marketCap),
				avgVolume: resolved.avgVolume,
				price: resolved.price ?? latestCandle.close,
			};
		}
	}

	const snapshot: FeatureSnapshot = {
		symbol,
		timestamp,
		createdAt: new Date().toISOString(),
		candles: candlesByTimeframe,
		latestPrice: latestCandle.close,
		latestVolume: latestCandle.volume,
		indicators,
		normalized,
		regime,
		recentEvents,
		metadata,
		config: {
			lookbackWindow: config.lookbackWindow,
			timeframes: config.timeframes,
			eventLookbackHours: config.eventLookbackHours,
		},
	};

	if (useCache) {
		cache.set(snapshot);
	}

	return snapshot;
}

/**
 * Build snapshots for multiple symbols in parallel.
 *
 * @param symbols - Array of ticker symbols
 * @param timestamp - Unix timestamp in milliseconds
 * @param sources - Data sources
 * @param options - Build options
 * @returns Map of symbol to feature snapshot
 */
export async function buildSnapshots(
	symbols: string[],
	timestamp: number,
	sources: SnapshotDataSources,
	options: BuildSnapshotOptions = {}
): Promise<Map<string, FeatureSnapshot>> {
	const results = await Promise.allSettled(
		symbols.map((symbol) => buildSnapshot(symbol, timestamp, sources, options))
	);

	const snapshots = new Map<string, FeatureSnapshot>();

	for (let i = 0; i < symbols.length; i++) {
		const result = results[i];
		const symbol = symbols[i];
		if (result && result.status === "fulfilled" && symbol) {
			snapshots.set(symbol, result.value);
		}
	}

	return snapshots;
}

/**
 * Create a mock candle data source for testing.
 */
export function createMockCandleSource(
	candlesBySymbol: Map<string, Map<Timeframe, IndicatorCandle[]>>
): CandleDataSource {
	return {
		async getCandles(
			symbol: string,
			timeframe: Timeframe,
			limit: number,
			_before?: number
		): Promise<IndicatorCandle[]> {
			const symbolCandles = candlesBySymbol.get(symbol);
			if (!symbolCandles) {
				return [];
			}

			const tfCandles = symbolCandles.get(timeframe);
			if (!tfCandles) {
				return [];
			}

			return tfCandles.slice(-limit);
		},
	};
}

/**
 * Create a mock event source for testing.
 */
export function createMockEventSource(
	eventsBySymbol: Map<string, ExternalEventSummary[]>
): ExternalEventSource {
	return {
		async getRecentEvents(
			symbol: string,
			_lookbackHours: number,
			limit: number
		): Promise<ExternalEventSummary[]> {
			const events = eventsBySymbol.get(symbol) ?? [];
			return events.slice(0, limit);
		},
	};
}

/**
 * Create a mock universe source for testing.
 */
export function createMockUniverseSource(
	metadataBySymbol: Map<string, ResolvedInstrument>
): UniverseMetadataSource {
	return {
		async getMetadata(symbol: string): Promise<ResolvedInstrument | null> {
			return metadataBySymbol.get(symbol) ?? null;
		},
	};
}

/**
 * Serialize a snapshot to a compact JSON format for LLM consumption.
 * Removes null values and rounds numbers to reduce token usage.
 *
 * @param snapshot - Feature snapshot
 * @param precision - Decimal precision for numbers (default: 4)
 * @returns Compact JSON string
 */
export function serializeSnapshot(snapshot: FeatureSnapshot, precision = 4): string {
	const compacted = compactSnapshot(snapshot, precision);
	return JSON.stringify(compacted);
}

/**
 * Create a compact version of the snapshot.
 * Removes null values and rounds numbers.
 */
export function compactSnapshot(snapshot: FeatureSnapshot, precision = 4): Record<string, unknown> {
	const round = (n: number | null): number | null => {
		if (n === null || n === undefined) {
			return null;
		}
		return Number(n.toFixed(precision));
	};

	const compactValues = (values: Record<string, number | null>): Record<string, number> => {
		const result: Record<string, number> = {};
		for (const [key, value] of Object.entries(values)) {
			const rounded = round(value);
			if (rounded !== null) {
				result[key] = rounded;
			}
		}
		return result;
	};

	return {
		symbol: snapshot.symbol,
		timestamp: snapshot.timestamp,
		price: round(snapshot.latestPrice),
		volume: snapshot.latestVolume,
		regime: {
			label: snapshot.regime.regime,
			confidence: round(snapshot.regime.confidence),
		},
		indicators: compactValues(snapshot.indicators),
		normalized: compactValues(snapshot.normalized),
		events: snapshot.recentEvents.length,
		metadata: {
			sector: snapshot.metadata.sector,
			marketCap: snapshot.metadata.marketCapBucket,
		},
	};
}

/**
 * Get a summary string for logging/debugging.
 */
export function getSnapshotSummary(snapshot: FeatureSnapshot): string {
	const indicatorCount = Object.keys(snapshot.indicators).length;
	const normalizedCount = Object.keys(snapshot.normalized).length;

	return [
		`${snapshot.symbol} @ ${new Date(snapshot.timestamp).toISOString()}`,
		`Price: ${snapshot.latestPrice.toFixed(2)}`,
		`Regime: ${snapshot.regime.regime} (${(snapshot.regime.confidence * 100).toFixed(0)}%)`,
		`Indicators: ${indicatorCount}`,
		`Normalized: ${normalizedCount}`,
		`Events: ${snapshot.recentEvents.length}`,
		`Sector: ${snapshot.metadata.sector ?? "N/A"}`,
	].join(" | ");
}
