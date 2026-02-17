/**
 * Realtime Options Data Provider
 *
 * Provides realtime options data via OPRA WebSocket streaming.
 * Implements the OptionsDataProvider interface for the indicator service.
 *
 * Features:
 * - Realtime IV calculation from bid/ask quotes using Newton-Raphson
 * - IV skew calculation (OTM puts vs OTM calls)
 * - Put/Call ratio from streaming trade data
 * - Automatic subscription management per underlying
 *
 * @see docs/plans/08-options.md
 * @see https://docs.alpaca.markets/docs/real-time-option-data
 */

import type { AlpacaMarketDataClient } from "../providers/alpaca";
import type { AlpacaWebSocketClient, AlpacaWsEvent } from "../providers/alpaca-websocket";
import { createAlpacaOptionsClientFromEnv } from "../providers/alpaca-websocket";
import { parseOptionSymbol, solveIVFromQuote, timeToExpiry } from "./ivSolver";
import { average, collectAtmIvs, collectSkewBuckets } from "./realtimeOptionsProvider.iv-utils";

export {
	type OpraQuoteMessage,
	OpraQuoteMessageSchema,
	type OpraTradeMessage,
	OpraTradeMessageSchema,
} from "./realtimeOptionsProvider.messages";

import { OpraQuoteMessageSchema, OpraTradeMessageSchema } from "./realtimeOptionsProvider.messages";

export type {
	OptionsDataProvider,
	RealtimeOptionsProviderConfig,
} from "./realtimeOptionsProvider.types";

import {
	DEFAULT_CONFIG,
	type OptionsDataProvider,
	type RealtimeOptionsProviderConfig,
	type SubscriptionState,
	type UnderlyingData,
} from "./realtimeOptionsProvider.types";

// ============================================
// Realtime Options Data Provider
// ============================================

/**
 * Realtime options data provider using OPRA WebSocket streaming.
 *
 * Provides implied volatility, IV skew, and put/call ratio for any underlying.
 * Automatically manages subscriptions and calculates IV from streaming quotes.
 *
 * @example
 * ```typescript
 * const provider = await RealtimeOptionsProvider.create(alpacaClient);
 *
 * // Get ATM implied volatility
 * const iv = await provider.getImpliedVolatility("AAPL");
 *
 * // Get IV skew (OTM puts vs OTM calls)
 * const skew = await provider.getIVSkew("AAPL");
 *
 * // Get put/call ratio
 * const pcr = await provider.getPutCallRatio("AAPL");
 *
 * // Clean up
 * provider.disconnect();
 * ```
 */
export class RealtimeOptionsProvider implements OptionsDataProvider {
	private wsClient: AlpacaWebSocketClient;
	private restClient: AlpacaMarketDataClient;
	private config: Required<RealtimeOptionsProviderConfig>;
	private subscriptions: Map<string, SubscriptionState> = new Map();
	private underlyingPrices: Map<string, UnderlyingData> = new Map();
	private connected = false;
	private connectPromise: Promise<void> | null = null;

	private constructor(
		restClient: AlpacaMarketDataClient,
		wsClient: AlpacaWebSocketClient,
		config: RealtimeOptionsProviderConfig = {},
	) {
		this.restClient = restClient;
		this.wsClient = wsClient;
		this.config = { ...DEFAULT_CONFIG, ...config };

		this.wsClient.on(this.handleEvent.bind(this));
	}

	/**
	 * Create a new RealtimeOptionsProvider.
	 */
	static async create(
		restClient: AlpacaMarketDataClient,
		config?: RealtimeOptionsProviderConfig,
	): Promise<RealtimeOptionsProvider> {
		const wsClient = createAlpacaOptionsClientFromEnv();
		return new RealtimeOptionsProvider(restClient, wsClient, config);
	}

	/**
	 * Create with custom WebSocket client (for testing).
	 */
	static createWithClient(
		restClient: AlpacaMarketDataClient,
		wsClient: AlpacaWebSocketClient,
		config?: RealtimeOptionsProviderConfig,
	): RealtimeOptionsProvider {
		return new RealtimeOptionsProvider(restClient, wsClient, config);
	}

	/**
	 * Ensure WebSocket is connected.
	 */
	private async ensureConnected(): Promise<void> {
		if (this.connected) {
			return;
		}

		if (this.connectPromise) {
			return this.connectPromise;
		}

		this.connectPromise = this.wsClient.connect().then(() => {
			this.connected = true;
			this.connectPromise = null;
		});

		return this.connectPromise;
	}

	/**
	 * Handle WebSocket events.
	 */
	private handleEvent(event: AlpacaWsEvent): void {
		if (event.type === "quote") {
			this.handleQuote(event.message);
		} else if (event.type === "trade") {
			this.handleTrade(event.message);
		} else if (event.type === "disconnected") {
			this.connected = false;
		} else if (event.type === "authenticated") {
			this.connected = true;
		}
	}

	/**
	 * Handle incoming option quote.
	 */
	private handleQuote(msg: unknown): void {
		const parsed = OpraQuoteMessageSchema.safeParse(msg);
		if (!parsed.success) {
			return;
		}

		const quote = parsed.data;
		const optionInfo = parseOptionSymbol(quote.S);
		if (!optionInfo) {
			return;
		}

		const underlying = optionInfo.root;
		const state = this.subscriptions.get(underlying);
		if (!state) {
			return;
		}

		// Get underlying price for IV calculation
		const underlyingData = this.underlyingPrices.get(underlying);
		if (!underlyingData) {
			return;
		}

		// Calculate IV from quote
		const tte = timeToExpiry(optionInfo.expiry);
		let iv: number | null = null;

		if (quote.bp > 0 && quote.ap > 0 && tte > 0) {
			iv = solveIVFromQuote(
				quote.bp,
				quote.ap,
				underlyingData.price,
				optionInfo.strike,
				tte,
				optionInfo.type,
				this.config.riskFreeRate,
			);
		}

		state.quotes.set(quote.S, {
			symbol: quote.S,
			bidPrice: quote.bp,
			askPrice: quote.ap,
			bidSize: quote.bs,
			askSize: quote.as,
			timestamp: new Date(quote.t).getTime(),
			iv,
		});
	}

	/**
	 * Handle incoming option trade.
	 */
	private handleTrade(msg: unknown): void {
		const parsed = OpraTradeMessageSchema.safeParse(msg);
		if (!parsed.success) {
			return;
		}

		const trade = parsed.data;
		const optionInfo = parseOptionSymbol(trade.S);
		if (!optionInfo) {
			return;
		}

		const underlying = optionInfo.root;
		const state = this.subscriptions.get(underlying);
		if (!state) {
			return;
		}

		const now = Date.now();

		// Add trade to history
		state.trades.push({
			symbol: trade.S,
			price: trade.p,
			size: trade.s,
			timestamp: new Date(trade.t).getTime(),
		});

		// Prune old trades
		const cutoff = now - this.config.tradeRetentionMs;
		state.trades = state.trades.filter((t) => t.timestamp > cutoff);
	}

	/**
	 * Subscribe to options for an underlying.
	 */
	private async subscribeToUnderlying(underlying: string): Promise<SubscriptionState> {
		await this.ensureConnected();

		// Check if already subscribed
		const existing = this.subscriptions.get(underlying);
		if (existing) {
			return existing;
		}

		// Fetch underlying price
		const underlyingPrice = await this.getUnderlyingPrice(underlying);
		this.underlyingPrices.set(underlying, {
			price: underlyingPrice,
			lastUpdate: Date.now(),
		});

		// Fetch option contracts for this underlying
		const today = new Date();
		const minExpDate = new Date(today);
		minExpDate.setDate(minExpDate.getDate() + this.config.minDte);

		const maxExpDate = new Date(today);
		maxExpDate.setDate(maxExpDate.getDate() + this.config.maxDte);

		const contracts = await this.restClient.getOptionContracts(underlying, {
			expirationDateGte: minExpDate.toISOString().slice(0, 10),
			expirationDateLte: maxExpDate.toISOString().slice(0, 10),
			limit: 500,
		});

		// Get symbols to subscribe to
		const optionSymbols = new Set(contracts.map((c) => c.symbol));

		// Create subscription state
		const state: SubscriptionState = {
			underlying,
			optionSymbols,
			quotes: new Map(),
			trades: [],
			lastSubscribeTime: Date.now(),
		};

		this.subscriptions.set(underlying, state);

		// Subscribe to quotes and trades for these options
		if (optionSymbols.size > 0) {
			const symbols = Array.from(optionSymbols);
			this.wsClient.subscribe("quotes", symbols);
			this.wsClient.subscribe("trades", symbols);
		}

		return state;
	}

	/**
	 * Get underlying price.
	 */
	private async getUnderlyingPrice(underlying: string): Promise<number> {
		const snapshots = await this.restClient.getSnapshots([underlying]);
		const snapshot = snapshots.get(underlying);
		return snapshot?.latestTrade?.price ?? snapshot?.dailyBar?.close ?? 0;
	}

	/**
	 * Refresh underlying price if stale.
	 */
	private async refreshUnderlyingPrice(underlying: string): Promise<number> {
		const data = this.underlyingPrices.get(underlying);
		const now = Date.now();

		if (!data || now - data.lastUpdate > this.config.staleThresholdMs) {
			const price = await this.getUnderlyingPrice(underlying);
			this.underlyingPrices.set(underlying, { price, lastUpdate: now });
			return price;
		}

		return data.price;
	}

	private async waitForQuotes(state: SubscriptionState): Promise<void> {
		if (state.quotes.size > 0) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	private async waitForTrades(state: SubscriptionState): Promise<void> {
		if (state.trades.length > 0) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	/**
	 * Get ATM implied volatility for an underlying.
	 *
	 * Returns the average IV of ATM options (within 2% of spot).
	 */
	async getImpliedVolatility(symbol: string): Promise<number | null> {
		const state = await this.subscribeToUnderlying(symbol);
		const underlyingPrice = await this.refreshUnderlyingPrice(symbol);

		if (underlyingPrice <= 0) {
			return null;
		}

		await this.waitForQuotes(state);

		// Find ATM options (within 2% of spot)
		const atmQuotes = collectAtmIvs(state.quotes.values(), underlyingPrice);

		if (atmQuotes.length === 0) {
			return null;
		}

		// Return average ATM IV
		return atmQuotes.reduce((sum, iv) => sum + iv, 0) / atmQuotes.length;
	}

	/**
	 * Get IV skew for an underlying.
	 *
	 * Returns: (OTM Put IV - OTM Call IV) / ATM IV
	 *
	 * Positive skew = puts are more expensive (typical for equities)
	 * Negative skew = calls are more expensive
	 */
	async getIVSkew(symbol: string): Promise<number | null> {
		const state = await this.subscribeToUnderlying(symbol);
		const underlyingPrice = await this.refreshUnderlyingPrice(symbol);

		if (underlyingPrice <= 0) {
			return null;
		}

		await this.waitForQuotes(state);

		const { atmIvs, otmPutIvs, otmCallIvs } = collectSkewBuckets(
			state.quotes.values(),
			underlyingPrice,
		);
		const avgAtmIv = average(atmIvs);
		const avgOtmPutIv = average(otmPutIvs);
		const avgOtmCallIv = average(otmCallIvs);

		if (!avgAtmIv || avgAtmIv <= 0 || avgOtmPutIv === null || avgOtmCallIv === null) {
			return null;
		}

		return (avgOtmPutIv - avgOtmCallIv) / avgAtmIv;
	}

	/**
	 * Get put/call ratio for an underlying.
	 *
	 * Returns: Put Volume / Call Volume
	 *
	 * > 1 = More put trading (bearish sentiment)
	 * < 1 = More call trading (bullish sentiment)
	 */
	async getPutCallRatio(symbol: string): Promise<number | null> {
		const state = await this.subscribeToUnderlying(symbol);
		await this.waitForTrades(state);

		let putVolume = 0;
		let callVolume = 0;

		for (const trade of state.trades) {
			const optionInfo = parseOptionSymbol(trade.symbol);
			if (!optionInfo) {
				continue;
			}

			if (optionInfo.type === "PUT") {
				putVolume += trade.size;
			} else {
				callVolume += trade.size;
			}
		}

		if (callVolume === 0) {
			return putVolume > 0 ? 999 : null; // Extreme bearish or no data
		}

		return putVolume / callVolume;
	}

	/**
	 * Unsubscribe from an underlying's options.
	 */
	unsubscribe(underlying: string): void {
		const state = this.subscriptions.get(underlying);
		if (!state) {
			return;
		}

		// Unsubscribe from WebSocket
		const symbols = Array.from(state.optionSymbols);
		if (symbols.length > 0) {
			this.wsClient.unsubscribe("quotes", symbols);
			this.wsClient.unsubscribe("trades", symbols);
		}

		this.subscriptions.delete(underlying);
		this.underlyingPrices.delete(underlying);
	}

	/**
	 * Disconnect and clean up.
	 */
	disconnect(): void {
		for (const underlying of this.subscriptions.keys()) {
			this.unsubscribe(underlying);
		}
		this.wsClient.disconnect();
		this.connected = false;
	}

	/**
	 * Check if connected.
	 */
	isConnected(): boolean {
		return this.connected;
	}

	/**
	 * Get subscription status for debugging.
	 */
	getStatus(): {
		connected: boolean;
		subscriptions: { underlying: string; optionCount: number; quoteCount: number }[];
	} {
		return {
			connected: this.connected,
			subscriptions: Array.from(this.subscriptions.entries()).map(([underlying, state]) => ({
				underlying,
				optionCount: state.optionSymbols.size,
				quoteCount: state.quotes.size,
			})),
		};
	}
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a RealtimeOptionsProvider from environment variables.
 */
export async function createRealtimeOptionsProvider(
	restClient: AlpacaMarketDataClient,
	config?: RealtimeOptionsProviderConfig,
): Promise<RealtimeOptionsProvider> {
	return RealtimeOptionsProvider.create(restClient, config);
}
