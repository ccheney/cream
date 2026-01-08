/**
 * Config Query Hooks
 *
 * TanStack Query hooks for system configuration.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post, put } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";
import type {
  ConfigHistoryEntry,
  Configuration,
  ConfigVersion,
  ConstraintsConfig,
  Environment,
  FullRuntimeConfig,
  SaveDraftInput,
  UniverseConfig,
  ValidationResult,
} from "@/lib/api/types";

/**
 * Get current configuration.
 */
export function useConfig() {
  return useQuery({
    queryKey: queryKeys.config.all,
    queryFn: async () => {
      const { data } = await get<Configuration>("/api/config");
      return data;
    },
    staleTime: STALE_TIMES.CONFIG,
    gcTime: CACHE_TIMES.CONFIG,
  });
}

/**
 * Update configuration.
 */
export function useUpdateConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<Configuration>) => {
      const { data } = await put<Configuration>("/api/config", updates);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.config.all, data);
      queryClient.invalidateQueries({ queryKey: [...queryKeys.config.all, "history"] });
    },
  });
}

/**
 * Get configuration history.
 */
export function useConfigHistory() {
  return useQuery({
    queryKey: [...queryKeys.config.all, "history"] as const,
    queryFn: async () => {
      const { data } = await get<ConfigVersion[]>("/api/config/history");
      return data;
    },
    staleTime: STALE_TIMES.CONFIG,
    gcTime: CACHE_TIMES.CONFIG,
  });
}

/**
 * Reset configuration to defaults.
 */
export function useResetConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await post<Configuration>("/api/config/reset");
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.config.all, data);
      queryClient.invalidateQueries({ queryKey: [...queryKeys.config.all, "history"] });
    },
  });
}

/**
 * Get universe configuration.
 */
export function useUniverseConfig() {
  return useQuery({
    queryKey: [...queryKeys.config.all, "universe"] as const,
    queryFn: async () => {
      const { data } = await get<UniverseConfig>("/api/config/universe");
      return data;
    },
    staleTime: STALE_TIMES.CONFIG,
    gcTime: CACHE_TIMES.CONFIG,
  });
}

/**
 * Update universe configuration.
 */
export function useUpdateUniverseConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (universe: UniverseConfig) => {
      const { data } = await put<UniverseConfig>("/api/config/universe", universe);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData([...queryKeys.config.all, "universe"], data);
      queryClient.invalidateQueries({ queryKey: queryKeys.config.all });
    },
  });
}

/**
 * Get constraints configuration.
 */
export function useConstraintsConfig() {
  return useQuery({
    queryKey: [...queryKeys.config.all, "constraints"] as const,
    queryFn: async () => {
      const { data } = await get<ConstraintsConfig>("/api/config/constraints");
      return data;
    },
    staleTime: STALE_TIMES.CONFIG,
    gcTime: CACHE_TIMES.CONFIG,
  });
}

/**
 * Update constraints configuration.
 */
export function useUpdateConstraintsConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (constraints: ConstraintsConfig) => {
      const { data } = await put<ConstraintsConfig>("/api/config/constraints", constraints);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData([...queryKeys.config.all, "constraints"], data);
      queryClient.invalidateQueries({ queryKey: queryKeys.config.all });
    },
  });
}

// ============================================
// Runtime Config Hooks (Database-backed)
// ============================================

/**
 * Get active runtime configuration.
 */
export function useActiveConfig(environment: Environment = "PAPER") {
  return useQuery({
    queryKey: [...queryKeys.config.all, "active", environment] as const,
    queryFn: async () => {
      const { data } = await get<FullRuntimeConfig>(`/api/config/active?env=${environment}`);
      return data;
    },
    staleTime: STALE_TIMES.CONFIG,
    gcTime: CACHE_TIMES.CONFIG,
  });
}

/**
 * Get draft runtime configuration.
 */
export function useDraftConfig(environment: Environment = "PAPER") {
  return useQuery({
    queryKey: [...queryKeys.config.all, "draft", environment] as const,
    queryFn: async () => {
      const { data } = await get<FullRuntimeConfig>(`/api/config/draft?env=${environment}`);
      return data;
    },
    staleTime: STALE_TIMES.CONFIG,
    gcTime: CACHE_TIMES.CONFIG,
  });
}

/**
 * Save draft configuration.
 */
export function useSaveDraft(environment: Environment = "PAPER") {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: SaveDraftInput) => {
      const { data } = await put<FullRuntimeConfig>(
        `/api/config/draft?env=${environment}`,
        updates
      );
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData([...queryKeys.config.all, "draft", environment], data);
    },
  });
}

/**
 * Validate draft for promotion.
 */
export function useValidateDraft(environment: Environment = "PAPER") {
  return useMutation({
    mutationFn: async () => {
      const { data } = await post<ValidationResult>(`/api/config/validate?env=${environment}`);
      return data;
    },
  });
}

/**
 * Promote draft to active.
 */
export function usePromoteDraft(environment: Environment = "PAPER") {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await post<FullRuntimeConfig>(`/api/config/promote?env=${environment}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData([...queryKeys.config.all, "active", environment], data);
      queryClient.invalidateQueries({ queryKey: [...queryKeys.config.all, "draft", environment] });
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.config.all, "history", environment],
      });
    },
  });
}

/**
 * Get runtime config history.
 */
export function useRuntimeConfigHistory(environment: Environment = "PAPER", limit = 20) {
  return useQuery({
    queryKey: [...queryKeys.config.all, "history", environment, limit] as const,
    queryFn: async () => {
      const { data } = await get<ConfigHistoryEntry[]>(
        `/api/config/history?env=${environment}&limit=${limit}`
      );
      return data;
    },
    staleTime: STALE_TIMES.CONFIG,
    gcTime: CACHE_TIMES.CONFIG,
  });
}

/**
 * Rollback to a previous configuration.
 */
export function useRollbackConfig(environment: Environment = "PAPER") {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (versionId: string) => {
      const { data } = await post<FullRuntimeConfig>(`/api/config/rollback?env=${environment}`, {
        versionId,
      });
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData([...queryKeys.config.all, "active", environment], data);
      queryClient.invalidateQueries({ queryKey: [...queryKeys.config.all, "draft", environment] });
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.config.all, "history", environment],
      });
    },
  });
}
