/**
 * Loading State Store
 *
 * Zustand store for coordinating loading states across the application.
 *
 * @see docs/plans/ui/28-states.md lines 7-44
 */

import { create } from "zustand";

// ============================================
// Types
// ============================================

/**
 * Loading operation key.
 * Use namespaced keys for clarity: "category:operation"
 */
export type LoadingKey = string;

/**
 * Loading operation metadata.
 */
export interface LoadingOperation {
  /** Operation start time */
  startedAt: Date;
  /** Optional timeout in ms */
  timeout?: number;
  /** Optional cancel callback */
  onCancel?: () => void;
}

/**
 * Loading store state.
 */
export interface LoadingState {
  /** Map of active loading operations */
  operations: Map<LoadingKey, LoadingOperation>;

  /** Set loading state for a key */
  setLoading: (key: LoadingKey, loading: boolean, options?: LoadingOptions) => void;

  /** Start a loading operation */
  startLoading: (key: LoadingKey, options?: LoadingOptions) => void;

  /** Stop a loading operation */
  stopLoading: (key: LoadingKey) => void;

  /** Check if a specific key is loading */
  isLoading: (key: LoadingKey) => boolean;

  /** Check if any operation is loading */
  isAnyLoading: () => boolean;

  /** Get all loading keys */
  getLoadingKeys: () => LoadingKey[];

  /** Check if any key matching a prefix is loading */
  isLoadingByPrefix: (prefix: string) => boolean;

  /** Clear all loading states */
  clearAll: () => void;
}

/**
 * Options for loading operations.
 */
export interface LoadingOptions {
  /** Timeout in ms after which loading auto-clears */
  timeout?: number;
  /** Callback when operation is cancelled */
  onCancel?: () => void;
}

// ============================================
// Loading Key Registry
// ============================================

/**
 * Standard loading keys for common operations.
 */
export const LOADING_KEYS = {
  // Portfolio operations
  PORTFOLIO_FETCH: "portfolio:fetch",
  PORTFOLIO_REFRESH: "portfolio:refresh",

  // Position operations
  POSITIONS_FETCH: "positions:fetch",
  POSITION_UPDATE: "positions:update",

  // Order operations
  ORDERS_FETCH: "orders:fetch",
  ORDER_SUBMIT: "orders:submit",
  ORDER_CANCEL: "orders:cancel",

  // Decision operations
  DECISIONS_FETCH: "decisions:fetch",
  DECISION_APPROVE: "decisions:approve",
  DECISION_REJECT: "decisions:reject",

  // System operations
  SYSTEM_START: "system:start",
  SYSTEM_STOP: "system:stop",
  SYSTEM_STATUS: "system:status",

  // Market data
  MARKET_FETCH: "market:fetch",
  MARKET_SUBSCRIBE: "market:subscribe",

  // Auth
  AUTH_LOGIN: "auth:login",
  AUTH_LOGOUT: "auth:logout",

  // Settings
  SETTINGS_FETCH: "settings:fetch",
  SETTINGS_SAVE: "settings:save",

  // Agents
  AGENTS_FETCH: "agents:fetch",
  AGENT_EXECUTE: "agents:execute",

  // Page transitions
  PAGE_LOADING: "page:loading",
} as const;

export type StandardLoadingKey = (typeof LOADING_KEYS)[keyof typeof LOADING_KEYS];

// ============================================
// Store
// ============================================

/**
 * Zustand store for loading state management.
 *
 * @example
 * ```tsx
 * // In a component
 * const isLoading = useLoadingStore((s) => s.isLoading("portfolio:fetch"));
 * const setLoading = useLoadingStore((s) => s.setLoading);
 *
 * // Start loading
 * setLoading("portfolio:fetch", true);
 *
 * // Stop loading
 * setLoading("portfolio:fetch", false);
 * ```
 */
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

// ============================================
// Selectors
// ============================================

/**
 * Selector for checking if a specific key is loading.
 */
export const selectIsLoading = (key: LoadingKey) => (state: LoadingState) =>
  state.isLoading(key);

/**
 * Selector for checking if any operation is loading.
 */
export const selectIsAnyLoading = (state: LoadingState) => state.isAnyLoading();

/**
 * Selector for checking if any key with a prefix is loading.
 */
export const selectIsLoadingByPrefix =
  (prefix: string) => (state: LoadingState) =>
    state.isLoadingByPrefix(prefix);

/**
 * Selector for getting all loading keys.
 */
export const selectLoadingKeys = (state: LoadingState) => state.getLoadingKeys();

// ============================================
// Helper Functions
// ============================================

/**
 * Create a loading key with namespace.
 */
export function createLoadingKey(namespace: string, operation: string): LoadingKey {
  return `${namespace}:${operation}`;
}

/**
 * Parse a loading key into namespace and operation.
 */
export function parseLoadingKey(key: LoadingKey): {
  namespace: string;
  operation: string;
} {
  const [namespace, ...rest] = key.split(":");
  return {
    namespace,
    operation: rest.join(":"),
  };
}

export default useLoadingStore;
