/**
 * Market Query Hooks
 *
 * TanStack Query hooks for market data with WebSocket streaming support.
 * When WebSocket is connected, quote data streams in real-time and HTTP
 * polling is disabled. Falls back to HTTP polling when WebSocket is unavailable.
 */

import { useQueries, useQuery } from "@tanstack/react-query";
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
 * Get batch quotes with WebSocket streaming support.
 *
 * When WebSocket is connected, subscribes symbols for real-time updates
 * and disables HTTP polling. Falls back to polling when disconnected.
 */
export function useQuotes(symbols: string[]) {
  const { connected, subscribeSymbols } = useWebSocketContext();

  // Subscribe symbols to WebSocket when connected
  useEffect(() => {
    if (connected && symbols.length > 0) {
      subscribeSymbols(symbols);
    }
  }, [connected, symbols, subscribeSymbols]);

  // Use individual queries for each symbol so WebSocket updates work correctly
  const queries = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: queryKeys.market.quote(symbol),
      queryFn: async () => {
        const { data } = await get<Quote>(`/api/market/quote/${symbol}`);
        return data;
      },
      staleTime: STALE_TIMES.MARKET,
      gcTime: CACHE_TIMES.MARKET,
      // Disable polling when WebSocket is connected (streaming updates cache directly)
      refetchInterval: connected ? false : 5000,
      enabled: Boolean(symbol),
    })),
  });

  // Aggregate results
  const data = useMemo(() => {
    return queries.map((q) => q.data).filter((d): d is Quote => d !== undefined);
  }, [queries]);

  const isLoading = queries.some((q) => q.isLoading);
  const isFetching = queries.some((q) => q.isFetching);
  const isError = queries.some((q) => q.isError);
  const error = queries.find((q) => q.error)?.error;

  return {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    // Expose individual query access for per-symbol updates
    queries,
  };
}

/**
 * Get single quote with WebSocket streaming support.
 *
 * When WebSocket is connected, subscribes the symbol for real-time updates
 * and disables HTTP polling. Falls back to polling when disconnected.
 */
export function useQuote(symbol: string) {
  const { connected, subscribeSymbols } = useWebSocketContext();

  // Subscribe symbol to WebSocket when connected
  useEffect(() => {
    if (connected && symbol) {
      subscribeSymbols([symbol]);
    }
  }, [connected, symbol, subscribeSymbols]);

  return useQuery({
    queryKey: queryKeys.market.quote(symbol),
    queryFn: async () => {
      const { data } = await get<Quote>(`/api/market/quote/${symbol}`);
      return data;
    },
    staleTime: STALE_TIMES.MARKET,
    gcTime: CACHE_TIMES.MARKET,
    // Disable polling when WebSocket is connected (streaming updates cache directly)
    refetchInterval: connected ? false : 5000,
    enabled: Boolean(symbol),
  });
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
