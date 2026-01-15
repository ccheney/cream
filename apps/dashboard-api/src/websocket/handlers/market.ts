/**
 * Market Data Handlers
 *
 * Handlers for symbol and options contract subscriptions.
 */

import type {
	SubscribeOptionsMessage,
	SubscribeSymbolsMessage,
	UnsubscribeOptionsMessage,
	UnsubscribeSymbolsMessage,
} from "@cream/domain/websocket";
import {
	getCachedQuote,
	subscribeSymbols as subscribeToStreaming,
} from "../../streaming/market-data.js";
import {
	getCachedOptionsQuote,
	subscribeContracts as subscribeToOptionsStreaming,
} from "../../streaming/options-data.js";
import { sendMessage } from "../channels.js";
import type { WebSocketWithMetadata } from "../types.js";

/**
 * Handle subscribe symbols message.
 * Subscribes to the Massive WebSocket for real-time market data.
 */
export function handleSubscribeSymbols(
	ws: WebSocketWithMetadata,
	message: SubscribeSymbolsMessage
): void {
	const metadata = ws.data;
	const newSymbols: string[] = [];

	for (const symbol of message.symbols) {
		const upperSymbol = symbol.toUpperCase();
		if (!metadata.symbols.has(upperSymbol)) {
			metadata.symbols.add(upperSymbol);
			newSymbols.push(upperSymbol);
		}
	}

	metadata.channels.add("quotes");

	if (newSymbols.length > 0) {
		subscribeToStreaming(newSymbols).catch(() => {
			// Streaming is an optional enhancement; failures are non-critical
		});

		for (const symbol of newSymbols) {
			const cached = getCachedQuote(symbol);
			if (cached) {
				sendMessage(ws, {
					type: "quote",
					data: {
						symbol,
						bid: cached.bid,
						ask: cached.ask,
						last: cached.last,
						volume: cached.volume,
						timestamp: cached.timestamp.toISOString(),
					},
				});
			}
		}
	}

	sendMessage(ws, {
		type: "subscribed",
		channels: ["quotes"],
	});
}

/**
 * Handle unsubscribe symbols message.
 */
export function handleUnsubscribeSymbols(
	ws: WebSocketWithMetadata,
	message: UnsubscribeSymbolsMessage
): void {
	const metadata = ws.data;

	for (const symbol of message.symbols) {
		metadata.symbols.delete(symbol.toUpperCase());
	}

	sendMessage(ws, {
		type: "unsubscribed",
		channels: [],
	});
}

/**
 * Handle subscribe options contracts message.
 * Subscribes to the Massive WebSocket for real-time options data.
 */
export function handleSubscribeOptions(
	ws: WebSocketWithMetadata,
	message: SubscribeOptionsMessage
): void {
	const metadata = ws.data;
	const newContracts: string[] = [];

	for (const contract of message.contracts) {
		const upperContract = contract.toUpperCase();
		if (!metadata.contracts.has(upperContract)) {
			metadata.contracts.add(upperContract);
			newContracts.push(upperContract);
		}
	}

	metadata.channels.add("options");

	if (newContracts.length > 0) {
		subscribeToOptionsStreaming(newContracts).catch(() => {
			// Streaming is an optional enhancement; failures are non-critical
		});

		for (const contract of newContracts) {
			const cached = getCachedOptionsQuote(contract);
			if (cached) {
				sendMessage(ws, {
					type: "options_quote",
					data: {
						contract,
						underlying: cached.underlying,
						bid: cached.bid,
						ask: cached.ask,
						last: cached.last,
						volume: cached.volume,
						openInterest: cached.openInterest,
						timestamp: cached.timestamp.toISOString(),
					},
				});
			}
		}
	}

	sendMessage(ws, {
		type: "subscribed",
		channels: ["options"],
	});
}

/**
 * Handle unsubscribe options contracts message.
 */
export function handleUnsubscribeOptions(
	ws: WebSocketWithMetadata,
	message: UnsubscribeOptionsMessage
): void {
	const metadata = ws.data;

	for (const contract of message.contracts) {
		metadata.contracts.delete(contract.toUpperCase());
	}

	sendMessage(ws, {
		type: "unsubscribed",
		channels: [],
	});
}
