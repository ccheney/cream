/**
 * Subscription Hooks
 *
 * Convenience hooks for subscribing to WebSocket channels and symbols.
 *
 * @see docs/plans/ui/06-websocket.md lines 37-58
 */

"use client";

import { type RefObject, useCallback, useEffect, useRef } from "react";
import { useWSStore, type WSStore } from "../stores/websocket";

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
	const { autoSubscribe = true } = options;
	const wsStore = useWSStore();
	const symbolsRef = useRef(symbols);
	const subscribedRef = useRef(false);
	const subscriptions = useSymbolSubscriptionActions({
		wsStore,
		symbolsRef,
		subscribedRef,
	});

	useSymbolSubscriptionSync({
		autoSubscribe,
		symbols,
		wsStore,
		symbolsRef,
		subscribedRef,
		subscribeSymbols: subscriptions.subscribeSymbols,
		unsubscribeSymbols: subscriptions.unsubscribeSymbols,
	});

	useSymbolSubscriptionCleanup({
		wsStore,
		symbolsRef,
		subscribedRef,
	});

	return {
		subscribedSymbols: wsStore.subscribedSymbols,
		subscribe: subscriptions.subscribe,
		unsubscribe: subscriptions.unsubscribe,
		isSubscribed: subscriptions.isSubscribed,
	};
}

function useSymbolSubscriptionActions({
	wsStore,
	symbolsRef,
	subscribedRef,
}: {
	wsStore: WSStore;
	symbolsRef: RefObject<string[]>;
	subscribedRef: RefObject<boolean>;
}) {
	const subscribeSymbols = useCallback(
		(symbols: string[]) => {
			if (symbols.length === 0) {
				return;
			}

			wsStore.subscribeSymbols(symbols);
		},
		[wsStore],
	);

	const unsubscribeSymbols = useCallback(
		(symbols: string[]) => {
			if (symbols.length === 0) {
				return;
			}

			wsStore.unsubscribeSymbols(symbols);
		},
		[wsStore],
	);

	const subscribe = useCallback(() => {
		if (!subscribedRef.current && symbolsRef.current.length > 0) {
			subscribeSymbols(symbolsRef.current);
			subscribedRef.current = true;
		}
	}, [symbolsRef, subscribedRef, subscribeSymbols]);

	const unsubscribe = useCallback(() => {
		if (subscribedRef.current) {
			unsubscribeSymbols(symbolsRef.current);
			subscribedRef.current = false;
		}
	}, [symbolsRef, subscribedRef, unsubscribeSymbols]);

	const isSubscribed = useCallback(
		(symbol: string) => {
			return wsStore.subscribedSymbols.includes(symbol);
		},
		[wsStore.subscribedSymbols],
	);

	return {
		subscribe,
		unsubscribe,
		isSubscribed,
		subscribeSymbols,
		unsubscribeSymbols,
	};
}

function useSymbolSubscriptionSync({
	autoSubscribe,
	symbols,
	wsStore,
	symbolsRef,
	subscribeSymbols,
	unsubscribeSymbols,
	subscribedRef,
}: {
	autoSubscribe: boolean;
	symbols: string[];
	wsStore: WSStore;
	symbolsRef: RefObject<string[]>;
	subscribeSymbols: (symbols: string[]) => void;
	unsubscribeSymbols: (symbols: string[]) => void;
	subscribedRef: RefObject<boolean>;
}) {
	useEffect(() => {
		symbolsRef.current = symbols;
	}, [symbols, symbolsRef]);

	useEffect(() => {
		if (!autoSubscribe) {
			return;
		}

		const diff = calculateSymbolSubscriptionDiff(wsStore.subscribedSymbols, symbols);

		if (diff.toAdd.length > 0) {
			subscribeSymbols(diff.toAdd);
		}
		if (diff.toRemove.length > 0) {
			unsubscribeSymbols(diff.toRemove);
		}

		subscribedRef.current = symbols.length > 0;
	}, [autoSubscribe, symbols, wsStore, subscribeSymbols, unsubscribeSymbols, subscribedRef]);
}

function useSymbolSubscriptionCleanup({
	wsStore,
	symbolsRef,
	subscribedRef,
}: {
	wsStore: WSStore;
	symbolsRef: RefObject<string[]>;
	subscribedRef: RefObject<boolean>;
}) {
	useEffect(() => {
		return () => {
			if (subscribedRef.current && symbolsRef.current.length > 0) {
				wsStore.unsubscribeSymbols(symbolsRef.current);
			}
		};
	}, [wsStore, symbolsRef, subscribedRef]);
}

function calculateSymbolSubscriptionDiff(currentSymbols: string[], targetSymbols: string[]) {
	const currentSet = new Set(currentSymbols);
	const toAdd = targetSymbols.filter((symbol) => !currentSet.has(symbol));
	const toRemove = currentSymbols.filter((symbol) => !targetSymbols.includes(symbol));
	return { toAdd, toRemove };
}

export default useSubscribe;
