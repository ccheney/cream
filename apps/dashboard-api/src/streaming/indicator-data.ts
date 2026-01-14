/**
 * Indicator Data Streaming Service
 *
 * Calculates and streams real-time indicator updates when new market data arrives.
 * Subscribes to bar updates from Alpaca WebSocket and recalculates price indicators.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import {
	createIndicatorService,
	type IndicatorService,
	type PriceIndicators,
} from "@cream/indicators";
import {
	AlpacaConnectionState,
	type AlpacaMarketDataClient,
	type AlpacaWebSocketClient,
	type AlpacaWsBarMessage,
	type AlpacaWsEvent,
	createAlpacaClientFromEnv,
	createAlpacaStocksClientFromEnv,
	isAlpacaConfigured,
} from "@cream/marketdata";
import log from "../logger.js";
import { broadcastIndicator } from "../websocket/channels.js";

// ============================================
// State
// ============================================

let alpacaRestClient: AlpacaMarketDataClient | null = null;
let alpacaWsClient: AlpacaWebSocketClient | null = null;
let indicatorService: IndicatorService | null = null;
let isInitialized = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Active symbol subscriptions from dashboard clients.
 * When a client subscribes to indicators for a symbol, we track it here.
 */
const activeSymbols = new Set<string>();

/**
 * Indicator cache - stores latest indicator data per symbol.
 */
const indicatorCache = new Map<
	string,
	{
		price: PriceIndicators;
		timestamp: Date;
	}
>();

// ============================================
// Helpers
// ============================================

function getAlpacaRestClient(): AlpacaMarketDataClient | null {
	if (alpacaRestClient) {
		return alpacaRestClient;
	}
	if (!isAlpacaConfigured()) {
		return null;
	}
	alpacaRestClient = createAlpacaClientFromEnv();
	return alpacaRestClient;
}

function getIndicatorService(): IndicatorService | null {
	if (indicatorService) {
		return indicatorService;
	}
	const client = getAlpacaRestClient();
	if (!client) {
		return null;
	}

	// Compute date range for bar lookback (200 days back)
	const endDate = new Date();
	const startDate = new Date();
	startDate.setDate(startDate.getDate() - 250); // Extra buffer for weekends/holidays

	indicatorService = createIndicatorService(
		{
			getBars: async (symbol: string, limit: number) => {
				const bars = await client.getBars(
					symbol,
					"1Day",
					startDate.toISOString().split("T")[0] ?? "",
					endDate.toISOString().split("T")[0] ?? "",
					limit
				);
				return bars.map((bar) => ({
					timestamp: new Date(bar.timestamp).getTime(),
					open: bar.open,
					high: bar.high,
					low: bar.low,
					close: bar.close,
					volume: bar.volume,
				}));
			},
			getQuote: async (symbol: string) => {
				const quote = await client.getQuote(symbol);
				if (!quote) {
					return null;
				}
				return {
					timestamp: new Date(quote.timestamp).getTime(),
					bidPrice: quote.bidPrice,
					bidSize: quote.bidSize,
					askPrice: quote.askPrice,
					askSize: quote.askSize,
				};
			},
		},
		{
			barsLookback: 200,
			includeBatchIndicators: false,
			includeOptionsIndicators: false,
			enableCache: true,
			bypassCache: false,
			batchConcurrency: 3,
		}
	);
	return indicatorService;
}

// ============================================
// Initialization
// ============================================

/**
 * Initialize the indicator data streaming service.
 * Connects to Alpaca WebSocket for bar updates and sets up indicator calculation.
 */
export async function initIndicatorDataStreaming(): Promise<void> {
	if (isInitialized) {
		return;
	}

	if (!isAlpacaConfigured()) {
		log.warn("ALPACA_KEY/ALPACA_SECRET not set, indicator data streaming disabled");
		return;
	}

	log.info("Initializing indicator data streaming with Alpaca");

	try {
		alpacaWsClient = createAlpacaStocksClientFromEnv("sip");
		alpacaWsClient.on(handleAlpacaEvent);
		await alpacaWsClient.connect();
		isInitialized = true;
		reconnectAttempts = 0;
		log.info("Indicator data streaming connected to Alpaca");
	} catch (error) {
		log.warn(
			{ error: error instanceof Error ? error.message : String(error) },
			"Indicator data streaming initialization failed"
		);
	}
}

/**
 * Shutdown the indicator data streaming service.
 */
export function shutdownIndicatorDataStreaming(): void {
	log.info({ activeSymbols: activeSymbols.size }, "Shutting down indicator data streaming");
	if (alpacaWsClient) {
		alpacaWsClient.disconnect();
		alpacaWsClient = null;
	}
	isInitialized = false;
	activeSymbols.clear();
	indicatorCache.clear();
	log.info("Indicator data streaming shutdown complete");
}

// ============================================
// Event Handlers
// ============================================

function handleAlpacaEvent(event: AlpacaWsEvent): void {
	switch (event.type) {
		case "connected":
			log.debug("Indicator streaming: Alpaca WebSocket connected");
			break;

		case "authenticated":
			log.info({ activeSymbols: activeSymbols.size }, "Indicator streaming: authenticated");
			if (activeSymbols.size > 0) {
				const symbols = Array.from(activeSymbols);
				alpacaWsClient?.subscribe("bars", symbols);
			}
			break;

		case "subscribed":
			log.debug({ subscriptions: event.subscriptions }, "Indicator streaming: subscribed");
			break;

		case "bar":
			handleBarMessage(event.message);
			break;

		case "disconnected":
			log.warn({ reason: event.reason }, "Indicator streaming: disconnected");
			break;

		case "reconnecting":
			reconnectAttempts = event.attempt;
			log.info(
				{ attempt: event.attempt, maxAttempts: MAX_RECONNECT_ATTEMPTS },
				"Indicator streaming: reconnecting"
			);
			break;

		case "error":
			log.error(
				{ code: event.code, message: event.message, reconnectAttempts },
				"Indicator streaming: error"
			);
			if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
				log.error("Max reconnect attempts reached, indicator streaming disabled");
				isInitialized = false;
			}
			break;
	}
}

/**
 * Handle bar messages from Alpaca.
 * Recalculates price indicators and broadcasts to subscribed clients.
 */
async function handleBarMessage(msg: AlpacaWsBarMessage): Promise<void> {
	const symbol = msg.S.toUpperCase();

	// Only process if we have subscribers
	if (!activeSymbols.has(symbol)) {
		return;
	}

	const service = getIndicatorService();
	if (!service) {
		log.warn({ symbol }, "No indicator service available");
		return;
	}

	try {
		// Invalidate cache and recalculate
		service.invalidateRealtimeCache(symbol);
		const priceIndicators = await service.getPriceIndicators(symbol);

		const now = new Date();

		// Update cache
		indicatorCache.set(symbol, {
			price: priceIndicators,
			timestamp: now,
		});

		// Broadcast to subscribed clients
		broadcastIndicator(symbol, {
			type: "indicator",
			data: {
				symbol,
				timestamp: now.toISOString(),
				price: {
					rsi_14: priceIndicators.rsi_14,
					atr_14: priceIndicators.atr_14,
					sma_20: priceIndicators.sma_20,
					sma_50: priceIndicators.sma_50,
					sma_200: priceIndicators.sma_200,
					ema_9: priceIndicators.ema_9,
					ema_12: priceIndicators.ema_12,
					ema_21: priceIndicators.ema_21,
					macd_line: priceIndicators.macd_line,
					macd_signal: priceIndicators.macd_signal,
					macd_histogram: priceIndicators.macd_histogram,
					bollinger_upper: priceIndicators.bollinger_upper,
					bollinger_middle: priceIndicators.bollinger_middle,
					bollinger_lower: priceIndicators.bollinger_lower,
					bollinger_bandwidth: priceIndicators.bollinger_bandwidth,
					stochastic_k: priceIndicators.stochastic_k,
					stochastic_d: priceIndicators.stochastic_d,
					momentum_1m: priceIndicators.momentum_1m,
					momentum_3m: priceIndicators.momentum_3m,
					momentum_12m: priceIndicators.momentum_12m,
					realized_vol_20d: priceIndicators.realized_vol_20d,
				},
			},
		});

		log.debug({ symbol, rsi: priceIndicators.rsi_14 }, "Broadcast indicator update");
	} catch (error) {
		log.warn(
			{ symbol, error: error instanceof Error ? error.message : String(error) },
			"Failed to calculate indicators"
		);
	}
}

// ============================================
// Symbol Management
// ============================================

/**
 * Subscribe to indicator updates for a symbol.
 */
export async function subscribeIndicatorSymbol(symbol: string): Promise<void> {
	const upperSymbol = symbol.toUpperCase();

	if (activeSymbols.has(upperSymbol)) {
		return;
	}

	activeSymbols.add(upperSymbol);

	// Fetch initial snapshot and cache it
	const service = getIndicatorService();
	if (service && !indicatorCache.has(upperSymbol)) {
		service
			.getPriceIndicators(upperSymbol)
			.then((priceIndicators) => {
				indicatorCache.set(upperSymbol, {
					price: priceIndicators,
					timestamp: new Date(),
				});
			})
			.catch(() => {});
	}

	if (alpacaWsClient?.isConnected()) {
		alpacaWsClient.subscribe("bars", [upperSymbol]);
	}
}

/**
 * Subscribe to multiple indicator symbols at once.
 */
export async function subscribeIndicatorSymbols(symbols: string[]): Promise<void> {
	const newSymbols = symbols.map((s) => s.toUpperCase()).filter((s) => !activeSymbols.has(s));

	if (newSymbols.length === 0) {
		return;
	}

	for (const symbol of newSymbols) {
		activeSymbols.add(symbol);
	}

	// Fetch initial snapshots
	const service = getIndicatorService();
	if (service) {
		for (const symbol of newSymbols) {
			if (!indicatorCache.has(symbol)) {
				service
					.getPriceIndicators(symbol)
					.then((priceIndicators) => {
						indicatorCache.set(symbol, {
							price: priceIndicators,
							timestamp: new Date(),
						});
					})
					.catch(() => {});
			}
		}
	}

	if (alpacaWsClient?.isConnected()) {
		alpacaWsClient.subscribe("bars", newSymbols);
	}
}

/**
 * Unsubscribe from indicator updates for a symbol.
 */
export async function unsubscribeIndicatorSymbol(symbol: string): Promise<void> {
	const upperSymbol = symbol.toUpperCase();

	if (!activeSymbols.has(upperSymbol)) {
		return;
	}

	activeSymbols.delete(upperSymbol);
	indicatorCache.delete(upperSymbol);

	if (alpacaWsClient?.isConnected()) {
		alpacaWsClient.unsubscribe("bars", [upperSymbol]);
	}
}

/**
 * Get cached indicator data for a symbol.
 */
export function getCachedIndicator(symbol: string): {
	price: PriceIndicators;
	timestamp: Date;
} | null {
	return indicatorCache.get(symbol.toUpperCase()) ?? null;
}

/**
 * Get all actively subscribed indicator symbols.
 */
export function getActiveIndicatorSymbols(): string[] {
	return Array.from(activeSymbols);
}

/**
 * Check if indicator streaming is initialized and connected.
 */
export function isIndicatorStreamingConnected(): boolean {
	return isInitialized && alpacaWsClient?.getState() === AlpacaConnectionState.AUTHENTICATED;
}

// ============================================
// Default Export
// ============================================

export default {
	initIndicatorDataStreaming,
	shutdownIndicatorDataStreaming,
	subscribeIndicatorSymbol,
	subscribeIndicatorSymbols,
	unsubscribeIndicatorSymbol,
	getCachedIndicator,
	getActiveIndicatorSymbols,
	isIndicatorStreamingConnected,
};
