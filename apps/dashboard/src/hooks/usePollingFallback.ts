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

export interface PollingEndpoint<T> {
  key: string;
  fetcher: () => Promise<T>;
  /** Polling interval in ms */
  interval: number;
  onData?: (data: T) => void;
  onError?: (error: Error) => void;
  enabled?: boolean;
}

export interface UsePollingFallbackOptions {
  wsConnected: boolean;
  /** Delay before enabling polling (ms) */
  disconnectThreshold?: number;
  endpoints?: PollingEndpoint<unknown>[];
}

export interface UsePollingFallbackReturn {
  isPolling: boolean;
  /** Seconds until polling activates (or 0 if active) */
  pollingActivatesIn: number;
  enablePolling: () => void;
  disablePolling: () => void;
  addEndpoint: <T>(endpoint: PollingEndpoint<T>) => void;
  removeEndpoint: (key: string) => void;
}

const DEFAULT_DISCONNECT_THRESHOLD = 30_000;

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

  useEffect(() => {
    for (const endpoint of endpoints) {
      endpointsRef.current.set(endpoint.key, endpoint);
    }
  }, [endpoints]);

  const startPollingEndpoint = useCallback((endpoint: PollingEndpoint<unknown>) => {
    if (endpoint.enabled === false) {
      return;
    }

    const existing = pollIntervalsRef.current.get(endpoint.key);
    if (existing) {
      clearInterval(existing);
    }

    const poll = async () => {
      try {
        const data = await endpoint.fetcher();
        endpoint.onData?.(data);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        endpoint.onError?.(error);
      }
    };

    poll();

    const intervalId = setInterval(poll, endpoint.interval);
    pollIntervalsRef.current.set(endpoint.key, intervalId);
  }, []);

  const stopPollingEndpoint = useCallback((key: string) => {
    const intervalId = pollIntervalsRef.current.get(key);
    if (intervalId) {
      clearInterval(intervalId);
      pollIntervalsRef.current.delete(key);
    }
  }, []);

  const startAllPolling = useCallback(() => {
    for (const endpoint of endpointsRef.current.values()) {
      startPollingEndpoint(endpoint);
    }
  }, [startPollingEndpoint]);

  const stopAllPolling = useCallback(() => {
    for (const key of pollIntervalsRef.current.keys()) {
      stopPollingEndpoint(key);
    }
  }, [stopPollingEndpoint]);

  const enablePolling = useCallback(() => {
    setIsPolling(true);
    startAllPolling();
  }, [startAllPolling]);

  const disablePolling = useCallback(() => {
    setIsPolling(false);
    stopAllPolling();
  }, [stopAllPolling]);

  const addEndpoint = useCallback(
    <T>(endpoint: PollingEndpoint<T>) => {
      endpointsRef.current.set(endpoint.key, endpoint as PollingEndpoint<unknown>);
      if (isPolling) {
        startPollingEndpoint(endpoint as PollingEndpoint<unknown>);
      }
    },
    [isPolling, startPollingEndpoint]
  );

  const removeEndpoint = useCallback(
    (key: string) => {
      stopPollingEndpoint(key);
      endpointsRef.current.delete(key);
    },
    [stopPollingEndpoint]
  );

  useEffect(() => {
    if (wsConnected) {
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
      if (disconnectedAtRef.current === null) {
        disconnectedAtRef.current = Date.now();
        const thresholdSeconds = Math.ceil(disconnectThreshold / 1000);
        setPollingActivatesIn(thresholdSeconds);

        countdownIntervalRef.current = setInterval(() => {
          const elapsed = Date.now() - (disconnectedAtRef.current ?? Date.now());
          const remaining = Math.max(0, Math.ceil((disconnectThreshold - elapsed) / 1000));
          setPollingActivatesIn(remaining);

          if (remaining <= 0 && countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
        }, 1000);

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
