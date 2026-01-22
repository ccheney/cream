/**
 * Shared Options Data Provider for Indicator Service
 *
 * Provides OptionsDataProvider interface using the shared WebSocket connection.
 * Calculates IV, IV skew, and put/call ratio from streaming options data.
 *
 * This is a lightweight adapter that uses the shared WebSocket connection
 * instead of creating its own connection (which would conflict with Alpaca's
 * single connection limit).
 */

import type { OptionsDataProvider } from "@cream/indicators";
import {
	type AlpacaWsEvent,
	parseOptionSymbol,
	solveIVFromQuote,
	timeToExpiry,
} from "@cream/marketdata";
import log from "../logger.js";
import { getCachedQuote } from "../streaming/market-data.js";
import {
	getSharedOptionsWebSocket,
	isOptionsWebSocketConnected,
	offOptionsEvent,
	onOptionsEvent,
} from "../streaming/shared-options-ws.js";

// ============================================
// Types
// ============================================

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

interface UnderlyingState {
	underlying: string;
	optionSymbols: Set<string>;
	quotes: Map<string, OptionQuoteData>;
	trades: OptionTradeData[];
	underlyingPrice: number;
	lastUpdate: number;
}

// ============================================
// Configuration
// ============================================

const CONFIG = {
	riskFreeRate: 0.05,
	maxDte: 60,
	minDte: 1,
	staleThresholdMs: 60_000,
	tradeRetentionMs: 3600_000,
	subscribeWaitMs: 2000, // Wait time for quotes to arrive
};

// ============================================
// Shared Options Data Provider
// ============================================

/**
 * Options data provider that uses the shared WebSocket connection.
 */
export class SharedOptionsDataProvider implements OptionsDataProvider {
	private subscriptions = new Map<string, UnderlyingState>();
	private isListening = false;

	constructor() {
		// Register event handler
		onOptionsEvent(this.handleEvent.bind(this));
		this.isListening = true;
	}

	/**
	 * Handle WebSocket events.
	 */
	private handleEvent(event: AlpacaWsEvent): void {
		if (event.type === "quote") {
			this.handleQuote(event.message);
		} else if (event.type === "trade") {
			this.handleTrade(event.message);
		}
	}

	/**
	 * Handle incoming option quote.
	 */
	private handleQuote(msg: unknown): void {
		const quote = msg as { S: string; bp: number; ap: number; bs: number; as: number; t: string };
		if (!quote.S) {
			return;
		}

		const optionInfo = parseOptionSymbol(quote.S);
		if (!optionInfo) {
			return;
		}

		const underlying = optionInfo.root;
		const state = this.subscriptions.get(underlying);
		if (!state) {
			return;
		}

		// Calculate IV from quote
		const tte = timeToExpiry(optionInfo.expiry);
		let iv: number | null = null;

		if (quote.bp > 0 && quote.ap > 0 && tte > 0 && state.underlyingPrice > 0) {
			iv = solveIVFromQuote(
				quote.bp,
				quote.ap,
				state.underlyingPrice,
				optionInfo.strike,
				tte,
				optionInfo.type,
				CONFIG.riskFreeRate,
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
		const trade = msg as { S: string; p: number; s: number; t: string };
		if (!trade.S) {
			return;
		}

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
		const cutoff = now - CONFIG.tradeRetentionMs;
		state.trades = state.trades.filter((t) => t.timestamp > cutoff);
	}

	/**
	 * Subscribe to options for an underlying.
	 */
	private async subscribeToUnderlying(underlying: string): Promise<UnderlyingState | null> {
		// Return existing subscription
		const existing = this.subscriptions.get(underlying);
		if (existing) {
			return existing;
		}

		const client = await getSharedOptionsWebSocket();
		if (!client?.isConnected()) {
			log.warn({ underlying }, "Cannot subscribe to options - WebSocket not connected");
			return null;
		}

		// Fetch underlying price for IV calculations
		// For now, use a placeholder - in production this would come from the stock WebSocket
		const underlyingPrice = await this.getUnderlyingPrice(underlying);

		// Create subscription state
		const state: UnderlyingState = {
			underlying,
			optionSymbols: new Set(),
			quotes: new Map(),
			trades: [],
			underlyingPrice,
			lastUpdate: Date.now(),
		};

		this.subscriptions.set(underlying, state);

		// Subscribe to options for this underlying using wildcard
		// Note: This subscribes to ALL options for the underlying
		try {
			// Alpaca options don't support wildcards for quotes, so we need to
			// fetch contracts and subscribe to specific symbols
			// For now, we'll just create the state and rely on contracts being
			// subscribed elsewhere (e.g., via options-data.ts)
			log.debug({ underlying }, "Created options state for indicator calculations");
		} catch (error) {
			log.warn({ underlying, error }, "Failed to subscribe to options");
		}

		return state;
	}

	/**
	 * Get underlying stock price from the shared stock WebSocket cache.
	 */
	private async getUnderlyingPrice(underlying: string): Promise<number> {
		const cached = getCachedQuote(underlying);
		return cached?.last ?? 0;
	}

	/**
	 * Get ATM implied volatility for an underlying.
	 */
	async getImpliedVolatility(symbol: string): Promise<number | null> {
		// Fail fast if WebSocket isn't connected
		if (!isOptionsWebSocketConnected()) {
			return null;
		}

		const state = await this.subscribeToUnderlying(symbol);
		if (!state || state.underlyingPrice <= 0) {
			return null;
		}

		// Wait for quotes to arrive
		if (state.quotes.size === 0) {
			await new Promise((resolve) => setTimeout(resolve, CONFIG.subscribeWaitMs));
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

			const moneyness = Math.abs(optionInfo.strike - state.underlyingPrice) / state.underlyingPrice;
			if (moneyness <= atmThreshold) {
				atmQuotes.push(quote.iv);
			}
		}

		if (atmQuotes.length === 0) {
			return null;
		}

		return atmQuotes.reduce((sum, iv) => sum + iv, 0) / atmQuotes.length;
	}

	/**
	 * Get IV skew for an underlying.
	 */
	async getIVSkew(symbol: string): Promise<number | null> {
		// Fail fast if WebSocket isn't connected
		if (!isOptionsWebSocketConnected()) {
			return null;
		}

		const state = await this.subscribeToUnderlying(symbol);
		if (!state || state.underlyingPrice <= 0) {
			return null;
		}

		// Wait for quotes
		if (state.quotes.size === 0) {
			await new Promise((resolve) => setTimeout(resolve, CONFIG.subscribeWaitMs));
		}

		// Collect IV by category
		const atmIvs: number[] = [];
		const otmPutIvs: number[] = [];
		const otmCallIvs: number[] = [];

		const atmThreshold = 0.02;
		const otmThreshold = 0.1;

		for (const quote of state.quotes.values()) {
			if (quote.iv === null) {
				continue;
			}

			const optionInfo = parseOptionSymbol(quote.symbol);
			if (!optionInfo) {
				continue;
			}

			const moneyness = (optionInfo.strike - state.underlyingPrice) / state.underlyingPrice;
			const absMoneyness = Math.abs(moneyness);

			if (absMoneyness <= atmThreshold) {
				atmIvs.push(quote.iv);
			} else if (absMoneyness >= 0.05 && absMoneyness <= otmThreshold) {
				if (optionInfo.type === "PUT" && moneyness < 0) {
					otmPutIvs.push(quote.iv);
				} else if (optionInfo.type === "CALL" && moneyness > 0) {
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
	 */
	async getPutCallRatio(symbol: string): Promise<number | null> {
		// Fail fast if WebSocket isn't connected
		if (!isOptionsWebSocketConnected()) {
			return null;
		}

		const state = await this.subscribeToUnderlying(symbol);
		if (!state) {
			return null;
		}

		// Wait for trades
		if (state.trades.length === 0) {
			await new Promise((resolve) => setTimeout(resolve, CONFIG.subscribeWaitMs));
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
			return putVolume > 0 ? 999 : null;
		}

		return putVolume / callVolume;
	}

	/**
	 * Clean up resources.
	 */
	disconnect(): void {
		if (this.isListening) {
			offOptionsEvent(this.handleEvent.bind(this));
			this.isListening = false;
		}
		this.subscriptions.clear();
	}
}

// ============================================
// Factory Function
// ============================================

let sharedProvider: SharedOptionsDataProvider | null = null;

/**
 * Get or create the shared options data provider.
 */
export function getSharedOptionsDataProvider(): SharedOptionsDataProvider {
	if (!sharedProvider) {
		sharedProvider = new SharedOptionsDataProvider();
	}
	return sharedProvider;
}
