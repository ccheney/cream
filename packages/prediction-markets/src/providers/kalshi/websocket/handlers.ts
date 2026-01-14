/**
 * Message handlers for Kalshi WebSocket messages.
 *
 * Parses and validates incoming WebSocket messages.
 */

import type { MarketStateCache } from "./cache.js";
import {
	type KalshiWebSocketCallback,
	type KalshiWebSocketMessage,
	MarketLifecycleMessageSchema,
	OrderbookDeltaMessageSchema,
	TickerMessageSchema,
	TradeMessageSchema,
} from "./types.js";

export interface MessageHandlerContext {
	cache: MarketStateCache;
	subscriptions: Map<string, Set<KalshiWebSocketCallback>>;
}

function notifySubscribers(
	message: KalshiWebSocketMessage,
	subscriptions: Map<string, Set<KalshiWebSocketCallback>>
): void {
	for (const [key, callbacks] of subscriptions.entries()) {
		if (key.startsWith(message.type)) {
			for (const cb of callbacks) {
				cb(message);
			}
		}
	}
}

export function handleMessage(data: string, context: MessageHandlerContext): void {
	try {
		const parsed = JSON.parse(data);

		if (parsed.type === "ticker") {
			const result = TickerMessageSchema.safeParse(parsed);
			if (result.success) {
				context.cache.updateFromTicker(result.data.msg);
				notifySubscribers(result.data, context.subscriptions);
			}
			return;
		}

		if (parsed.type === "orderbook_delta") {
			const result = OrderbookDeltaMessageSchema.safeParse(parsed);
			if (result.success) {
				notifySubscribers(result.data, context.subscriptions);
			}
			return;
		}

		if (parsed.type === "trade") {
			const result = TradeMessageSchema.safeParse(parsed);
			if (result.success) {
				notifySubscribers(result.data, context.subscriptions);
			}
			return;
		}

		if (parsed.type === "market_lifecycle_v2") {
			const result = MarketLifecycleMessageSchema.safeParse(parsed);
			if (result.success) {
				notifySubscribers(result.data, context.subscriptions);
			}
		}
	} catch {
		// Ignore parse errors for pong/heartbeat messages
	}
}
