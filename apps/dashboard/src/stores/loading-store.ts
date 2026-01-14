/**
 * @see docs/plans/ui/28-states.md lines 7-44
 */

import { create } from "zustand";

/** Use namespaced keys for clarity: "category:operation" */
export type LoadingKey = string;

export interface LoadingOperation {
	startedAt: Date;
	timeout?: number;
	onCancel?: () => void;
}

export interface LoadingState {
	operations: Map<LoadingKey, LoadingOperation>;
	setLoading: (key: LoadingKey, loading: boolean, options?: LoadingOptions) => void;
	startLoading: (key: LoadingKey, options?: LoadingOptions) => void;
	stopLoading: (key: LoadingKey) => void;
	isLoading: (key: LoadingKey) => boolean;
	isAnyLoading: () => boolean;
	getLoadingKeys: () => LoadingKey[];
	isLoadingByPrefix: (prefix: string) => boolean;
	clearAll: () => void;
}

export interface LoadingOptions {
	/** Auto-clears loading state after this duration */
	timeout?: number;
	onCancel?: () => void;
}

export const LOADING_KEYS = {
	PORTFOLIO_FETCH: "portfolio:fetch",
	PORTFOLIO_REFRESH: "portfolio:refresh",
	POSITIONS_FETCH: "positions:fetch",
	POSITION_UPDATE: "positions:update",
	ORDERS_FETCH: "orders:fetch",
	ORDER_SUBMIT: "orders:submit",
	ORDER_CANCEL: "orders:cancel",
	DECISIONS_FETCH: "decisions:fetch",
	DECISION_APPROVE: "decisions:approve",
	DECISION_REJECT: "decisions:reject",
	SYSTEM_START: "system:start",
	SYSTEM_STOP: "system:stop",
	SYSTEM_STATUS: "system:status",
	MARKET_FETCH: "market:fetch",
	MARKET_SUBSCRIBE: "market:subscribe",
	AUTH_LOGIN: "auth:login",
	AUTH_LOGOUT: "auth:logout",
	SETTINGS_FETCH: "settings:fetch",
	SETTINGS_SAVE: "settings:save",
	AGENTS_FETCH: "agents:fetch",
	AGENT_EXECUTE: "agents:execute",
	PAGE_LOADING: "page:loading",
} as const;

export type StandardLoadingKey = (typeof LOADING_KEYS)[keyof typeof LOADING_KEYS];

export const useLoadingStore = create<LoadingState>((set, get) => ({
	operations: new Map(),

	setLoading: (key, loading, options) => {
		if (loading) {
			get().startLoading(key, options);
		} else {
			get().stopLoading(key);
		}
	},

	startLoading: (key, options) => {
		set((state) => {
			const operations = new Map(state.operations);
			operations.set(key, {
				startedAt: new Date(),
				timeout: options?.timeout,
				onCancel: options?.onCancel,
			});
			return { operations };
		});

		// Auto-clear on timeout
		if (options?.timeout) {
			setTimeout(() => {
				const op = get().operations.get(key);
				if (op) {
					get().stopLoading(key);
				}
			}, options.timeout);
		}
	},

	stopLoading: (key) => {
		set((state) => {
			const operations = new Map(state.operations);
			operations.delete(key);
			return { operations };
		});
	},

	isLoading: (key) => {
		return get().operations.has(key);
	},

	isAnyLoading: () => {
		return get().operations.size > 0;
	},

	getLoadingKeys: () => {
		return Array.from(get().operations.keys());
	},

	isLoadingByPrefix: (prefix) => {
		const keys = get().getLoadingKeys();
		return keys.some((key) => key.startsWith(prefix));
	},

	clearAll: () => {
		set({ operations: new Map() });
	},
}));

export const selectIsLoading = (key: LoadingKey) => (state: LoadingState) => state.isLoading(key);

export const selectIsAnyLoading = (state: LoadingState) => state.isAnyLoading();

export const selectIsLoadingByPrefix = (prefix: string) => (state: LoadingState) =>
	state.isLoadingByPrefix(prefix);

export const selectLoadingKeys = (state: LoadingState) => state.getLoadingKeys();

export function createLoadingKey(namespace: string, operation: string): LoadingKey {
	return `${namespace}:${operation}`;
}

export function parseLoadingKey(key: LoadingKey): {
	namespace: string;
	operation: string;
} {
	const [namespace, ...rest] = key.split(":");
	return {
		namespace: namespace || "",
		operation: rest.join(":"),
	};
}

export default useLoadingStore;
