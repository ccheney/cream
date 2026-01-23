/**
 * Options Data Streaming Service
 *
 * Connects to alpaca-stream-proxy via gRPC for real-time options data
 * and broadcasts updates to connected dashboard clients.
 *
 * Options symbols use OCC format: {underlying}{YYMMDD}{C|P}{strike}
 * Example: AAPL250117C00100000 = AAPL Jan 17, 2025 $100 Call
 *
 * @see docs/plans/ui/06-websocket.md
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import log from "../logger.js";
import { broadcastOptionsQuote } from "../websocket/handler.js";
import {
	type OptionQuoteUpdate,
	type OptionTrade,
	streamOptionQuotes,
	streamOptionTrades,
} from "./proxy-client.js";

// ============================================
// State
// ============================================

let isInitialized = false;
let proxyAbortController: AbortController | null = null;
let proxyStreamsRunning = false;

/**
 * Active options contract subscriptions from dashboard clients.
 * Format: AAPL250117C00100000
 */
const activeContracts = new Set<string>();

/**
 * Options quote cache - stores latest quote data per contract.
 */
const optionsCache = new Map<
	string,
	{
		underlying: string;
		bid: number;
		ask: number;
		last: number;
		volume: number;
		openInterest?: number;
		impliedVol?: number;
		delta?: number;
		gamma?: number;
		theta?: number;
		vega?: number;
		timestamp: Date;
	}
>();

/**
 * Extract underlying symbol from OCC options symbol.
 * Format: {underlying}{YYMMDD}{C|P}{strike}
 * Example: AAPL250117C00100000 -> AAPL
 */
function extractUnderlying(contract: string): string {
	const symbol = contract.startsWith("O:") ? contract.slice(2) : contract;
	const dateStart = symbol.search(/\d/);
	if (dateStart > 0) {
		return symbol.slice(0, dateStart);
	}
	return symbol;
}

// ============================================
// Initialization
// ============================================

/**
 * Initialize the options data streaming service.
 */
export async function initOptionsDataStreaming(): Promise<void> {
	if (isInitialized) {
		return;
	}

	if (proxyStreamsRunning) {
		log.warn("Options data proxy streaming already running");
		return;
	}

	proxyAbortController = new AbortController();
	proxyStreamsRunning = true;
	isInitialized = true;

	log.info("Options data streaming initialized via proxy");
}

/**
 * Shutdown the options data streaming service.
 */
export function shutdownOptionsDataStreaming(): void {
	log.info({ activeContracts: activeContracts.size }, "Shutting down options data streaming");

	if (proxyAbortController) {
		proxyAbortController.abort();
		proxyAbortController = null;
	}
	proxyStreamsRunning = false;

	isInitialized = false;
	activeContracts.clear();
	optionsCache.clear();
	log.info("Options data streaming shutdown complete");
}

// ============================================
// Proxy Mode Handlers
// ============================================

/**
 * Handle an option quote update from the proxy stream.
 */
function handleProxyOptionQuote(quote: OptionQuoteUpdate): void {
	const contract = quote.symbol;
	const underlying = extractUnderlying(contract);

	log.debug(
		{ contract, bid: quote.bidPrice, ask: quote.askPrice },
		"Options quote received from proxy",
	);

	const cached = optionsCache.get(contract);

	optionsCache.set(contract, {
		underlying,
		bid: quote.bidPrice,
		ask: quote.askPrice,
		last: cached?.last ?? (quote.bidPrice + quote.askPrice) / 2,
		volume: cached?.volume ?? 0,
		timestamp: quote.timestamp ? new Date(Number(quote.timestamp.seconds) * 1000) : new Date(),
	});

	broadcastOptionsQuote(contract, {
		type: "options_quote",
		data: {
			contract,
			underlying,
			bid: quote.bidPrice,
			ask: quote.askPrice,
			bidSize: quote.bidSize,
			askSize: quote.askSize,
			last: cached?.last ?? (quote.bidPrice + quote.askPrice) / 2,
			timestamp: quote.timestamp
				? new Date(Number(quote.timestamp.seconds) * 1000).toISOString()
				: new Date().toISOString(),
		},
	});
}

/**
 * Handle an option trade from the proxy stream.
 */
function handleProxyOptionTrade(trade: OptionTrade): void {
	const contract = trade.symbol;
	const underlying = extractUnderlying(contract);

	const cached = optionsCache.get(contract);
	optionsCache.set(contract, {
		underlying,
		bid: cached?.bid ?? trade.price,
		ask: cached?.ask ?? trade.price,
		last: trade.price,
		volume: (cached?.volume ?? 0) + trade.size,
		timestamp: trade.timestamp ? new Date(Number(trade.timestamp.seconds) * 1000) : new Date(),
	});

	broadcastOptionsQuote(contract, {
		type: "options_trade",
		data: {
			contract,
			underlying,
			price: trade.price,
			size: trade.size,
			timestamp: trade.timestamp
				? new Date(Number(trade.timestamp.seconds) * 1000).toISOString()
				: new Date().toISOString(),
		},
	});
}

/**
 * Start proxy options quote stream for the given contracts.
 */
function startProxyOptionQuoteStream(contracts: string[], signal: AbortSignal): void {
	(async () => {
		try {
			for await (const quote of streamOptionQuotes(contracts, [], {
				signal,
				onReconnect: (attempt: number) => {
					log.info({ attempt }, "Proxy option quotes stream reconnecting");
				},
				onError: (error: Error) => {
					log.error({ error: error.message }, "Proxy option quotes stream error");
				},
			})) {
				handleProxyOptionQuote(quote);
			}
		} catch (error) {
			if (!signal.aborted) {
				log.error({ error }, "Proxy option quotes stream failed");
			}
		}
	})();
}

/**
 * Start proxy options trade stream for the given contracts.
 */
function startProxyOptionTradeStream(contracts: string[], signal: AbortSignal): void {
	(async () => {
		try {
			for await (const trade of streamOptionTrades(contracts, [], {
				signal,
				onReconnect: (attempt: number) => {
					log.info({ attempt }, "Proxy option trades stream reconnecting");
				},
				onError: (error: Error) => {
					log.error({ error: error.message }, "Proxy option trades stream error");
				},
			})) {
				handleProxyOptionTrade(trade);
			}
		} catch (error) {
			if (!signal.aborted) {
				log.error({ error }, "Proxy option trades stream failed");
			}
		}
	})();
}

// ============================================
// Contract Management
// ============================================

/**
 * Subscribe to options data for a contract.
 * Called when a dashboard client subscribes to an options contract.
 *
 * @param contract OCC format contract symbol (e.g., AAPL250117C00100000)
 */
export async function subscribeContract(contract: string): Promise<void> {
	let normalizedContract = contract.toUpperCase();
	if (normalizedContract.startsWith("O:")) {
		normalizedContract = normalizedContract.slice(2);
	}

	if (activeContracts.has(normalizedContract)) {
		return;
	}

	activeContracts.add(normalizedContract);

	if (proxyAbortController) {
		log.info({ contract: normalizedContract }, "Subscribing to options contract via proxy");
		startProxyOptionQuoteStream([normalizedContract], proxyAbortController.signal);
		startProxyOptionTradeStream([normalizedContract], proxyAbortController.signal);
	}
}

/**
 * Subscribe to multiple contracts at once.
 */
export async function subscribeContracts(contracts: string[]): Promise<void> {
	const newContracts = contracts
		.map((c) => {
			let normalized = c.toUpperCase();
			if (normalized.startsWith("O:")) {
				normalized = normalized.slice(2);
			}
			return normalized;
		})
		.filter((c) => !activeContracts.has(c));

	if (newContracts.length === 0) {
		log.debug({ contracts }, "No new contracts to subscribe (already subscribed)");
		return;
	}

	for (const contract of newContracts) {
		activeContracts.add(contract);
	}

	if (proxyAbortController) {
		log.info(
			{ count: newContracts.length, contracts: newContracts.slice(0, 3) },
			"Subscribing to options contracts via proxy",
		);
		startProxyOptionQuoteStream(newContracts, proxyAbortController.signal);
		startProxyOptionTradeStream(newContracts, proxyAbortController.signal);
	}
}

/**
 * Unsubscribe from options data for a contract.
 */
export function unsubscribeContract(contract: string): void {
	let normalizedContract = contract.toUpperCase();
	if (normalizedContract.startsWith("O:")) {
		normalizedContract = normalizedContract.slice(2);
	}

	if (!activeContracts.has(normalizedContract)) {
		return;
	}

	activeContracts.delete(normalizedContract);
	optionsCache.delete(normalizedContract);
}

/**
 * Get the cached options data for a contract.
 */
export function getCachedOptionsQuote(contract: string): {
	underlying: string;
	bid: number;
	ask: number;
	last: number;
	volume: number;
	openInterest?: number;
	impliedVol?: number;
	delta?: number;
	gamma?: number;
	theta?: number;
	vega?: number;
	timestamp: Date;
} | null {
	let normalizedContract = contract.toUpperCase();
	if (normalizedContract.startsWith("O:")) {
		normalizedContract = normalizedContract.slice(2);
	}
	return optionsCache.get(normalizedContract) ?? null;
}

/**
 * Get all actively subscribed contracts.
 */
export function getActiveContracts(): string[] {
	return Array.from(activeContracts);
}

/**
 * Check if options streaming is initialized and connected.
 */
export function isOptionsStreamingConnected(): boolean {
	return isInitialized && proxyStreamsRunning;
}

// ============================================
// Default Export
// ============================================

export default {
	initOptionsDataStreaming,
	shutdownOptionsDataStreaming,
	subscribeContract,
	subscribeContracts,
	unsubscribeContract,
	getCachedOptionsQuote,
	getActiveContracts,
	isOptionsStreamingConnected,
};
