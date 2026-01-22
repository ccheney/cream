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

import { z } from "zod";
import type { AlpacaMarketDataClient } from "../providers/alpaca";
import type { AlpacaWebSocketClient, AlpacaWsEvent } from "../providers/alpaca-websocket";
import { createAlpacaOptionsClientFromEnv } from "../providers/alpaca-websocket";
import { parseOptionSymbol, solveIVFromQuote, timeToExpiry } from "./ivSolver";

// ============================================
// Zod Schemas for OPRA Messages
// ============================================

export const OpraQuoteMessageSchema = z.object({
	T: z.literal("q"),
	S: z.string().describe("Option symbol (OCC format)"),
	t: z.string().describe("Quote timestamp (RFC-3339)"),
	bx: z.string().optional().describe("Bid exchange code"),
	bp: z.number().describe("Bid price"),
	bs: z.number().describe("Bid size (contracts)"),
	ax: z.string().optional().describe("Ask exchange code"),
	ap: z.number().describe("Ask price"),
	as: z.number().describe("Ask size (contracts)"),
	c: z.string().optional().describe("Quote condition"),
});
export type OpraQuoteMessage = z.infer<typeof OpraQuoteMessageSchema>;

export const OpraTradeMessageSchema = z.object({
	T: z.literal("t"),
	S: z.string().describe("Option symbol (OCC format)"),
	t: z.string().describe("Trade timestamp (RFC-3339)"),
	p: z.number().describe("Trade price"),
	s: z.number().describe("Trade size (contracts)"),
	x: z.string().optional().describe("Exchange code"),
	c: z.string().optional().describe("Trade condition"),
});
export type OpraTradeMessage = z.infer<typeof OpraTradeMessageSchema>;

// ============================================
// Types
// ============================================

export interface OptionsDataProvider {
	getImpliedVolatility(symbol: string): Promise<number | null>;
	getIVSkew(symbol: string): Promise<number | null>;
	getPutCallRatio(symbol: string): Promise<number | null>;
}

interface OptionQuoteData {
	symbol: string;
	bidPrice: number;
	askPrice: number;
	bidSize: number;
	askSize: number;
	timestamp: number;
	iv: number | null;
}

interface OptionTradeData {
	symbol: string;
	price: number;
	size: number;
	timestamp: number;
}

interface UnderlyingData {
	price: number;
	lastUpdate: number;
}

interface SubscriptionState {
	underlying: string;
	optionSymbols: Set<string>;
	quotes: Map<string, OptionQuoteData>;
	trades: OptionTradeData[];
	lastSubscribeTime: number;
}

export interface RealtimeOptionsProviderConfig {
	/** Risk-free rate for IV calculations (default: 0.05) */
	riskFreeRate?: number;
	/** Max DTE for options to include (default: 60 days) */
	maxDte?: number;
	/** Min DTE for options to include (default: 1 day) */
	minDte?: number;
	/** Stale data threshold in ms (default: 60000 = 1 minute) */
	staleThresholdMs?: number;
	/** Trade history retention in ms (default: 3600000 = 1 hour) */
	tradeRetentionMs?: number;
}

const DEFAULT_CONFIG: Required<RealtimeOptionsProviderConfig> = {
	riskFreeRate: 0.05,
	maxDte: 60,
	minDte: 1,
	staleThresholdMs: 60_000,
	tradeRetentionMs: 3600_000,
};

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

		// Wait a moment for quotes to arrive if we just subscribed
		if (state.quotes.size === 0) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		// Find ATM options (within 2% of spot)
		const atmThreshold = 0.02;
		const atmQuotes: number[] = [];

		for (const quote of state.quotes.values()) {
			if (quote.iv === null) {
				continue;
			}

			const optionInfo = parseOptionSymbol(quote.symbol);
			if (!optionInfo) {
				continue;
			}

			const moneyness = Math.abs(optionInfo.strike - underlyingPrice) / underlyingPrice;
			if (moneyness <= atmThreshold) {
				atmQuotes.push(quote.iv);
			}
		}

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

		// Wait for quotes
		if (state.quotes.size === 0) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		// Collect IV by category
		const atmIvs: number[] = [];
		const otmPutIvs: number[] = [];
		const otmCallIvs: number[] = [];

		const atmThreshold = 0.02;
		const otmThreshold = 0.1; // 5-10% OTM

		for (const quote of state.quotes.values()) {
			if (quote.iv === null) {
				continue;
			}

			const optionInfo = parseOptionSymbol(quote.symbol);
			if (!optionInfo) {
				continue;
			}

			const moneyness = (optionInfo.strike - underlyingPrice) / underlyingPrice;
			const absMoneyness = Math.abs(moneyness);

			if (absMoneyness <= atmThreshold) {
				atmIvs.push(quote.iv);
			} else if (absMoneyness >= 0.05 && absMoneyness <= otmThreshold) {
				if (optionInfo.type === "PUT" && moneyness < 0) {
					// OTM put (strike < spot)
					otmPutIvs.push(quote.iv);
				} else if (optionInfo.type === "CALL" && moneyness > 0) {
					// OTM call (strike > spot)
					otmCallIvs.push(quote.iv);
				}
			}
		}

		if (atmIvs.length === 0 || otmPutIvs.length === 0 || otmCallIvs.length === 0) {
			return null;
		}

		const avgAtmIv = atmIvs.reduce((sum, iv) => sum + iv, 0) / atmIvs.length;
		const avgOtmPutIv = otmPutIvs.reduce((sum, iv) => sum + iv, 0) / otmPutIvs.length;
		const avgOtmCallIv = otmCallIvs.reduce((sum, iv) => sum + iv, 0) / otmCallIvs.length;

		if (avgAtmIv <= 0) {
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

		// Wait for trades
		if (state.trades.length === 0) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

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
