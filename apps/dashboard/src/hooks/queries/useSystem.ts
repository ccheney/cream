/**
 * System Query Hooks
 *
 * TanStack Query hooks for system status and control.
 *
 * @see docs/plans/ui/05-api-endpoints.md
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";
import type {
  EnvironmentRequest,
  HealthResponse,
  StartRequest,
  StopRequest,
  SystemStatus,
} from "@/lib/api/types";

// ============================================
// Queries
// ============================================

/**
 * Get current system status.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useSystemStatus();
 * return <div>Status: {data?.status}</div>;
 * ```
 */
export function useSystemStatus() {
  return useQuery({
    queryKey: queryKeys.system.status(),
    queryFn: async () => {
      const { data } = await get<SystemStatus>("/api/system/status");
      return data;
    },
    staleTime: STALE_TIMES.PORTFOLIO,
    gcTime: CACHE_TIMES.PORTFOLIO,
    refetchInterval: 5000, // Poll every 5 seconds
  });
}

/**
 * Get system health check.
 *
 * @example
 * ```tsx
 * const { data } = useSystemHealth();
 * return <div>Health: {data?.status}</div>;
 * ```
 */
export function useSystemHealth() {
  return useQuery({
    queryKey: [...queryKeys.system.all, "health"] as const,
    queryFn: async () => {
      const { data } = await get<HealthResponse>("/health");
      return data;
    },
    staleTime: STALE_TIMES.DEFAULT,
    gcTime: CACHE_TIMES.DEFAULT,
  });
}

// ============================================
// Mutations
// ============================================

/**
 * Start the trading system.
 *
 * @example
 * ```tsx
 * const { mutate, isPending } = useStartSystem();
 * return (
 *   <button onClick={() => mutate({ environment: 'PAPER' })} disabled={isPending}>
 *     Start
 *   </button>
 * );
 * ```
 */
export function useStartSystem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request?: StartRequest) => {
      const { data } = await post<SystemStatus>("/api/system/start", request);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.system.status(), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.system.all });
    },
  });
}

/**
 * Stop the trading system.
 *
 * @example
 * ```tsx
 * const { mutate, isPending } = useStopSystem();
 * return (
 *   <button onClick={() => mutate({ closeAllPositions: true })} disabled={isPending}>
 *     Stop
 *   </button>
 * );
 * ```
 */
export function useStopSystem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request?: StopRequest) => {
      const { data } = await post<SystemStatus>("/api/system/stop", request);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.system.status(), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.system.all });
    },
  });
}

/**
 * Pause the trading system.
 *
 * @example
 * ```tsx
 * const { mutate, isPending } = usePauseSystem();
 * return (
 *   <button onClick={() => mutate()} disabled={isPending}>
 *     Pause
 *   </button>
 * );
 * ```
 */
export function usePauseSystem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await post<SystemStatus>("/api/system/pause");
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.system.status(), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.system.all });
    },
  });
}

/**
 * Change the trading environment.
 *
 * @example
 * ```tsx
 * const { mutate, isPending } = useChangeEnvironment();
 * return (
 *   <button
 *     onClick={() => mutate({ environment: 'LIVE', confirmLive: true })}
 *     disabled={isPending}
 *   >
 *     Switch to LIVE
 *   </button>
 * );
 * ```
 */
export function useChangeEnvironment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: EnvironmentRequest) => {
      const { data } = await post<SystemStatus>("/api/system/environment", request);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.system.status(), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.system.all });
    },
  });
}
