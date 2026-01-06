/**
 * Market Query Hooks
 *
 * TanStack Query hooks for market data.
 */

import { useQuery } from "@tanstack/react-query";
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

/**
 * Get batch quotes.
 */
export function useQuotes(symbols: string[]) {
  const symbolStr = symbols.join(",");
  return useQuery({
    queryKey: [...queryKeys.market.all, "quotes", symbolStr] as const,
    queryFn: async () => {
      const { data } = await get<Quote[]>(`/api/market/quotes?symbols=${symbolStr}`);
      return data;
    },
    staleTime: STALE_TIMES.MARKET,
    gcTime: CACHE_TIMES.MARKET,
    refetchInterval: 5000,
    enabled: symbols.length > 0,
  });
}

/**
 * Get single quote.
 */
export function useQuote(symbol: string) {
  return useQuery({
    queryKey: [...queryKeys.market.all, "quote", symbol] as const,
    queryFn: async () => {
      const { data } = await get<Quote>(`/api/market/quote/${symbol}`);
      return data;
    },
    staleTime: STALE_TIMES.MARKET,
    gcTime: CACHE_TIMES.MARKET,
    refetchInterval: 5000,
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
