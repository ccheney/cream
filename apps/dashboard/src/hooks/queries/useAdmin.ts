/**
 * Admin Query Hooks
 *
 * TanStack Query hooks for admin functionality including
 * database query performance monitoring.
 *
 * @see docs/plans/46-postgres-drizzle-migration.md
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api/client";
import { CACHE_TIMES, STALE_TIMES } from "@/lib/api/query-client";

// ============================================
// Types
// ============================================

export interface QueryStat {
	query: string;
	calls: number;
	totalSeconds: number;
	avgMs: number;
	rows: number;
	sharedBlksHit: number;
	sharedBlksRead: number;
	hitRatio: number;
}

export interface QueryStatsSummary {
	totalQueries: number;
	avgResponseMs: number;
	overallHitRatio: number;
	slowQueryCount: number;
}

export interface QueryStatsResponse {
	stats: QueryStat[];
	summary: QueryStatsSummary;
	timestamp: string;
}

export interface QueryStatsFilters {
	limit?: number;
	sortBy?: "total_time" | "avg_time" | "calls";
}

// ============================================
// Query Keys
// ============================================

export const adminKeys = {
	all: ["admin"] as const,
	queryStats: (filters?: QueryStatsFilters) =>
		filters
			? ([...adminKeys.all, "queryStats", filters] as const)
			: ([...adminKeys.all, "queryStats"] as const),
};

// ============================================
// Query Hooks
// ============================================

/**
 * Fetch query performance statistics from pg_stat_statements.
 */
export function useQueryStats(filters?: QueryStatsFilters) {
	const params = new URLSearchParams();
	if (filters?.limit) {
		params.set("limit", String(filters.limit));
	}
	if (filters?.sortBy) {
		params.set("sortBy", filters.sortBy);
	}

	const queryString = params.toString();
	const url = queryString
		? `/api/admin/query-stats?${queryString}`
		: "/api/admin/query-stats";

	return useQuery({
		queryKey: adminKeys.queryStats(filters),
		queryFn: async () => {
			const { data } = await get<QueryStatsResponse>(url);
			return data;
		},
		staleTime: STALE_TIMES.LONG,
		gcTime: CACHE_TIMES.LONG,
		refetchInterval: 60000, // Refresh every minute
	});
}

/**
 * Reset query statistics (pg_stat_statements_reset).
 */
export function useResetQueryStats() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async () => {
			const { data } = await post<{ success: boolean; message: string; timestamp: string }>(
				"/api/admin/query-stats/reset",
				{}
			);
			return data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: adminKeys.all });
		},
	});
}
