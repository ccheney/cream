/**
 * Market Query Hooks
 *
 * TanStack Query hooks for market data with WebSocket streaming.
 * Quote data is sourced exclusively from WebSocket - no REST fallback.
 * Other market data (candles, indicators) still uses REST API.
 */

import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
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
      queryFn: () => queryClient.getQueryData<Quote>(queryKeys.market.quote(symbol)),
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
 * Get single quote via WebSocket streaming only.
 *
 * Data is populated exclusively by WebSocket messages updating the query cache.
 * No REST API calls are made for quotes.
 */
export function useQuote(symbol: string) {
  const queryClient = useQueryClient();
  const { connected, subscribeSymbols } = useWebSocketContext();

  // Subscribe symbol to WebSocket when connected
  useEffect(() => {
    if (connected && symbol) {
      subscribeSymbols([symbol]);
    }
  }, [connected, symbol, subscribeSymbols]);

  const query = useQuery({
    queryKey: queryKeys.market.quote(symbol),
    // No queryFn - data is set directly by WebSocket messages
    queryFn: () => queryClient.getQueryData<Quote>(queryKeys.market.quote(symbol)),
    staleTime: Infinity, // Never stale - WebSocket keeps it fresh
    gcTime: CACHE_TIMES.MARKET,
    refetchInterval: false, // No polling - WebSocket only
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: Boolean(symbol),
  });

  return {
    ...query,
    // Override loading/error states to reflect WebSocket connection
    isLoading: !connected || (query.isLoading && !query.data),
    isError: !connected,
    error: !connected ? new Error("WebSocket not connected") : query.error,
    connected,
  };
}

/**
 * Get candle data.
 */
export function useCandles(
  symbol: string,
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d" = "1h",
  limit = 500
) {
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
