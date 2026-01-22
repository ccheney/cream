/**
 * Candle Ingestion Service
 *
 * Orchestrates fetching OHLCV candles from Alpaca API
 * and storing them in PostgreSQL database.
 *
 * @see docs/plans/02-data-layer.md
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import { z } from "zod";
import type { AlpacaBar, AlpacaMarketDataClient, AlpacaTimeframe } from "../providers/alpaca";

// ============================================
// Types
// ============================================

export const TimeframeSchema = z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"]);
export type Timeframe = z.infer<typeof TimeframeSchema>;

export const CandleSchema = z.object({
	symbol: z.string(),
	timeframe: TimeframeSchema,
	timestamp: z.string().datetime(),
	open: z.number(),
	high: z.number(),
	low: z.number(),
	close: z.number(),
	volume: z.number(),
	vwap: z.number().nullable(),
	tradeCount: z.number().nullable(),
	adjusted: z.boolean(),
});
export type Candle = z.infer<typeof CandleSchema>;

export interface IngestionResult {
	symbol: string;
	timeframe: Timeframe;
	candlesFetched: number;
	candlesStored: number;
	gaps: GapInfo[];
	errors: string[];
	durationMs: number;
}

export interface GapInfo {
	expectedTimestamp: string;
	previousTimestamp: string;
	gapMinutes: number;
}

export interface IngestionOptions {
	/** Start date (YYYY-MM-DD) */
	from: string;
	/** End date (YYYY-MM-DD) */
	to: string;
	/** Timeframe */
	timeframe: Timeframe;
	/** Whether to detect gaps */
	detectGaps?: boolean;
	/** Maximum gap size to tolerate (minutes) */
	maxGapMinutes?: number;
	/** Skip holidays and weekends */
	skipNonTradingDays?: boolean;
}

// ============================================
// Timeframe Mapping
// ============================================

const TIMEFRAME_TO_ALPACA: Record<Timeframe, AlpacaTimeframe> = {
	"1m": "1Min",
	"5m": "5Min",
	"15m": "15Min",
	"30m": "30Min",
	"1h": "1Hour",
	"4h": "4Hour",
	"1d": "1Day",
	"1w": "1Week",
};

const TIMEFRAME_MINUTES: Record<Timeframe, number> = {
	"1m": 1,
	"5m": 5,
	"15m": 15,
	"30m": 30,
	"1h": 60,
	"4h": 240,
	"1d": 1440,
	"1w": 10080,
};

// ============================================
// Candle Ingestion Service
// ============================================

export interface CandleStorage {
	upsert(candle: Candle): Promise<void>;
	bulkUpsert(candles: Candle[]): Promise<number>;
	getLastCandle(symbol: string, timeframe: Timeframe): Promise<Candle | null>;
}

export class CandleIngestionService {
	constructor(
		private alpacaClient: AlpacaMarketDataClient,
		private storage: CandleStorage,
	) {}

	/**
	 * Ingest candles for a single symbol
	 */
	async ingestSymbol(symbol: string, options: IngestionOptions): Promise<IngestionResult> {
		const startTime = Date.now();
		const result: IngestionResult = {
			symbol,
			timeframe: options.timeframe,
			candlesFetched: 0,
			candlesStored: 0,
			gaps: [],
			errors: [],
			durationMs: 0,
		};

		try {
			// Fetch from Alpaca
			const alpacaTimeframe = TIMEFRAME_TO_ALPACA[options.timeframe];
			const bars = await this.alpacaClient.getBars(
				symbol,
				alpacaTimeframe,
				options.from,
				options.to,
				50000,
			);

			if (bars.length === 0) {
				result.errors.push(`No candles returned for ${symbol}`);
				result.durationMs = Date.now() - startTime;
				return result;
			}

			result.candlesFetched = bars.length;

			// Convert to candles
			const candles = this.convertToCandles(symbol, options.timeframe, bars);

			// Detect gaps if requested
			if (options.detectGaps !== false) {
				const gaps = this.detectGaps(
					candles,
					TIMEFRAME_MINUTES[options.timeframe],
					options.maxGapMinutes ?? TIMEFRAME_MINUTES[options.timeframe] * 2,
				);
				result.gaps = gaps;
			}

			// Store in database
			result.candlesStored = await this.storage.bulkUpsert(candles);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			result.errors.push(message);
		}

		result.durationMs = Date.now() - startTime;
		return result;
	}

	/**
	 * Ingest candles for multiple symbols
	 */
	async ingestUniverse(
		symbols: string[],
		options: IngestionOptions,
		concurrency = 5,
	): Promise<Map<string, IngestionResult>> {
		const results = new Map<string, IngestionResult>();

		// Process in batches to respect rate limits
		for (let i = 0; i < symbols.length; i += concurrency) {
			const batch = symbols.slice(i, i + concurrency);
			const batchPromises = batch.map((symbol) => this.ingestSymbol(symbol, options));
			const batchResults = await Promise.all(batchPromises);

			for (let j = 0; j < batch.length; j++) {
				const symbol = batch[j];
				const result = batchResults[j];
				if (symbol && result) {
					results.set(symbol, result);
				}
			}

			// Small delay between batches to avoid rate limits
			if (i + concurrency < symbols.length) {
				await sleep(200);
			}
		}

		return results;
	}

	/**
	 * Backfill historical candles from a start date
	 */
	async backfill(
		symbol: string,
		timeframe: Timeframe,
		startDate: string,
		endDate?: string,
	): Promise<IngestionResult> {
		const end = endDate ?? new Date().toISOString().split("T")[0] ?? "";
		return this.ingestSymbol(symbol, {
			from: startDate,
			to: end,
			timeframe,
			detectGaps: true,
		});
	}

	/**
	 * Incremental update: fetch candles since last stored candle
	 */
	async incrementalUpdate(symbol: string, timeframe: Timeframe): Promise<IngestionResult> {
		const lastCandle = await this.storage.getLastCandle(symbol, timeframe);

		let from: string;
		if (lastCandle) {
			const lastDate = new Date(lastCandle.timestamp);
			lastDate.setDate(lastDate.getDate() - 1);
			from = lastDate.toISOString().split("T")[0] ?? "";
		} else {
			const thirtyDaysAgo = new Date();
			thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
			from = thirtyDaysAgo.toISOString().split("T")[0] ?? "";
		}

		const to = new Date().toISOString().split("T")[0] ?? "";

		return this.ingestSymbol(symbol, {
			from,
			to,
			timeframe,
			detectGaps: true,
		});
	}

	/**
	 * Convert Alpaca bars to Candle format
	 */
	private convertToCandles(symbol: string, timeframe: Timeframe, bars: AlpacaBar[]): Candle[] {
		return bars.map((bar) => ({
			symbol,
			timeframe,
			timestamp: bar.timestamp,
			open: bar.open,
			high: bar.high,
			low: bar.low,
			close: bar.close,
			volume: bar.volume,
			vwap: bar.vwap ?? null,
			tradeCount: bar.tradeCount ?? null,
			adjusted: true,
		}));
	}

	/**
	 * Detect gaps in candle data
	 */
	private detectGaps(
		candles: Candle[],
		expectedIntervalMinutes: number,
		maxGapMinutes: number,
	): GapInfo[] {
		const gaps: GapInfo[] = [];

		for (let i = 1; i < candles.length; i++) {
			const prev = candles[i - 1];
			const curr = candles[i];
			if (!prev || !curr) {
				continue;
			}

			const prevTime = new Date(prev.timestamp).getTime();
			const currTime = new Date(curr.timestamp).getTime();
			const diffMinutes = (currTime - prevTime) / (1000 * 60);

			// Only flag gaps larger than expected interval * 1.5
			// This accounts for minor timing variations
			if (diffMinutes > expectedIntervalMinutes * 1.5 && diffMinutes <= maxGapMinutes * 10) {
				gaps.push({
					expectedTimestamp: new Date(prevTime + expectedIntervalMinutes * 60000).toISOString(),
					previousTimestamp: prev.timestamp,
					gapMinutes: diffMinutes,
				});
			}
		}

		return gaps;
	}
}

// ============================================
// Staleness Detection
// ============================================

export interface StalenessResult {
	symbol: string;
	timeframe: Timeframe;
	lastTimestamp: string | null;
	isStale: boolean;
	staleMinutes: number;
}

/**
 * Check if candle data is stale
 */
export function checkStaleness(
	lastCandle: Candle | null,
	timeframe: Timeframe,
	maxStaleMinutes?: number,
): StalenessResult {
	const defaultMaxStale = TIMEFRAME_MINUTES[timeframe] * 2;
	const threshold = maxStaleMinutes ?? defaultMaxStale;

	if (!lastCandle) {
		return {
			symbol: "",
			timeframe,
			lastTimestamp: null,
			isStale: true,
			staleMinutes: Infinity,
		};
	}

	const lastTime = new Date(lastCandle.timestamp).getTime();
	const now = Date.now();
	const staleMinutes = (now - lastTime) / (1000 * 60);

	return {
		symbol: lastCandle.symbol,
		timeframe,
		lastTimestamp: lastCandle.timestamp,
		isStale: staleMinutes > threshold,
		staleMinutes,
	};
}

// ============================================
// Utilities
// ============================================

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate derived timeframes from base candles
 */
export function aggregateCandles(candles: Candle[], targetTimeframe: Timeframe): Candle[] {
	if (candles.length === 0) {
		return [];
	}

	const firstCandle = candles[0];
	if (!firstCandle) {
		return [];
	}
	const targetMinutes = TIMEFRAME_MINUTES[targetTimeframe];
	const sourceMinutes = TIMEFRAME_MINUTES[firstCandle.timeframe];

	if (targetMinutes <= sourceMinutes) {
		throw new Error(
			`Cannot aggregate to smaller timeframe: ${firstCandle.timeframe} -> ${targetTimeframe}`,
		);
	}

	const ratio = targetMinutes / sourceMinutes;
	const aggregated: Candle[] = [];

	for (let i = 0; i < candles.length; i += ratio) {
		const group = candles.slice(i, i + ratio);
		const first = group[0];
		const last = group[group.length - 1];
		if (!first || !last) {
			continue;
		}

		aggregated.push({
			symbol: first.symbol,
			timeframe: targetTimeframe,
			timestamp: first.timestamp,
			open: first.open,
			high: Math.max(...group.map((c) => c.high)),
			low: Math.min(...group.map((c) => c.low)),
			close: last.close,
			volume: group.reduce((sum, c) => sum + c.volume, 0),
			vwap: calculateVWAP(group),
			tradeCount: group.reduce((sum, c) => sum + (c.tradeCount ?? 0), 0) || null,
			adjusted: first.adjusted,
		});
	}

	return aggregated;
}

function calculateVWAP(candles: Candle[]): number | null {
	const validCandles = candles.filter((c) => c.vwap !== null && c.volume > 0);
	if (validCandles.length === 0) {
		return null;
	}

	const totalVolume = validCandles.reduce((sum, c) => sum + c.volume, 0);
	const weightedSum = validCandles.reduce((sum, c) => sum + (c.vwap ?? 0) * c.volume, 0);

	return totalVolume > 0 ? weightedSum / totalVolume : null;
}
