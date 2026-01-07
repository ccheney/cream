/**
 * Indicator Lab Query Hooks
 *
 * TanStack Query hooks for the Indicator Lab dashboard.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api/client";
import { CACHE_TIMES, STALE_TIMES } from "@/lib/api/query-client";

// ============================================
// Types
// ============================================

export type IndicatorStatus = "staging" | "paper" | "production" | "retired";
export type IndicatorCategory =
  | "momentum"
  | "trend"
  | "volatility"
  | "volume"
  | "custom"
  | "correlation"
  | "regime"
  | "microstructure";

export interface IndicatorSummary {
  id: string;
  name: string;
  category: IndicatorCategory;
  status: IndicatorStatus;
  hypothesis: string;
  generatedAt: string;
  promotedAt: string | null;
  retiredAt: string | null;
}

export interface IndicatorDetail extends IndicatorSummary {
  economicRationale: string;
  validationReport: unknown | null;
  paperTradingReport: unknown | null;
  paperTradingStart: string | null;
  paperTradingEnd: string | null;
  prUrl: string | null;
  codeHash: string | null;
  generatedBy: string;
}

export interface ICHistoryEntry {
  date: string;
  icValue: number;
  icStd: number;
  decisionsUsedIn: number;
  decisionsCorrect: number;
}

export interface TriggerConditions {
  rollingIC30Day: number;
  icDecayDays: number;
  daysSinceLastAttempt: number;
  activeIndicatorCount: number;
  maxIndicatorCapacity: number;
  regimeGapDetected: boolean;
  currentRegime: string | null;
}

export interface TriggerStatus {
  shouldTrigger: boolean;
  conditions: TriggerConditions;
  lastCheck: string;
  recommendation: string;
}

export interface PaperTradingIndicator {
  id: string;
  name: string;
  category: string;
  paperTradingStart: string;
  daysTrading: number;
  signalsRecorded: number;
  currentIC: number | null;
  progress: number;
}

export interface Activity {
  type: "generation" | "promotion" | "retirement" | "paper_start";
  indicatorId: string;
  name: string;
  timestamp: string;
  details: string | null;
}

// ============================================
// Query Keys
// ============================================

export const indicatorLabKeys = {
  all: ["indicatorLab"] as const,
  indicators: (filters?: { status?: IndicatorStatus; category?: IndicatorCategory }) =>
    filters
      ? ([...indicatorLabKeys.all, "indicators", filters] as const)
      : ([...indicatorLabKeys.all, "indicators"] as const),
  detail: (id: string) => [...indicatorLabKeys.all, "indicators", id] as const,
  icHistory: (id: string, days?: number) =>
    [...indicatorLabKeys.all, "indicators", id, "ic-history", days] as const,
  triggerStatus: () => [...indicatorLabKeys.all, "trigger-status"] as const,
  paperTrading: () => [...indicatorLabKeys.all, "paper-trading"] as const,
  activity: (limit?: number) => [...indicatorLabKeys.all, "activity", limit] as const,
};

// ============================================
// Query Hooks
// ============================================

/**
 * Get list of indicators with optional filtering.
 */
export function useIndicatorList(filters?: {
  status?: IndicatorStatus;
  category?: IndicatorCategory;
}) {
  const params = new URLSearchParams();
  if (filters?.status) {
    params.set("status", filters.status);
  }
  if (filters?.category) {
    params.set("category", filters.category);
  }

  const queryString = params.toString();
  const url = queryString ? `/api/indicators?${queryString}` : "/api/indicators";

  return useQuery({
    queryKey: indicatorLabKeys.indicators(filters),
    queryFn: async () => {
      const { data } = await get<{ indicators: IndicatorSummary[] }>(url);
      return data.indicators;
    },
    staleTime: STALE_TIMES.DEFAULT,
    gcTime: CACHE_TIMES.DEFAULT,
  });
}

/**
 * Get indicator detail by ID.
 */
export function useIndicatorDetail(id: string) {
  return useQuery({
    queryKey: indicatorLabKeys.detail(id),
    queryFn: async () => {
      const { data } = await get<{ indicator: IndicatorDetail }>(`/api/indicators/${id}`);
      return data.indicator;
    },
    staleTime: STALE_TIMES.DEFAULT,
    gcTime: CACHE_TIMES.DEFAULT,
    enabled: Boolean(id),
  });
}

/**
 * Get IC history for an indicator.
 */
export function useIndicatorICHistory(id: string, days = 30) {
  return useQuery({
    queryKey: indicatorLabKeys.icHistory(id, days),
    queryFn: async () => {
      const { data } = await get<{ history: ICHistoryEntry[] }>(
        `/api/indicators/${id}/ic-history?days=${days}`
      );
      return data.history;
    },
    staleTime: STALE_TIMES.HISTORICAL,
    gcTime: CACHE_TIMES.HISTORICAL,
    enabled: Boolean(id),
  });
}

/**
 * Get current trigger status for indicator generation.
 */
export function useTriggerStatus() {
  return useQuery({
    queryKey: indicatorLabKeys.triggerStatus(),
    queryFn: async () => {
      const { data } = await get<TriggerStatus>("/api/indicators/trigger-status");
      return data;
    },
    staleTime: STALE_TIMES.DEFAULT,
    gcTime: CACHE_TIMES.DEFAULT,
    refetchInterval: 60000, // Refresh every 60 seconds
  });
}

/**
 * Get paper trading indicators with progress.
 */
export function usePaperTradingIndicators() {
  return useQuery({
    queryKey: indicatorLabKeys.paperTrading(),
    queryFn: async () => {
      const { data } = await get<{ indicators: PaperTradingIndicator[] }>(
        "/api/indicators/paper-trading"
      );
      return data.indicators;
    },
    staleTime: STALE_TIMES.DEFAULT,
    gcTime: CACHE_TIMES.DEFAULT,
    refetchInterval: 60000, // Refresh every 60 seconds
  });
}

/**
 * Get recent activity log.
 */
export function useIndicatorActivity(limit = 20) {
  return useQuery({
    queryKey: indicatorLabKeys.activity(limit),
    queryFn: async () => {
      const { data } = await get<{ activities: Activity[] }>(
        `/api/indicators/activity?limit=${limit}`
      );
      return data.activities;
    },
    staleTime: STALE_TIMES.DEFAULT,
    gcTime: CACHE_TIMES.DEFAULT,
  });
}

// ============================================
// Mutation Hooks
// ============================================

/**
 * Retire an indicator.
 */
export function useRetireIndicator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { data } = await post<{ success: boolean }>(`/api/indicators/${id}/retire`, {
        reason,
      });
      return data;
    },
    onSuccess: () => {
      // Invalidate all indicator-related queries
      queryClient.invalidateQueries({ queryKey: indicatorLabKeys.all });
    },
  });
}

/**
 * Force trigger check (manual).
 */
export function useForceTriggerCheck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await post<TriggerStatus>("/api/indicators/trigger-check", {});
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: indicatorLabKeys.triggerStatus() });
    },
  });
}
