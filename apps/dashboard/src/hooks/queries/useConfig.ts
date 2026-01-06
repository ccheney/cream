/**
 * Config Query Hooks
 *
 * TanStack Query hooks for system configuration.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post, put } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";
import type {
  Configuration,
  ConfigVersion,
  ConstraintsConfig,
  UniverseConfig,
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
