/**
 * Cycle Analytics Query Hooks
 *
 * TanStack Query hooks for cycle-level analytics.
 */

import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";
import type {
	AnalyticsPeriod,
	ConfidenceCalibrationBin,
	CycleAnalyticsSummary,
	DecisionAnalytics,
	StrategyBreakdownItem,
} from "@/lib/api/types";

export interface CycleAnalyticsFilters {
	environment?: string;
	fromDate?: string;
	toDate?: string;
	period?: AnalyticsPeriod;
}

function buildQueryString(filters: CycleAnalyticsFilters): string {
	const params = new URLSearchParams();
	if (filters.environment) {
		params.set("environment", filters.environment);
	}
	if (filters.fromDate) {
		params.set("fromDate", filters.fromDate);
	}
	if (filters.toDate) {
		params.set("toDate", filters.toDate);
	}
	if (filters.period) {
		params.set("period", filters.period);
	}
	const qs = params.toString();
	return qs ? `?${qs}` : "";
}

export function useCycleAnalyticsSummary(filters: CycleAnalyticsFilters = {}) {
	return useQuery({
		queryKey: queryKeys.cycles.analytics.summary(filters as Record<string, unknown>),
		queryFn: async () => {
			const { data } = await get<CycleAnalyticsSummary>(
				`/api/cycles/analytics/summary${buildQueryString(filters)}`,
			);
			return data;
		},
		staleTime: STALE_TIMES.DECISIONS,
		gcTime: CACHE_TIMES.DECISIONS,
	});
}

export function useDecisionAnalytics(filters: CycleAnalyticsFilters = {}) {
	return useQuery({
		queryKey: queryKeys.cycles.analytics.decisions(filters as Record<string, unknown>),
		queryFn: async () => {
			const { data } = await get<DecisionAnalytics>(
				`/api/cycles/analytics/decisions${buildQueryString(filters)}`,
			);
			return data;
		},
		staleTime: STALE_TIMES.DECISIONS,
		gcTime: CACHE_TIMES.DECISIONS,
	});
}

export function useConfidenceCalibration(filters: CycleAnalyticsFilters = {}) {
	return useQuery({
		queryKey: queryKeys.cycles.analytics.calibration(filters as Record<string, unknown>),
		queryFn: async () => {
			const { data } = await get<ConfidenceCalibrationBin[]>(
				`/api/cycles/analytics/calibration${buildQueryString(filters)}`,
			);
			return data;
		},
		staleTime: STALE_TIMES.DECISIONS,
		gcTime: CACHE_TIMES.DECISIONS,
	});
}

export function useStrategyBreakdown(filters: CycleAnalyticsFilters = {}) {
	return useQuery({
		queryKey: queryKeys.cycles.analytics.strategies(filters as Record<string, unknown>),
		queryFn: async () => {
			const { data } = await get<StrategyBreakdownItem[]>(
				`/api/cycles/analytics/strategies${buildQueryString(filters)}`,
			);
			return data;
		},
		staleTime: STALE_TIMES.DECISIONS,
		gcTime: CACHE_TIMES.DECISIONS,
	});
}
