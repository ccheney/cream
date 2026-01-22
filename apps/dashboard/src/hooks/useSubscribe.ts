/**
 * Subscription Hooks
 *
 * Convenience hooks for subscribing to WebSocket channels and symbols.
 *
 * @see docs/plans/ui/06-websocket.md lines 37-58
 */

"use client";

import { useCallback, useEffect, useRef } from "react";
import { useWSStore } from "../stores/websocket";

// ============================================
// Types
// ============================================

/**
 * Available WebSocket channels.
 */
export type Channel =
	| "quotes"
	| "orders"
	| "decisions"
	| "agents"
	| "cycles"
	| "alerts"
	| "system"
	| "portfolio";

/**
 * Options for useSubscribe hook.
 */
export interface UseSubscribeOptions {
	/** Automatically subscribe on mount (default: true) */
	autoSubscribe?: boolean;
	/** Dependencies that trigger resubscription */
	deps?: unknown[];
}

/**
 * Return type for useSubscribe hook.
 */
export interface UseSubscribeReturn {
	/** Current subscribed channels */
	subscribedChannels: Channel[];
	/** Subscribe to channels */
	subscribe: () => void;
	/** Unsubscribe from channels */
	unsubscribe: () => void;
	/** Check if subscribed to a specific channel */
	isSubscribed: (channel: Channel) => boolean;
}

/**
 * Options for useSymbolSubscription hook.
 */
export interface UseSymbolSubscriptionOptions {
	/** Automatically subscribe on mount (default: true) */
	autoSubscribe?: boolean;
	/** Dependencies that trigger resubscription */
	deps?: unknown[];
}

/**
 * Return type for useSymbolSubscription hook.
 */
export interface UseSymbolSubscriptionReturn {
	/** Current subscribed symbols */
	subscribedSymbols: string[];
	/** Subscribe to symbols */
	subscribe: () => void;
	/** Unsubscribe from symbols */
	unsubscribe: () => void;
	/** Check if subscribed to a specific symbol */
	isSubscribed: (symbol: string) => boolean;
}

// ============================================
// Hooks
// ============================================

/**
 * Hook for subscribing to WebSocket channels.
 *
 * Manages subscription lifecycle and syncs with the WebSocket store.
 *
 * @example
 * ```tsx
 * function OrdersPanel() {
 *   const { isSubscribed } = useSubscribe(['orders', 'alerts']);
 *
 *   return (
 *     <div>
 *       {isSubscribed('orders') && <OrdersList />}
 *     </div>
 *   );
 * }
 * ```
 */
export function useSubscribe(
	channels: Channel[],
	options: UseSubscribeOptions = {},
): UseSubscribeReturn {
	const { autoSubscribe = true, deps = [] } = options;

	const wsStore = useWSStore();
	const channelsRef = useRef(channels);
	const subscribedRef = useRef(false);

	// Update ref when channels change
	useEffect(() => {
		channelsRef.current = channels;
	}, [channels]);

	// Subscribe function
	const subscribe = useCallback(() => {
		if (!subscribedRef.current) {
			wsStore.subscribe(channelsRef.current);
			subscribedRef.current = true;
		}
	}, [wsStore]);

	// Unsubscribe function
	const unsubscribe = useCallback(() => {
		if (subscribedRef.current) {
			wsStore.unsubscribe(channelsRef.current);
			subscribedRef.current = false;
		}
	}, [wsStore]);

	// Check subscription status
	const isSubscribed = useCallback(
		(channel: Channel) => {
			return wsStore.subscribedChannels.includes(channel);
		},
		[wsStore.subscribedChannels],
	);

	// Auto-subscribe on mount
	useEffect(() => {
		if (autoSubscribe) {
			subscribe();
		}

		return () => {
			unsubscribe();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [autoSubscribe, ...deps, subscribe, unsubscribe]);

	return {
		subscribedChannels: wsStore.subscribedChannels as Channel[],
		subscribe,
		unsubscribe,
		isSubscribed,
	};
}

/**
 * Hook for subscribing to symbol quotes.
 *
 * Manages symbol subscription lifecycle for real-time quote updates.
 *
 * @example
 * ```tsx
 * function WatchList({ symbols }: { symbols: string[] }) {
 *   const { isSubscribed, subscribedSymbols } = useSymbolSubscription(symbols);
 *
 *   return (
 *     <div>
 *       {subscribedSymbols.map(symbol => (
 *         <QuoteRow key={symbol} symbol={symbol} />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useSymbolSubscription(
	symbols: string[],
	options: UseSymbolSubscriptionOptions = {},
): UseSymbolSubscriptionReturn {
	const { autoSubscribe = true, deps: _deps = [] } = options;
	void _deps; // Reserved for future dependency tracking

	const wsStore = useWSStore();
	const symbolsRef = useRef(symbols);
	const subscribedRef = useRef(false);

	// Update ref when symbols change
	useEffect(() => {
		symbolsRef.current = symbols;
	}, [symbols]);

	// Subscribe function
	const subscribe = useCallback(() => {
		if (!subscribedRef.current && symbolsRef.current.length > 0) {
			wsStore.subscribeSymbols(symbolsRef.current);
			subscribedRef.current = true;
		}
	}, [wsStore]);

	// Unsubscribe function
	const unsubscribe = useCallback(() => {
		if (subscribedRef.current) {
			wsStore.unsubscribeSymbols(symbolsRef.current);
			subscribedRef.current = false;
		}
	}, [wsStore]);

	// Check subscription status
	const isSubscribed = useCallback(
		(symbol: string) => {
			return wsStore.subscribedSymbols.includes(symbol);
		},
		[wsStore.subscribedSymbols],
	);

	// Handle symbol changes
	useEffect(() => {
		if (!autoSubscribe) {
			return;
		}

		// Get current subscriptions
		const currentSymbols = new Set(wsStore.subscribedSymbols);
		const newSymbols = new Set(symbols);

		// Find symbols to add
		const toAdd = symbols.filter((s) => !currentSymbols.has(s));

		// Find symbols to remove
		const toRemove = wsStore.subscribedSymbols.filter(
			(s) => !newSymbols.has(s) && symbolsRef.current.includes(s),
		);

		// Subscribe to new symbols
		if (toAdd.length > 0) {
			wsStore.subscribeSymbols(toAdd);
		}

		// Unsubscribe from removed symbols
		if (toRemove.length > 0) {
			wsStore.unsubscribeSymbols(toRemove);
		}

		subscribedRef.current = symbols.length > 0;

		return () => {
			// Don't unsubscribe on every render, only on unmount
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		autoSubscribe,
		symbols,
		wsStore.subscribeSymbols,
		wsStore.subscribedSymbols,
		wsStore.unsubscribeSymbols,
	]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (subscribedRef.current && symbolsRef.current.length > 0) {
				wsStore.unsubscribeSymbols(symbolsRef.current);
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [wsStore.unsubscribeSymbols]);

	return {
		subscribedSymbols: wsStore.subscribedSymbols,
		subscribe,
		unsubscribe,
		isSubscribed,
	};
}

export default useSubscribe;
