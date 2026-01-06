/**
 * Portfolio Query Hooks
 *
 * TanStack Query hooks for portfolio data.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, put } from "@/lib/api/client";
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

// ============================================
// Mutations
// ============================================

/**
 * Close a position.
 *
 * @example
 * ```tsx
 * const { mutate, isPending } = useClosePosition();
 * return (
 *   <button onClick={() => mutate(positionId)} disabled={isPending}>
 *     Close Position
 *   </button>
 * );
 * ```
 */
export function useClosePosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (positionId: string) => {
      await del(`/api/portfolio/positions/${positionId}`);
      return positionId;
    },
    onSuccess: (positionId) => {
      queryClient.removeQueries({ queryKey: queryKeys.portfolio.position(positionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.all });
    },
  });
}

/**
 * Modify stop loss for a position.
 *
 * @example
 * ```tsx
 * const { mutate, isPending } = useModifyStop();
 * return (
 *   <button
 *     onClick={() => mutate({ positionId: "pos-123", stop: 150.00 })}
 *     disabled={isPending}
 *   >
 *     Update Stop
 *   </button>
 * );
 * ```
 */
export function useModifyStop() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ positionId, stop }: { positionId: string; stop: number }) => {
      const { data } = await put<Position>(`/api/portfolio/positions/${positionId}/stop`, {
        stop,
      });
      return data;
    },
    onSuccess: (data, { positionId }) => {
      queryClient.setQueryData(
        queryKeys.portfolio.position(positionId),
        (old: PositionDetail | undefined) => (old ? { ...old, stop: data.stop } : undefined)
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.positions() });
    },
  });
}

/**
 * Modify target price for a position.
 *
 * @example
 * ```tsx
 * const { mutate, isPending } = useModifyTarget();
 * return (
 *   <button
 *     onClick={() => mutate({ positionId: "pos-123", target: 200.00 })}
 *     disabled={isPending}
 *   >
 *     Update Target
 *   </button>
 * );
 * ```
 */
export function useModifyTarget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ positionId, target }: { positionId: string; target: number }) => {
      const { data } = await put<Position>(`/api/portfolio/positions/${positionId}/target`, {
        target,
      });
      return data;
    },
    onSuccess: (data, { positionId }) => {
      queryClient.setQueryData(
        queryKeys.portfolio.position(positionId),
        (old: PositionDetail | undefined) => (old ? { ...old, target: data.target } : undefined)
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.positions() });
    },
  });
}
