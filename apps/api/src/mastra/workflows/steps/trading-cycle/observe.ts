/**
 * Observe Phase
 *
 * Market data fetching for the trading cycle workflow.
 * Now includes indicator calculation via IndicatorService.
 */

import type { ExecutionContext } from "@cream/domain";
import { createCalendarService, isTest } from "@cream/domain";
import {
	createLiquidityCalculator,
	createPriceCalculator,
	IndicatorService,
	type IndicatorSnapshot,
	type MarketDataProvider,
	type OHLCVBar,
	type Quote,
	type TradingSession,
} from "@cream/indicators";
import {
	type AdapterCandle,
	createMarketDataAdapter,
	type MarketDataAdapter,
} from "@cream/marketdata";
import {
	FIXTURE_TIMESTAMP,
	getCandleFixtures,
	getSnapshotFixture,
} from "../../../../../fixtures/market/index.js";
import { log } from "./logger.js";
import type { CandleData, MarketSnapshot, QuoteData } from "./types.js";

// ============================================
// Adapter: MarketDataAdapter -> MarketDataProvider
// ============================================

/**
 * Wraps the marketdata adapter to provide the MarketDataProvider interface
 * required by IndicatorService.
 */
class MarketDataProviderAdapter implements MarketDataProvider {
	constructor(private readonly adapter: MarketDataAdapter) {}

	async getBars(symbol: string, limit: number): Promise<OHLCVBar[]> {
		const toDate = new Date();
		const daysNeeded = Math.ceil(limit / 24) + 14; // +14 days buffer for 1h bars
		const fromDate = new Date(toDate.getTime() - daysNeeded * 24 * 60 * 60 * 1000);

		const candles = await this.adapter.getCandles(
			symbol,
			"1h",
			fromDate.toISOString().slice(0, 10),
			toDate.toISOString().slice(0, 10)
		);

		return candles.slice(-limit).map(this.candleToBar);
	}

	async getQuote(symbol: string): Promise<Quote | null> {
		const adapterQuote = await this.adapter.getQuote(symbol);
		if (!adapterQuote) {
			return null;
		}

		return {
			timestamp: adapterQuote.timestamp,
			bidPrice: adapterQuote.bid,
			bidSize: adapterQuote.bidSize,
			askPrice: adapterQuote.ask,
			askSize: adapterQuote.askSize,
		};
	}

	private candleToBar(candle: AdapterCandle): OHLCVBar {
		return {
			timestamp: candle.timestamp,
			open: candle.open,
			high: candle.high,
			low: candle.low,
			close: candle.close,
			volume: candle.volume,
		};
	}
}

// ============================================
// Market Data Fetching
// ============================================

/**
 * Fetch market snapshot for the given instruments.
 *
 * In test mode (source: "test"), uses deterministic fixture data for reproducible behavior.
 * In PAPER/LIVE mode, fetches real market data via the market data adapter
 * and calculates indicators via IndicatorService.
 *
 * @param instruments - Array of ticker symbols
 * @param ctx - Execution context for environment detection
 * @returns Market snapshot with candles, quotes, and indicators for each instrument
 */
export async function fetchMarketSnapshot(
	instruments: string[],
	ctx?: ExecutionContext
): Promise<MarketSnapshot> {
	if (ctx && isTest(ctx)) {
		return fetchFixtureSnapshot(instruments);
	}

	const adapter = createMarketDataAdapter(ctx?.environment);

	const toDate = new Date();
	const fromDate = new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);
	const from = fromDate.toISOString().slice(0, 10);
	const to = toDate.toISOString().slice(0, 10);

	const timestamp = Date.now();
	const candles: Record<string, CandleData[]> = {};
	const quotes: Record<string, QuoteData> = {};

	for (const symbol of instruments) {
		const adapterCandles = await adapter.getCandles(symbol, "1h", from, to);
		candles[symbol] = adapterCandles.slice(-120).map((c) => ({
			timestamp: c.timestamp,
			open: c.open,
			high: c.high,
			low: c.low,
			close: c.close,
			volume: c.volume,
		}));
	}

	const adapterQuotes = await adapter.getQuotes(instruments);
	for (const symbol of instruments) {
		const quote = adapterQuotes.get(symbol);
		if (quote) {
			quotes[symbol] = {
				bid: quote.bid,
				ask: quote.ask,
				bidSize: quote.bidSize,
				askSize: quote.askSize,
				timestamp: quote.timestamp,
			};
		} else {
			const symbolCandles = candles[symbol];
			const lastCandle = symbolCandles?.[symbolCandles.length - 1];
			const lastPrice = lastCandle?.close ?? 100;
			const spread = lastPrice * 0.0002;
			quotes[symbol] = {
				bid: Number((lastPrice - spread / 2).toFixed(2)),
				ask: Number((lastPrice + spread / 2).toFixed(2)),
				bidSize: 100,
				askSize: 100,
				timestamp,
			};
		}
	}

	// Fetch indicators via IndicatorService (with trading session context)
	const indicators = await fetchIndicators(instruments, adapter, ctx);

	return {
		instruments,
		candles,
		quotes,
		indicators,
		timestamp,
	};
}

/**
 * Fetch indicator snapshots for the given instruments using IndicatorService.
 *
 * Creates an IndicatorService with the marketdata adapter wrapped as a
 * MarketDataProvider, then fetches snapshots for all symbols in parallel.
 * Also enriches each snapshot with the current trading session for
 * session-aware risk validation.
 *
 * @param instruments - Array of ticker symbols
 * @param adapter - Market data adapter to use
 * @param ctx - Execution context for calendar service
 * @returns Record of symbol to IndicatorSnapshot
 */
async function fetchIndicators(
	instruments: string[],
	adapter: MarketDataAdapter,
	ctx?: ExecutionContext
): Promise<Record<string, IndicatorSnapshot>> {
	const startTime = Date.now();

	// Wrap the marketdata adapter as a MarketDataProvider
	const marketDataProvider = new MarketDataProviderAdapter(adapter);

	// Create IndicatorService with price and liquidity calculators
	const indicatorService = new IndicatorService(
		{
			marketData: marketDataProvider,
			priceCalculator: createPriceCalculator(),
			liquidityCalculator: createLiquidityCalculator(),
		},
		{
			barsLookback: 200,
			includeBatchIndicators: false, // Batch indicators require DB repos
			includeOptionsIndicators: false, // Options require options data provider
			enableCache: true,
			bypassCache: false,
		}
	);

	// Get current trading session for session-aware spread checks
	let tradingSession: TradingSession = "RTH";
	try {
		const calendar = await createCalendarService({ mode: ctx?.environment });
		tradingSession = await calendar.getTradingSession(new Date());
	} catch (error) {
		log.warn({ error }, "Failed to get trading session, defaulting to RTH");
	}

	try {
		const snapshots = await indicatorService.getSnapshots(instruments);

		// Convert Map to Record and enrich with trading session
		const result: Record<string, IndicatorSnapshot> = {};
		for (const [symbol, snapshot] of snapshots) {
			// Enrich snapshot with trading session
			result[symbol] = {
				...snapshot,
				metadata: {
					...snapshot.metadata,
					trading_session: tradingSession,
				},
			};
		}

		log.debug(
			{
				count: instruments.length,
				duration: Date.now() - startTime,
				tradingSession,
			},
			"Fetched indicator snapshots"
		);

		return result;
	} catch (error) {
		log.error({ error }, "Failed to fetch indicator snapshots");
		return {};
	}
}

/**
 * Fetch market snapshot using deterministic fixture data (for test mode).
 */
export function fetchFixtureSnapshot(instruments: string[]): MarketSnapshot {
	const timestamp = FIXTURE_TIMESTAMP;
	const candles: Record<string, CandleData[]> = {};
	const quotes: Record<string, QuoteData> = {};

	for (const symbol of instruments) {
		const candleData = getCandleFixtures(symbol, 120);
		candles[symbol] = candleData;

		const snapshot = getSnapshotFixture(symbol);
		if (snapshot.lastQuote) {
			quotes[symbol] = {
				bid: snapshot.lastQuote.bid,
				ask: snapshot.lastQuote.ask,
				bidSize: snapshot.lastQuote.bidSize,
				askSize: snapshot.lastQuote.askSize,
				timestamp: snapshot.lastQuote.timestamp,
			};
		} else {
			const lastPrice = snapshot.lastTrade?.price ?? snapshot.open;
			const spread = lastPrice * 0.0002;
			quotes[symbol] = {
				bid: Number((lastPrice - spread / 2).toFixed(2)),
				ask: Number((lastPrice + spread / 2).toFixed(2)),
				bidSize: 100,
				askSize: 100,
				timestamp,
			};
		}
	}

	return {
		instruments,
		candles,
		quotes,
		timestamp,
	};
}
