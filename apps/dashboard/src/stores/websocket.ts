/**
 * WebSocket Store
 *
 * Zustand store for managing WebSocket connection state, subscriptions,
 * and reconnection attempts across the application.
 *
 * @see docs/plans/ui/07-state-management.md lines 93-104
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

// ============================================
// Types
// ============================================

/**
 * Connection status enum.
 */
export type ConnectionStatus = "connected" | "connecting" | "reconnecting" | "disconnected";

/**
 * WebSocket store state.
 */
export interface WSState {
	/** Whether WebSocket is connected */
	connected: boolean;

	/** Current connection status */
	connectionStatus: ConnectionStatus;

	/** Channels user subscribed to */
	subscribedChannels: string[];

	/** Symbols for quote channel */
	subscribedSymbols: string[];

	/** Current reconnection attempt count */
	reconnectAttempts: number;

	/** Timestamp of last successful connection */
	lastConnectedAt: string | null;

	/** Most recent connection error */
	lastError: Error | null;
}

/**
 * WebSocket store actions.
 */
export interface WSActions {
	/** Set connection state */
	setConnected: (connected: boolean) => void;

	/** Set connection status */
	setConnectionStatus: (status: ConnectionStatus) => void;

	/** Add channels to subscription list */
	subscribe: (channels: string[]) => void;

	/** Remove channels from subscription list */
	unsubscribe: (channels: string[]) => void;

	/** Add symbols to quote subscription */
	subscribeSymbols: (symbols: string[]) => void;

	/** Remove symbols from quote subscription */
	unsubscribeSymbols: (symbols: string[]) => void;

	/** Update reconnection counter */
	setReconnectAttempts: (count: number) => void;

	/** Increment reconnection counter */
	incrementReconnectAttempts: () => void;

	/** Record last error */
	setLastError: (error: Error | null) => void;

	/** Reset connection state (on successful connect) */
	onConnected: () => void;

	/** Handle disconnection */
	onDisconnected: () => void;

	/** Clear all subscriptions */
	clearSubscriptions: () => void;

	/** Reset store to initial state */
	reset: () => void;
}

/**
 * Combined store type.
 */
export type WSStore = WSState & WSActions;

// ============================================
// Initial State
// ============================================

const initialState: WSState = {
	connected: false,
	connectionStatus: "disconnected",
	subscribedChannels: [],
	subscribedSymbols: [],
	reconnectAttempts: 0,
	lastConnectedAt: null,
	lastError: null,
};

// ============================================
// Store Implementation
// ============================================

/**
 * WebSocket connection state store.
 *
 * Persists subscriptions to localStorage for restoration on page reload.
 * Connection state is transient and not persisted.
 */
export const useWSStore = create<WSStore>()(
	persist(
		(set, get) => ({
			// Initial state
			...initialState,

			// Actions
			setConnected: (connected) => {
				set({
					connected,
					connectionStatus: connected ? "connected" : "disconnected",
				});
			},

			setConnectionStatus: (status) => {
				set({
					connectionStatus: status,
					connected: status === "connected",
				});
			},

			subscribe: (channels) => {
				const current = get().subscribedChannels;
				const newChannels = channels.filter((c) => !current.includes(c));
				if (newChannels.length > 0) {
					set({ subscribedChannels: [...current, ...newChannels] });
				}
			},

			unsubscribe: (channels) => {
				const current = get().subscribedChannels;
				set({
					subscribedChannels: current.filter((c) => !channels.includes(c)),
				});
			},

			subscribeSymbols: (symbols) => {
				const current = get().subscribedSymbols;
				const newSymbols = symbols.filter((s) => !current.includes(s));
				if (newSymbols.length > 0) {
					set({ subscribedSymbols: [...current, ...newSymbols] });
				}
			},

			unsubscribeSymbols: (symbols) => {
				const current = get().subscribedSymbols;
				set({
					subscribedSymbols: current.filter((s) => !symbols.includes(s)),
				});
			},

			setReconnectAttempts: (count) => {
				set({ reconnectAttempts: count });
			},

			incrementReconnectAttempts: () => {
				set((state) => ({ reconnectAttempts: state.reconnectAttempts + 1 }));
			},

			setLastError: (error) => {
				set({ lastError: error });
			},

			onConnected: () => {
				set({
					connected: true,
					connectionStatus: "connected",
					reconnectAttempts: 0,
					lastConnectedAt: new Date().toISOString(),
					lastError: null,
				});
			},

			onDisconnected: () => {
				set({
					connected: false,
					connectionStatus: "disconnected",
				});
			},

			clearSubscriptions: () => {
				set({
					subscribedChannels: [],
					subscribedSymbols: [],
				});
			},

			reset: () => {
				set(initialState);
			},
		}),
		{
			name: "cream-ws-subscriptions",
			storage: createJSONStorage(() => localStorage),
			// Only persist subscriptions, not connection state
			partialize: (state) => ({
				subscribedChannels: state.subscribedChannels,
				subscribedSymbols: state.subscribedSymbols,
			}),
		},
	),
);

// ============================================
// Derived State Selectors
// ============================================

/**
 * Select whether currently reconnecting.
 */
export const selectIsReconnecting = (state: WSStore): boolean =>
	state.connectionStatus === "reconnecting" || state.reconnectAttempts > 0;

/**
 * Select whether any subscriptions are active.
 */
export const selectHasSubscriptions = (state: WSStore): boolean =>
	state.subscribedChannels.length > 0 || state.subscribedSymbols.length > 0;

/**
 * Select subscription count.
 */
export const selectSubscriptionCount = (state: WSStore): number =>
	state.subscribedChannels.length + state.subscribedSymbols.length;

/**
 * Select whether subscribed to a specific channel.
 */
export const selectIsSubscribedToChannel =
	(channel: string) =>
	(state: WSStore): boolean =>
		state.subscribedChannels.includes(channel);

/**
 * Select whether subscribed to a specific symbol.
 */
export const selectIsSubscribedToSymbol =
	(symbol: string) =>
	(state: WSStore): boolean =>
		state.subscribedSymbols.includes(symbol);

// ============================================
// Convenience Hooks
// ============================================

/**
 * Hook for connection status.
 */
export function useConnectionStatus(): ConnectionStatus {
	return useWSStore((state) => state.connectionStatus);
}

/**
 * Hook for connected state.
 */
export function useConnected(): boolean {
	return useWSStore((state) => state.connected);
}

/**
 * Hook for reconnecting state.
 */
export function useIsReconnecting(): boolean {
	return useWSStore(selectIsReconnecting);
}

/**
 * Hook for subscribed channels.
 */
export function useSubscribedChannels(): string[] {
	return useWSStore((state) => state.subscribedChannels);
}

/**
 * Hook for subscribed symbols.
 */
export function useSubscribedSymbols(): string[] {
	return useWSStore((state) => state.subscribedSymbols);
}

/**
 * Hook for subscription actions.
 */
export function useSubscriptionActions() {
	return useWSStore(
		useShallow((state) => ({
			subscribe: state.subscribe,
			unsubscribe: state.unsubscribe,
			subscribeSymbols: state.subscribeSymbols,
			unsubscribeSymbols: state.unsubscribeSymbols,
			clearSubscriptions: state.clearSubscriptions,
		})),
	);
}

/**
 * Hook for connection actions.
 */
export function useConnectionActions() {
	return useWSStore(
		useShallow((state) => ({
			setConnected: state.setConnected,
			setConnectionStatus: state.setConnectionStatus,
			onConnected: state.onConnected,
			onDisconnected: state.onDisconnected,
			setReconnectAttempts: state.setReconnectAttempts,
			incrementReconnectAttempts: state.incrementReconnectAttempts,
			setLastError: state.setLastError,
			reset: state.reset,
		})),
	);
}

export default useWSStore;
