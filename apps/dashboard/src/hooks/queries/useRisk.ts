/**
 * Risk Query Hooks
 *
 * TanStack Query hooks for risk metrics.
 */

import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";
import type {
	CorrelationMatrix,
	ExposureMetrics,
	GreeksSummary,
	LimitStatus,
	VaRMetrics,
} from "@/lib/api/types";

/**
 * Get exposure metrics.
 */
export function useExposure() {
	return useQuery({
		queryKey: [...queryKeys.risk.all, "exposure"] as const,
		queryFn: async () => {
			const { data } = await get<ExposureMetrics>("/api/risk/exposure");
			return data;
		},
		staleTime: STALE_TIMES.PORTFOLIO,
		gcTime: CACHE_TIMES.PORTFOLIO,
		refetchInterval: 10000,
	});
}

/**
 * Get Greeks summary.
 */
export function useGreeks() {
	return useQuery({
		queryKey: [...queryKeys.risk.all, "greeks"] as const,
		queryFn: async () => {
			const { data } = await get<GreeksSummary>("/api/risk/greeks");
			return data;
		},
		staleTime: STALE_TIMES.PORTFOLIO,
		gcTime: CACHE_TIMES.PORTFOLIO,
	});
}

/**
 * Get correlation matrix.
 */
export function useCorrelation() {
	return useQuery({
		queryKey: [...queryKeys.risk.all, "correlation"] as const,
		queryFn: async () => {
			const { data } = await get<CorrelationMatrix>("/api/risk/correlation");
			return data;
		},
		staleTime: STALE_TIMES.CHART,
		gcTime: CACHE_TIMES.CHART,
	});
}

/**
 * Get VaR metrics.
 */
export function useVaR() {
	return useQuery({
		queryKey: [...queryKeys.risk.all, "var"] as const,
		queryFn: async () => {
			const { data } = await get<VaRMetrics>("/api/risk/var");
			return data;
		},
		staleTime: STALE_TIMES.PORTFOLIO,
		gcTime: CACHE_TIMES.PORTFOLIO,
	});
}

/**
 * Get limit statuses.
 */
export function useLimits() {
	return useQuery({
		queryKey: [...queryKeys.risk.all, "limits"] as const,
		queryFn: async () => {
			const { data } = await get<LimitStatus[]>("/api/risk/limits");
			return data;
		},
		staleTime: STALE_TIMES.PORTFOLIO,
		gcTime: CACHE_TIMES.PORTFOLIO,
		refetchInterval: 10000,
	});
}
