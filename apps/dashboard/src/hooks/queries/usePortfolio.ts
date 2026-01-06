/**
 * Portfolio Query Hooks
 *
 * TanStack Query hooks for portfolio data.
 */

import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";
import type {
  EquityPoint,
  PerformanceMetrics,
  PortfolioSummary,
  Position,
  PositionDetail,
} from "@/lib/api/types";

/**
 * Get portfolio summary.
 */
export function usePortfolioSummary() {
  return useQuery({
    queryKey: queryKeys.portfolio.summary(),
    queryFn: async () => {
      const { data } = await get<PortfolioSummary>("/api/portfolio/summary");
      return data;
    },
    staleTime: STALE_TIMES.PORTFOLIO,
    gcTime: CACHE_TIMES.PORTFOLIO,
    refetchInterval: 5000,
  });
}

/**
 * Get all positions.
 */
export function usePositions() {
  return useQuery({
    queryKey: queryKeys.portfolio.positions(),
    queryFn: async () => {
      const { data } = await get<Position[]>("/api/portfolio/positions");
      return data;
    },
    staleTime: STALE_TIMES.PORTFOLIO,
    gcTime: CACHE_TIMES.PORTFOLIO,
    refetchInterval: 5000,
  });
}

/**
 * Get position detail.
 */
export function usePositionDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.portfolio.position(id),
    queryFn: async () => {
      const { data } = await get<PositionDetail>(`/api/portfolio/positions/${id}`);
      return data;
    },
    staleTime: STALE_TIMES.PORTFOLIO,
    gcTime: CACHE_TIMES.PORTFOLIO,
    enabled: Boolean(id),
  });
}

/**
 * Get equity curve.
 */
export function useEquityCurve(days = 30) {
  return useQuery({
    queryKey: [...queryKeys.portfolio.all, "equity", days] as const,
    queryFn: async () => {
      const { data } = await get<EquityPoint[]>(`/api/portfolio/equity?days=${days}`);
      return data;
    },
    staleTime: STALE_TIMES.CHART,
    gcTime: CACHE_TIMES.CHART,
  });
}

/**
 * Get performance metrics.
 */
export function usePerformanceMetrics() {
  return useQuery({
    queryKey: [...queryKeys.portfolio.all, "performance"] as const,
    queryFn: async () => {
      const { data } = await get<PerformanceMetrics>("/api/portfolio/performance");
      return data;
    },
    staleTime: STALE_TIMES.PORTFOLIO,
    gcTime: CACHE_TIMES.PORTFOLIO,
  });
}
