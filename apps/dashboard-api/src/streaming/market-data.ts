/**
 * Market Data Streaming Service
 *
 * Connects to alpaca-stream-proxy via gRPC for real-time market data
 * and broadcasts updates to connected dashboard clients.
 *
 * @see docs/plans/ui/06-websocket.md
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import {
	type AlpacaMarketDataClient,
	createAlpacaClientFromEnv,
	isAlpacaConfigured,
} from "@cream/marketdata";
import log from "../logger.js";
import { broadcastAggregate, broadcastQuote, broadcastTrade } from "../websocket/handler.js";
import {
	type StockBar,
	type StockQuote,
	type StockTrade,
	streamBars,
	streamQuotes,
	streamTrades,
} from "./proxy-client.js";

// Alpaca REST client for fetching previous close (snapshots)
let alpacaClient: AlpacaMarketDataClient | null = null;

function getAlpacaClient(): AlpacaMarketDataClient | null {
	if (alpacaClient) {
		return alpacaClient;
	}
	if (!isAlpacaConfigured()) {
		return null;
	}
	alpacaClient = createAlpacaClientFromEnv();
	return alpacaClient;
}

// ============================================
// State
// ============================================

let isInitialized = false;
let proxyAbortController: AbortController | null = null;
let proxyStreamsRunning = false;

/**
 * Active symbol subscriptions from dashboard clients.
 * When a client subscribes to a symbol, we add it here.
 */
const activeSymbols = new Set<string>();

/**
 * Quote cache - stores latest quote data per symbol
 * for new clients that subscribe.
 */
const quoteCache = new Map<
	string,
	{
		bid: number;
		ask: number;
		last: number;
		volume: number;
		prevClose: number;
		timestamp: Date;
	}
>();

// ============================================
// Initialization
// ============================================

/**
 * Initialize the market data streaming service.
 * Sets up configuration but does NOT connect until first subscription.
 */
export async function initMarketDataStreaming(): Promise<void> {
	if (isInitialized) {
		return;
	}

	isInitialized = true;
	log.info("Market data streaming initialized (will connect on first subscription)");
}

/**
 * Ensure the streaming connection is established.
 * Called lazily when first subscription is requested.
 */
async function ensureConnected(): Promise<boolean> {
	if (proxyStreamsRunning) {
		return true;
	}

	proxyAbortController = new AbortController();
	const signal = proxyAbortController.signal;

	// Start proxy stream consumers (fire-and-forget, they run in background)
	startProxyQuoteStream(signal);
	startProxyTradeStream(signal);
	startProxyBarStream(signal);

	proxyStreamsRunning = true;
	log.info("Market data streaming connected via proxy");
	return true;
}

/**
 * Start the proxy quote stream consumer.
 */
async function startProxyQuoteStream(signal: AbortSignal): Promise<void> {
	try {
		const symbols = Array.from(activeSymbols);
		for await (const quote of streamQuotes(symbols, {
			signal,
			onReconnect: (attempt) => {
				log.info({ attempt }, "Proxy quotes stream reconnecting");
			},
			onError: (error) => {
				log.error({ error: error.message }, "Proxy quotes stream error");
			},
		})) {
			handleProxyQuote(quote);
		}
	} catch (error) {
		if (!signal.aborted) {
			log.error({ error }, "Proxy quotes stream failed");
		}
	}
}

/**
 * Start the proxy trade stream consumer.
 */
async function startProxyTradeStream(signal: AbortSignal): Promise<void> {
	try {
		const symbols = Array.from(activeSymbols);
		for await (const trade of streamTrades(symbols, {
			signal,
			onReconnect: (attempt) => {
				log.info({ attempt }, "Proxy trades stream reconnecting");
			},
			onError: (error) => {
				log.error({ error: error.message }, "Proxy trades stream error");
			},
		})) {
			handleProxyTrade(trade);
		}
	} catch (error) {
		if (!signal.aborted) {
			log.error({ error }, "Proxy trades stream failed");
		}
	}
}

/**
 * Start the proxy bar stream consumer.
 */
async function startProxyBarStream(signal: AbortSignal): Promise<void> {
	try {
		const symbols = Array.from(activeSymbols);
		for await (const bar of streamBars(symbols, {
			signal,
			onReconnect: (attempt) => {
				log.info({ attempt }, "Proxy bars stream reconnecting");
			},
			onError: (error) => {
				log.error({ error: error.message }, "Proxy bars stream error");
			},
		})) {
			handleProxyBar(bar);
		}
	} catch (error) {
		if (!signal.aborted) {
			log.error({ error }, "Proxy bars stream failed");
		}
	}
}

/**
 * Handle a quote from the proxy stream.
 */
function handleProxyQuote(quote: StockQuote): void {
	const symbol = quote.symbol.toUpperCase();

	// Skip if not subscribed (proxy streams all symbols)
	if (activeSymbols.size > 0 && !activeSymbols.has(symbol)) {
		return;
	}

	// Get cached data for last price, volume, and prevClose
	const cached = quoteCache.get(symbol);
	const last = cached?.last ?? (quote.bidPrice + quote.askPrice) / 2;
	const prevClose = cached?.prevClose ?? last;
	const timestamp = quote.timestamp ? new Date(Number(quote.timestamp.seconds) * 1000) : new Date();

	// Update cache
	quoteCache.set(symbol, {
		bid: quote.bidPrice,
		ask: quote.askPrice,
		last,
		volume: cached?.volume ?? 0,
		prevClose,
		timestamp,
	});

	// Calculate change percent
	const changePercent = prevClose > 0 ? ((last - prevClose) / prevClose) * 100 : 0;

	// Broadcast to subscribed clients
	broadcastQuote(symbol, {
		type: "quote",
		data: {
			symbol,
			bid: quote.bidPrice,
			ask: quote.askPrice,
			last,
			bidSize: quote.bidSize,
			askSize: quote.askSize,
			volume: cached?.volume ?? 0,
			prevClose,
			changePercent,
			timestamp: timestamp.toISOString(),
		},
	});
}

/**
 * Handle a trade from the proxy stream.
 */
function handleProxyTrade(trade: StockTrade): void {
	const symbol = trade.symbol.toUpperCase();

	// Skip if not subscribed
	if (activeSymbols.size > 0 && !activeSymbols.has(symbol)) {
		return;
	}

	const timestamp = trade.timestamp ? new Date(Number(trade.timestamp.seconds) * 1000) : new Date();

	// Broadcast to subscribed clients
	broadcastTrade(symbol, {
		type: "trade",
		data: {
			ev: "T",
			sym: symbol,
			p: trade.price,
			s: trade.size,
			x: trade.exchange ? exchangeCodeToId(trade.exchange) : 0,
			c: [],
			t: timestamp.getTime() * 1e6, // Nanoseconds
			i: trade.tradeId?.toString() ?? `${symbol}-${timestamp.getTime()}`,
		},
	});
}

/**
 * Handle a bar from the proxy stream.
 */
function handleProxyBar(bar: StockBar): void {
	const symbol = bar.symbol.toUpperCase();

	// Skip if not subscribed
	if (activeSymbols.size > 0 && !activeSymbols.has(symbol)) {
		return;
	}

	const timestamp = bar.timestamp ? new Date(Number(bar.timestamp.seconds) * 1000) : new Date();

	// Get cached prevClose
	const cached = quoteCache.get(symbol);
	const prevClose = cached?.prevClose ?? bar.close;

	// Update cache
	quoteCache.set(symbol, {
		bid: bar.close,
		ask: bar.close,
		last: bar.close,
		volume: Number(bar.volume),
		prevClose,
		timestamp,
	});

	// Calculate change percent
	const changePercent = prevClose > 0 ? ((bar.close - prevClose) / prevClose) * 100 : 0;

	// Broadcast quote update from bar
	broadcastQuote(symbol, {
		type: "quote",
		data: {
			symbol,
			bid: bar.close,
			ask: bar.close,
			last: bar.close,
			volume: Number(bar.volume),
			prevClose,
			changePercent,
			timestamp: timestamp.toISOString(),
		},
	});

	// Broadcast aggregate candle
	broadcastAggregate(symbol, {
		type: "aggregate",
		data: {
			symbol,
			open: bar.open,
			high: bar.high,
			low: bar.low,
			close: bar.close,
			volume: Number(bar.volume),
			vwap: bar.vwap ?? 0,
			timestamp: timestamp.toISOString(),
			endTimestamp: timestamp.toISOString(),
		},
	});
}

/**
 * Shutdown the market data streaming service.
 */
export function shutdownMarketDataStreaming(): void {
	log.info({ activeSymbols: activeSymbols.size }, "Shutting down market data streaming");

	if (proxyAbortController) {
		proxyAbortController.abort();
		proxyAbortController = null;
	}
	proxyStreamsRunning = false;

	isInitialized = false;
	activeSymbols.clear();
	quoteCache.clear();
	log.info("Market data streaming shutdown complete");
}

// ============================================
// Helpers
// ============================================

/**
 * Convert exchange code to numeric ID for backwards compatibility.
 */
function exchangeCodeToId(exchange: string): number {
	const exchangeMap: Record<string, number> = {
		A: 1, // NYSE American
		B: 2, // NASDAQ OMX BX
		C: 3, // NYSE National
		D: 4, // FINRA ADF
		H: 5, // MIAX
		I: 6, // ISE
		J: 7, // Cboe EDGA
		K: 8, // Cboe EDGX
		L: 9, // LTSE
		M: 10, // NYSE Chicago
		N: 11, // NYSE
		P: 12, // NYSE Arca
		Q: 13, // NASDAQ
		S: 14, // NASDAQ TRF
		T: 15, // NASDAQ TRF
		U: 16, // MEMX
		V: 17, // IEX
		W: 18, // CBSX
		X: 19, // NASDAQ PSX
		Y: 20, // Cboe BYX
		Z: 21, // Cboe BZX
	};
	return exchangeMap[exchange] ?? 0;
}

// ============================================
// Symbol Management
// ============================================

/**
 * Subscribe to market data for a symbol.
 * Called when a dashboard client subscribes to quotes for a symbol.
 * Lazily connects to proxy on first subscription.
 * Fetches previous close to enable accurate change percent calculation.
 */
export async function subscribeSymbol(symbol: string): Promise<void> {
	const upperSymbol = symbol.toUpperCase();

	if (activeSymbols.has(upperSymbol)) {
		return; // Already subscribed
	}

	activeSymbols.add(upperSymbol);

	// Fetch snapshot to seed the cache with proper prevClose
	const client = getAlpacaClient();
	if (client && !quoteCache.has(upperSymbol)) {
		client
			.getSnapshots([upperSymbol])
			.then((snapshots) => {
				const snapshot = snapshots.get(upperSymbol);
				if (snapshot && !quoteCache.has(upperSymbol)) {
					const dailyBar = snapshot.dailyBar;
					const prevBar = snapshot.prevDailyBar;
					const latestTrade = snapshot.latestTrade;
					const latestQuote = snapshot.latestQuote;

					const lastPrice = latestTrade?.price ?? dailyBar?.close ?? 0;
					quoteCache.set(upperSymbol, {
						bid: latestQuote?.bidPrice ?? dailyBar?.close ?? 0,
						ask: latestQuote?.askPrice ?? dailyBar?.close ?? 0,
						last: lastPrice,
						volume: dailyBar?.volume ?? 0,
						prevClose: prevBar?.close ?? lastPrice,
						timestamp: dailyBar?.timestamp ? new Date(dailyBar.timestamp) : new Date(),
					});
				}
			})
			.catch(() => {});
	}

	// Connect lazily on first subscription
	await ensureConnected();
}

/**
 * Subscribe to multiple symbols at once.
 * Lazily connects to proxy on first subscription.
 * Fetches previous close for new symbols to enable accurate change percent calculation.
 */
export async function subscribeSymbols(symbols: string[]): Promise<void> {
	const newSymbols = symbols.map((s) => s.toUpperCase()).filter((s) => !activeSymbols.has(s));

	if (newSymbols.length === 0) {
		return;
	}

	for (const symbol of newSymbols) {
		activeSymbols.add(symbol);
	}

	// Fetch snapshots for new symbols to seed the cache with proper prevClose
	const client = getAlpacaClient();
	if (client) {
		// Fetch in parallel but don't block subscription
		client
			.getSnapshots(newSymbols)
			.then((snapshots) => {
				for (const [symbol, snapshot] of snapshots) {
					if (!quoteCache.has(symbol)) {
						const dailyBar = snapshot.dailyBar;
						const prevBar = snapshot.prevDailyBar;
						const latestTrade = snapshot.latestTrade;
						const latestQuote = snapshot.latestQuote;

						const lastPrice = latestTrade?.price ?? dailyBar?.close ?? 0;
						quoteCache.set(symbol, {
							bid: latestQuote?.bidPrice ?? dailyBar?.close ?? 0,
							ask: latestQuote?.askPrice ?? dailyBar?.close ?? 0,
							last: lastPrice,
							volume: dailyBar?.volume ?? 0,
							prevClose: prevBar?.close ?? lastPrice,
							timestamp: dailyBar?.timestamp ? new Date(dailyBar.timestamp) : new Date(),
						});
					}
				}
			})
			.catch(() => {});
	}

	// Connect lazily on first subscription
	await ensureConnected();
}

/**
 * Unsubscribe from market data for a symbol.
 * Called when no dashboard clients are subscribed to a symbol anymore.
 */
export function unsubscribeSymbol(symbol: string): void {
	const upperSymbol = symbol.toUpperCase();

	if (!activeSymbols.has(upperSymbol)) {
		return; // Not subscribed
	}

	activeSymbols.delete(upperSymbol);
	quoteCache.delete(upperSymbol);
}

/**
 * Get the cached quote for a symbol.
 */
export function getCachedQuote(symbol: string): {
	bid: number;
	ask: number;
	last: number;
	volume: number;
	prevClose: number;
	timestamp: Date;
} | null {
	return quoteCache.get(symbol.toUpperCase()) ?? null;
}

/**
 * Get all actively subscribed symbols.
 */
export function getActiveSymbols(): string[] {
	return Array.from(activeSymbols);
}

/**
 * Check if streaming is initialized and connected.
 */
export function isStreamingConnected(): boolean {
	return isInitialized && proxyStreamsRunning;
}

// ============================================
// Default Export
// ============================================

export default {
	initMarketDataStreaming,
	shutdownMarketDataStreaming,
	subscribeSymbol,
	subscribeSymbols,
	unsubscribeSymbol,
	getCachedQuote,
	getActiveSymbols,
	isStreamingConnected,
};
