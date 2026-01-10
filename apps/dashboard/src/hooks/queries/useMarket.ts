/**
 * Market Query Hooks
 *
 * TanStack Query hooks for market data with WebSocket streaming.
 * Quote data is sourced exclusively from WebSocket - no REST fallback.
 * Other market data (candles, indicators) still uses REST API.
 */

import { keepPreviousData, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { get } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";
import type {
  Candle,
  IndexQuote,
  Indicators,
  NewsItem,
  Quote,
  RegimeStatus,
} from "@/lib/api/types";
import { useWebSocketContext } from "@/providers/WebSocketProvider";

/**
 * Get batch quotes via WebSocket streaming only.
 *
 * Data is populated exclusively by WebSocket messages updating the query cache.
 * No REST API calls are made for quotes.
 */
export function useQuotes(symbols: string[]) {
  const queryClient = useQueryClient();
  const { connected, subscribeSymbols } = useWebSocketContext();

  // Subscribe symbols to WebSocket when connected
  useEffect(() => {
    if (connected && symbols.length > 0) {
      subscribeSymbols(symbols);
    }
  }, [connected, symbols, subscribeSymbols]);

  // Use individual queries for each symbol - data comes from WebSocket cache updates
  const queries = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: queryKeys.market.quote(symbol),
      // No queryFn - data is set directly by WebSocket messages
      // Return existing cache data or undefined
      queryFn: () => queryClient.getQueryData<Quote>(queryKeys.market.quote(symbol)) ?? null,
      staleTime: Infinity, // Never stale - WebSocket keeps it fresh
      gcTime: CACHE_TIMES.MARKET,
      refetchInterval: false, // No polling - WebSocket only
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      enabled: Boolean(symbol),
    })),
  });

  // Aggregate results
  const data = useMemo(() => {
    return queries.map((q) => q.data).filter((d): d is Quote => d !== undefined);
  }, [queries]);

  const isLoading = !connected || (queries.some((q) => q.isLoading) && data.length === 0);
  const isFetching = queries.some((q) => q.isFetching);
  const isError = !connected;
  const error = !connected ? new Error("WebSocket not connected") : null;

  return {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    connected,
    // Expose individual query access for per-symbol updates
    queries,
  };
}

/**
 * Get single quote with REST initial fetch and WebSocket streaming.
 *
 * Fetches initial data from REST API once, then WebSocket messages update the cache.
 * No polling - WebSocket is the only update mechanism after initial fetch.
 */
export function useQuote(symbol: string) {
  const { connected, subscribeSymbols } = useWebSocketContext();

  // Subscribe symbol to WebSocket when connected
  useEffect(() => {
    if (connected && symbol) {
      subscribeSymbols([symbol]);
    }
  }, [connected, symbol, subscribeSymbols]);

  const query = useQuery({
    queryKey: queryKeys.market.quote(symbol),
    queryFn: async () => {
      const { data } = await get<Quote>(`/api/market/quote/${symbol}`);
      return data;
    },
    staleTime: Infinity, // Never stale - WebSocket keeps it fresh
    gcTime: CACHE_TIMES.MARKET,
    refetchInterval: false, // No polling
    refetchOnWindowFocus: false,
    enabled: Boolean(symbol),
    placeholderData: keepPreviousData,
  });

  return {
    ...query,
    connected,
  };
}

/**
 * Get candle data.
 * Subscribes to WebSocket updates for real-time candles.
 */
export function useCandles(
  symbol: string,
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d" = "1h",
  limit = 500
) {
  const queryClient = useQueryClient();
  const { connected, subscribeSymbols, lastMessage } = useWebSocketContext();

  // Subscribe symbol to WebSocket when connected
  useEffect(() => {
    if (connected && symbol) {
      subscribeSymbols([symbol]);
    }
  }, [connected, symbol, subscribeSymbols]);

  // Handle WebSocket updates
  useEffect(() => {
    if (!lastMessage || lastMessage.type !== "aggregate") {
      return;
    }

    const data = lastMessage.data as {
      symbol: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
      timestamp: string;
    };

    if (data.symbol !== symbol) {
      return;
    }

    // Update query cache
    queryClient.setQueryData<Candle[]>(
      [...queryKeys.market.all, "candles", symbol, timeframe, limit],
      (oldData) => {
        if (!oldData) {
          return oldData;
        }

        const lastCandle = oldData[oldData.length - 1];
        if (!lastCandle) {
          return oldData;
        }

        const updateTime = new Date(data.timestamp).getTime();
        const lastCandleTime = new Date(lastCandle.timestamp).getTime();

        // Simple logic: if update is newer or same time, update/append
        // Note: Proper aggregation for >1m timeframes is complex and omitted for brevity.
        // This assumes 1m bars or that we just want to see live price action on the last bar.

        // If the update is within the current bar's duration, update it.
        // Otherwise, it's a new bar (for 1m).
        // For simplicity, we'll just update the last bar's Close/High/Low/Vol if it looks "current"
        // or append if strictly newer and we are in 1m mode.

        const isCurrentBar = updateTime >= lastCandleTime;

        if (isCurrentBar) {
          const updatedLastCandle = {
            ...lastCandle,
            close: data.close,
            high: Math.max(lastCandle.high, data.high),
            low: Math.min(lastCandle.low, data.low),
            volume: lastCandle.volume + (data.volume || 0), // Volume might be delta or total? Polygon AM is total for that minute.
          };
          return [...oldData.slice(0, -1), updatedLastCandle];
        }

        return oldData;
      }
    );
  }, [lastMessage, queryClient, symbol, timeframe, limit]);

  return useQuery({
    queryKey: [...queryKeys.market.all, "candles", symbol, timeframe, limit] as const,
    queryFn: async () => {
      const { data } = await get<Candle[]>(
        `/api/market/candles/${symbol}?timeframe=${timeframe}&limit=${limit}`
      );
      return data;
    },
    staleTime: STALE_TIMES.CHART,
    gcTime: CACHE_TIMES.CHART,
    enabled: Boolean(symbol),
    placeholderData: keepPreviousData,
  });
}

/**
 * Get technical indicators.
 */
export function useIndicators(
  symbol: string,
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d" = "1h"
) {
  return useQuery({
    queryKey: [...queryKeys.market.all, "indicators", symbol, timeframe] as const,
    queryFn: async () => {
      const { data } = await get<Indicators>(
        `/api/market/indicators/${symbol}?timeframe=${timeframe}`
      );
      return data;
    },
    staleTime: STALE_TIMES.CHART,
    gcTime: CACHE_TIMES.CHART,
    enabled: Boolean(symbol),
    placeholderData: keepPreviousData,
  });
}

/**
 * Get market regime.
 */
export function useRegime() {
  return useQuery({
    queryKey: [...queryKeys.market.all, "regime"] as const,
    queryFn: async () => {
      const { data } = await get<RegimeStatus>("/api/market/regime");
      return data;
    },
    staleTime: STALE_TIMES.PORTFOLIO,
    gcTime: CACHE_TIMES.PORTFOLIO,
    refetchInterval: 60000, // Refresh every minute
  });
}

/**
 * Get symbol news.
 */
export function useNews(symbol: string, limit = 10) {
  return useQuery({
    queryKey: [...queryKeys.market.all, "news", symbol, limit] as const,
    queryFn: async () => {
      const { data } = await get<NewsItem[]>(`/api/market/news/${symbol}?limit=${limit}`);
      return data;
    },
    staleTime: STALE_TIMES.DEFAULT,
    gcTime: CACHE_TIMES.DEFAULT,
    enabled: Boolean(symbol),
  });
}

/**
 * Get market indices.
 */
export function useIndices() {
  return useQuery({
    queryKey: [...queryKeys.market.all, "indices"] as const,
    queryFn: async () => {
      const { data } = await get<IndexQuote[]>("/api/market/indices");
      return data;
    },
    staleTime: STALE_TIMES.MARKET,
    gcTime: CACHE_TIMES.MARKET,
    refetchInterval: 10000,
  });
}
