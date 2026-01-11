/**
 * Batch Status Query Hooks
 *
 * TanStack Query hooks for fetching indicator batch job status.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api/client";
import { CACHE_TIMES, STALE_TIMES } from "@/lib/api/query-client";

// ============================================
// Types
// ============================================

export type SyncRunType = "fundamentals" | "short_interest" | "sentiment" | "corporate_actions";

export type SyncRunStatus = "running" | "completed" | "failed";

export interface SyncRun {
  id: string;
  run_type: SyncRunType;
  started_at: string;
  completed_at: string | null;
  symbols_processed: number;
  symbols_failed: number;
  status: SyncRunStatus;
  error_message: string | null;
  environment: string;
}

export interface BatchStatusSummary {
  total_runs: number;
  running: number;
  completed: number;
  failed: number;
  last_completed: Record<SyncRunType, string | null>;
}

export interface BatchStatusResponse {
  runs: SyncRun[];
  summary: BatchStatusSummary;
}

export interface BatchStatusFilters {
  limit?: number;
  type?: SyncRunType;
  status?: SyncRunStatus;
}

// ============================================
// Query Keys
// ============================================

export const batchStatusKeys = {
  all: ["batchStatus"] as const,
  list: (filters?: BatchStatusFilters) =>
    filters
      ? ([...batchStatusKeys.all, "list", filters] as const)
      : ([...batchStatusKeys.all, "list"] as const),
  detail: (id: string) => [...batchStatusKeys.all, "detail", id] as const,
};

// ============================================
// Query Hooks
// ============================================

/**
 * Fetch batch job status with optional filters.
 */
export function useBatchStatus(filters?: BatchStatusFilters) {
  const params = new URLSearchParams();
  if (filters?.limit) {
    params.set("limit", String(filters.limit));
  }
  if (filters?.type) {
    params.set("type", filters.type);
  }
  if (filters?.status) {
    params.set("status", filters.status);
  }

  const queryString = params.toString();
  const url = queryString
    ? `/api/indicators/batch/status?${queryString}`
    : "/api/indicators/batch/status";

  return useQuery({
    queryKey: batchStatusKeys.list(filters),
    queryFn: async () => {
      const { data } = await get<BatchStatusResponse>(url);
      return data;
    },
    staleTime: STALE_TIMES.DEFAULT,
    gcTime: CACHE_TIMES.DEFAULT,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

/**
 * Fetch a single batch run by ID.
 */
export function useBatchRunDetail(id: string) {
  return useQuery({
    queryKey: batchStatusKeys.detail(id),
    queryFn: async () => {
      const { data } = await get<{ run: SyncRun }>(`/api/indicators/batch/status/${id}`);
      return data.run;
    },
    staleTime: STALE_TIMES.DEFAULT,
    gcTime: CACHE_TIMES.DEFAULT,
    enabled: Boolean(id),
  });
}

/**
 * Trigger a manual batch sync run.
 */
export function useTriggerBatchSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (runType: SyncRunType) => {
      const { data } = await post<{ run: SyncRun }>("/api/indicators/batch/trigger", {
        run_type: runType,
      });
      return data.run;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: batchStatusKeys.all });
    },
  });
}
