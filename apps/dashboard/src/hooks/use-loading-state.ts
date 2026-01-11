/**
 * Loading State Hook
 *
 * Hook for managing loading state with automatic cleanup.
 *
 * @see docs/plans/ui/28-states.md lines 7-44
 */

"use client";

import { useCallback, useEffect, useRef } from "react";
import { type LoadingKey, type LoadingOptions, useLoadingStore } from "../stores/loading-store";

// ============================================
// Types
// ============================================

/**
 * Hook return type.
 */
export interface UseLoadingStateReturn {
  /** Whether the operation is currently loading */
  isLoading: boolean;
  /** Start loading */
  startLoading: (options?: LoadingOptions) => void;
  /** Stop loading */
  stopLoading: () => void;
  /** Toggle loading state */
  setLoading: (loading: boolean, options?: LoadingOptions) => void;
}

/**
 * Hook options.
 */
export interface UseLoadingStateOptions {
  /** Auto-cleanup on unmount (default: true) */
  autoCleanup?: boolean;
  /** Initial loading state */
  initialLoading?: boolean;
  /** Initial loading options */
  initialOptions?: LoadingOptions;
}

// ============================================
// Hook
// ============================================

/**
 * Hook for managing a single loading operation.
 *
 * @example
 * ```tsx
 * function PortfolioLoader() {
 *   const { isLoading, startLoading, stopLoading } = useLoadingState("portfolio:fetch");
 *
 *   const fetchPortfolio = async () => {
 *     startLoading();
 *     try {
 *       await api.getPortfolio();
 *     } finally {
 *       stopLoading();
 *     }
 *   };
 *
 *   return (
 *     <button onClick={fetchPortfolio} disabled={isLoading}>
 *       {isLoading ? "Loading..." : "Refresh"}
 *     </button>
 *   );
 * }
 * ```
 */
export function useLoadingState(
  key: LoadingKey,
  options: UseLoadingStateOptions = {}
): UseLoadingStateReturn {
  const { autoCleanup = true, initialLoading = false, initialOptions } = options;

  const store = useLoadingStore();
  const keyRef = useRef(key);

  // Update key ref
  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  // Set initial loading state
  useEffect(() => {
    if (initialLoading) {
      store.startLoading(key, initialOptions);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoading, initialOptions, key, store.startLoading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoCleanup) {
        store.stopLoading(keyRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCleanup, store.stopLoading]);

  const isLoading = store.isLoading(key);

  const startLoading = useCallback(
    (opts?: LoadingOptions) => {
      store.startLoading(key, opts);
    },
    [key, store]
  );

  const stopLoading = useCallback(() => {
    store.stopLoading(key);
  }, [key, store]);

  const setLoading = useCallback(
    (loading: boolean, opts?: LoadingOptions) => {
      store.setLoading(key, loading, opts);
    },
    [key, store]
  );

  return {
    isLoading,
    startLoading,
    stopLoading,
    setLoading,
  };
}

// ============================================
// Multi-Key Hook
// ============================================

/**
 * Hook return type for multiple keys.
 */
export interface UseMultiLoadingStateReturn {
  /** Check if a specific key is loading */
  isLoading: (key: LoadingKey) => boolean;
  /** Check if any of the keys are loading */
  isAnyLoading: boolean;
  /** Start loading for a key */
  startLoading: (key: LoadingKey, options?: LoadingOptions) => void;
  /** Stop loading for a key */
  stopLoading: (key: LoadingKey) => void;
  /** Get all currently loading keys */
  loadingKeys: LoadingKey[];
}

/**
 * Hook for managing multiple loading operations.
 *
 * @example
 * ```tsx
 * function Dashboard() {
 *   const { isLoading, isAnyLoading, startLoading, stopLoading } =
 *     useMultiLoadingState(["portfolio:fetch", "positions:fetch"]);
 *
 *   if (isAnyLoading) {
 *     return <Skeleton />;
 *   }
 *
 *   return <DashboardContent />;
 * }
 * ```
 */
export function useMultiLoadingState(
  keys: LoadingKey[],
  options: { autoCleanup?: boolean } = {}
): UseMultiLoadingStateReturn {
  const { autoCleanup = true } = options;
  const store = useLoadingStore();
  const keysRef = useRef(keys);

  // Update keys ref
  useEffect(() => {
    keysRef.current = keys;
  }, [keys]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoCleanup) {
        for (const key of keysRef.current) {
          store.stopLoading(key);
        }
      }
    };
  }, [autoCleanup, store]);

  const isLoading = useCallback((key: LoadingKey) => store.isLoading(key), [store]);

  const isAnyLoading = keys.some((key) => store.isLoading(key));

  const startLoading = useCallback(
    (key: LoadingKey, opts?: LoadingOptions) => {
      store.startLoading(key, opts);
    },
    [store]
  );

  const stopLoading = useCallback(
    (key: LoadingKey) => {
      store.stopLoading(key);
    },
    [store]
  );

  const loadingKeys = keys.filter((key) => store.isLoading(key));

  return {
    isLoading,
    isAnyLoading,
    startLoading,
    stopLoading,
    loadingKeys,
  };
}

// ============================================
// Global Loading Hook
// ============================================

/**
 * Hook return type for global loading state.
 */
export interface UseGlobalLoadingReturn {
  /** Whether any operation is loading */
  isAnyLoading: boolean;
  /** Whether any operation with a prefix is loading */
  isLoadingByPrefix: (prefix: string) => boolean;
  /** All currently loading keys */
  loadingKeys: LoadingKey[];
  /** Clear all loading states */
  clearAll: () => void;
}

/**
 * Hook for accessing global loading state.
 *
 * @example
 * ```tsx
 * function GlobalLoadingIndicator() {
 *   const { isAnyLoading, loadingKeys } = useGlobalLoadingState();
 *
 *   if (!isAnyLoading) return null;
 *
 *   return (
 *     <div className="global-loader">
 *       Loading: {loadingKeys.join(", ")}
 *     </div>
 *   );
 * }
 * ```
 */
export function useGlobalLoadingState(): UseGlobalLoadingReturn {
  const store = useLoadingStore();

  const isAnyLoading = store.isAnyLoading();
  const loadingKeys = store.getLoadingKeys();

  const isLoadingByPrefix = useCallback(
    (prefix: string) => store.isLoadingByPrefix(prefix),
    [store]
  );

  const clearAll = useCallback(() => {
    store.clearAll();
  }, [store]);

  return {
    isAnyLoading,
    isLoadingByPrefix,
    loadingKeys,
    clearAll,
  };
}

// ============================================
// Async Helper
// ============================================

/**
 * Wrap an async function with loading state management.
 *
 * @example
 * ```tsx
 * function PortfolioLoader() {
 *   const { isLoading, startLoading, stopLoading } = useLoadingState("portfolio:fetch");
 *
 *   const fetchPortfolio = withLoading(
 *     () => api.getPortfolio(),
 *     startLoading,
 *     stopLoading
 *   );
 *
 *   return <button onClick={fetchPortfolio}>Refresh</button>;
 * }
 * ```
 */
export function withLoading<T>(
  fn: () => Promise<T>,
  startLoading: () => void,
  stopLoading: () => void
): () => Promise<T> {
  return async () => {
    startLoading();
    try {
      return await fn();
    } finally {
      stopLoading();
    }
  };
}

// ============================================
// Exports
// ============================================

export default useLoadingState;
