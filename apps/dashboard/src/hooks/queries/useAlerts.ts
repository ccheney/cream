/**
 * Alerts Query Hooks
 *
 * TanStack Query hooks for system alerts.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post, put } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";
import type { Alert, AlertSettings } from "@/lib/api/types";

/**
 * Get all alerts.
 */
export function useAlerts() {
  return useQuery({
    queryKey: queryKeys.alerts.all,
    queryFn: async () => {
      const { data } = await get<Alert[]>("/api/alerts");
      return data;
    },
    staleTime: STALE_TIMES.PORTFOLIO,
    gcTime: CACHE_TIMES.PORTFOLIO,
    refetchInterval: 10000,
  });
}

/**
 * Get unacknowledged alerts count.
 */
export function useUnacknowledgedAlertCount() {
  return useQuery({
    queryKey: [...queryKeys.alerts.all, "unacknowledged"] as const,
    queryFn: async () => {
      const { data } = await get<{ count: number }>("/api/alerts/unacknowledged/count");
      return data.count;
    },
    staleTime: STALE_TIMES.PORTFOLIO,
    gcTime: CACHE_TIMES.PORTFOLIO,
    refetchInterval: 10000,
  });
}

/**
 * Get alert settings.
 */
export function useAlertSettings() {
  return useQuery({
    queryKey: [...queryKeys.alerts.all, "settings"] as const,
    queryFn: async () => {
      const { data } = await get<AlertSettings>("/api/alerts/settings");
      return data;
    },
    staleTime: STALE_TIMES.CONFIG,
    gcTime: CACHE_TIMES.CONFIG,
  });
}

// ============================================
// Mutations
// ============================================

/**
 * Acknowledge an alert.
 *
 * @example
 * ```tsx
 * const { mutate, isPending } = useAcknowledgeAlert();
 * return (
 *   <button onClick={() => mutate(alertId)} disabled={isPending}>
 *     Acknowledge
 *   </button>
 * );
 * ```
 */
export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: string) => {
      const { data } = await post<Alert>(`/api/alerts/${alertId}/acknowledge`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
    },
  });
}

/**
 * Acknowledge all alerts.
 *
 * @example
 * ```tsx
 * const { mutate, isPending } = useAcknowledgeAllAlerts();
 * return (
 *   <button onClick={() => mutate()} disabled={isPending}>
 *     Acknowledge All
 *   </button>
 * );
 * ```
 */
export function useAcknowledgeAllAlerts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await post("/api/alerts/acknowledge-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
    },
  });
}

/**
 * Dismiss an alert (remove from view).
 *
 * @example
 * ```tsx
 * const { mutate, isPending } = useDismissAlert();
 * return (
 *   <button onClick={() => mutate(alertId)} disabled={isPending}>
 *     Dismiss
 *   </button>
 * );
 * ```
 */
export function useDismissAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: string) => {
      await post(`/api/alerts/${alertId}/dismiss`);
      return alertId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
    },
  });
}

/**
 * Update alert settings.
 *
 * @example
 * ```tsx
 * const { mutate, isPending } = useUpdateAlertSettings();
 * return (
 *   <button
 *     onClick={() => mutate({ enablePush: true, criticalOnly: false })}
 *     disabled={isPending}
 *   >
 *     Save Settings
 *   </button>
 * );
 * ```
 */
export function useUpdateAlertSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: Partial<AlertSettings>) => {
      const { data } = await put<AlertSettings>("/api/alerts/settings", settings);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData([...queryKeys.alerts.all, "settings"], data);
    },
  });
}
