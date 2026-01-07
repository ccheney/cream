/**
 * usePollingFallback Hook
 *
 * Provides REST polling fallback when WebSocket is unavailable.
 * Automatically enables polling when WS is disconnected for >30 seconds.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 6.3
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ============================================
// Types
// ============================================

export interface PollingEndpoint<T> {
  /** Endpoint key for identification */
  key: string;
  /** Fetch function */
  fetcher: () => Promise<T>;
  /** Polling interval in ms */
  interval: number;
  /** Callback when data is received */
  onData?: (data: T) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Enabled by default (when polling mode is active) */
  enabled?: boolean;
}

export interface UsePollingFallbackOptions {
  /** WebSocket connected state */
  wsConnected: boolean;
  /** Delay before enabling polling (ms) */
  disconnectThreshold?: number;
  /** Endpoints to poll */
  endpoints?: PollingEndpoint<unknown>[];
}

export interface UsePollingFallbackReturn {
  /** Whether polling mode is active */
  isPolling: boolean;
  /** Seconds until polling activates (or 0 if active) */
  pollingActivatesIn: number;
  /** Manually enable polling */
  enablePolling: () => void;
  /** Manually disable polling */
  disablePolling: () => void;
  /** Add an endpoint to poll */
  addEndpoint: <T>(endpoint: PollingEndpoint<T>) => void;
  /** Remove an endpoint */
  removeEndpoint: (key: string) => void;
}

// ============================================
// Constants
// ============================================

const DEFAULT_DISCONNECT_THRESHOLD = 30_000; // 30 seconds

// ============================================
// Hook
// ============================================

/**
 * Hook to provide REST polling fallback when WebSocket is unavailable.
 *
 * @example
 * ```tsx
 * const { isPolling, pollingActivatesIn } = usePollingFallback({
 *   wsConnected: connected,
 *   endpoints: [
 *     {
 *       key: "portfolio",
 *       fetcher: () => fetch("/api/portfolio").then(r => r.json()),
 *       interval: 5000,
 *       onData: (data) => updatePortfolio(data),
 *     },
 *   ],
 * });
 *
 * if (isPolling) {
 *   return <div>Using REST fallback due to connection issues</div>;
 * }
 * ```
 */
export function usePollingFallback(options: UsePollingFallbackOptions): UsePollingFallbackReturn {
  const {
    wsConnected,
    disconnectThreshold = DEFAULT_DISCONNECT_THRESHOLD,
    endpoints = [],
  } = options;

  const [isPolling, setIsPolling] = useState(false);
  const [pollingActivatesIn, setPollingActivatesIn] = useState(0);

  const endpointsRef = useRef<Map<string, PollingEndpoint<unknown>>>(new Map());
  const pollIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const disconnectedAtRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize endpoints
  useEffect(() => {
    for (const endpoint of endpoints) {
      endpointsRef.current.set(endpoint.key, endpoint);
    }
  }, [endpoints]);

  // Start polling for an endpoint
  const startPollingEndpoint = useCallback((endpoint: PollingEndpoint<unknown>) => {
    if (endpoint.enabled === false) {
      return;
    }

    // Clear existing interval if any
    const existing = pollIntervalsRef.current.get(endpoint.key);
    if (existing) {
      clearInterval(existing);
    }

    // Start polling
    const poll = async () => {
      try {
        const data = await endpoint.fetcher();
        endpoint.onData?.(data);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        endpoint.onError?.(error);
      }
    };

    // Poll immediately
    poll();

    // Set up interval
    const intervalId = setInterval(poll, endpoint.interval);
    pollIntervalsRef.current.set(endpoint.key, intervalId);
  }, []);

  // Stop polling for an endpoint
  const stopPollingEndpoint = useCallback((key: string) => {
    const intervalId = pollIntervalsRef.current.get(key);
    if (intervalId) {
      clearInterval(intervalId);
      pollIntervalsRef.current.delete(key);
    }
  }, []);

  // Start all polling
  const startAllPolling = useCallback(() => {
    for (const endpoint of endpointsRef.current.values()) {
      startPollingEndpoint(endpoint);
    }
  }, [startPollingEndpoint]);

  // Stop all polling
  const stopAllPolling = useCallback(() => {
    for (const key of pollIntervalsRef.current.keys()) {
      stopPollingEndpoint(key);
    }
  }, [stopPollingEndpoint]);

  // Enable polling manually
  const enablePolling = useCallback(() => {
    setIsPolling(true);
    startAllPolling();
  }, [startAllPolling]);

  // Disable polling manually
  const disablePolling = useCallback(() => {
    setIsPolling(false);
    stopAllPolling();
  }, [stopAllPolling]);

  // Add endpoint
  const addEndpoint = useCallback(
    <T>(endpoint: PollingEndpoint<T>) => {
      endpointsRef.current.set(endpoint.key, endpoint as PollingEndpoint<unknown>);
      if (isPolling) {
        startPollingEndpoint(endpoint as PollingEndpoint<unknown>);
      }
    },
    [isPolling, startPollingEndpoint]
  );

  // Remove endpoint
  const removeEndpoint = useCallback(
    (key: string) => {
      stopPollingEndpoint(key);
      endpointsRef.current.delete(key);
    },
    [stopPollingEndpoint]
  );

  // Handle WebSocket connection state changes
  useEffect(() => {
    if (wsConnected) {
      // WebSocket connected - disable polling
      disconnectedAtRef.current = null;
      setPollingActivatesIn(0);

      if (activationTimeoutRef.current) {
        clearTimeout(activationTimeoutRef.current);
        activationTimeoutRef.current = null;
      }

      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }

      if (isPolling) {
        disablePolling();
      }
    } else {
      // WebSocket disconnected - start countdown to polling
      if (disconnectedAtRef.current === null) {
        disconnectedAtRef.current = Date.now();
        const thresholdSeconds = Math.ceil(disconnectThreshold / 1000);
        setPollingActivatesIn(thresholdSeconds);

        // Start countdown
        countdownIntervalRef.current = setInterval(() => {
          const elapsed = Date.now() - (disconnectedAtRef.current ?? Date.now());
          const remaining = Math.max(0, Math.ceil((disconnectThreshold - elapsed) / 1000));
          setPollingActivatesIn(remaining);

          if (remaining <= 0 && countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
        }, 1000);

        // Set up activation timeout
        activationTimeoutRef.current = setTimeout(() => {
          enablePolling();
        }, disconnectThreshold);
      }
    }

    return () => {
      if (activationTimeoutRef.current) {
        clearTimeout(activationTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [wsConnected, disconnectThreshold, isPolling, enablePolling, disablePolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllPolling();
      if (activationTimeoutRef.current) {
        clearTimeout(activationTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [stopAllPolling]);

  return {
    isPolling,
    pollingActivatesIn,
    enablePolling,
    disablePolling,
    addEndpoint,
    removeEndpoint,
  };
}

export default usePollingFallback;
