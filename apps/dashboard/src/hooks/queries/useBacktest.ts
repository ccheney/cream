/**
 * Backtest Query Hooks
 *
 * TanStack Query hooks for backtests.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, post } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";
import type {
	BacktestSummary,
	BacktestTrade,
	CreateBacktestRequest,
	EquityPoint,
} from "@/lib/api/types";

/**
 * Get all backtests.
 */
export function useBacktests() {
	return useQuery({
		queryKey: queryKeys.backtests.all,
		queryFn: async () => {
			const { data } = await get<BacktestSummary[]>("/api/backtests");
			return data;
		},
		staleTime: STALE_TIMES.DEFAULT,
		gcTime: CACHE_TIMES.DEFAULT,
	});
}

/**
 * Get backtest detail.
 */
export function useBacktest(id: string) {
	return useQuery({
		queryKey: queryKeys.backtests.detail(id),
		queryFn: async () => {
			const { data } = await get<BacktestSummary>(`/api/backtests/${id}`);
			return data;
		},
		staleTime: STALE_TIMES.DEFAULT,
		gcTime: CACHE_TIMES.DEFAULT,
		enabled: Boolean(id),
		refetchInterval: (query) => {
			// Poll while running
			const data = query.state.data;
			if (data?.status === "running" || data?.status === "pending") {
				return 2000;
			}
			return false;
		},
	});
}

/**
 * Get backtest trades.
 */
export function useBacktestTrades(id: string) {
	return useQuery({
		queryKey: [...queryKeys.backtests.detail(id), "trades"] as const,
		queryFn: async () => {
			const { data } = await get<BacktestTrade[]>(`/api/backtests/${id}/trades`);
			return data;
		},
		staleTime: STALE_TIMES.DEFAULT,
		gcTime: CACHE_TIMES.DEFAULT,
		enabled: Boolean(id),
	});
}

/**
 * Get backtest equity curve.
 */
export function useBacktestEquity(id: string) {
	return useQuery({
		queryKey: [...queryKeys.backtests.detail(id), "equity"] as const,
		queryFn: async () => {
			const { data } = await get<EquityPoint[]>(`/api/backtests/${id}/equity`);
			return data;
		},
		staleTime: STALE_TIMES.DEFAULT,
		gcTime: CACHE_TIMES.DEFAULT,
		enabled: Boolean(id),
	});
}

/**
 * Create a new backtest.
 */
export function useCreateBacktest() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (request: CreateBacktestRequest) => {
			const { data } = await post<BacktestSummary>("/api/backtests", request);
			return data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.backtests.all });
		},
	});
}

/**
 * Delete a backtest.
 */
export function useDeleteBacktest() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			await del(`/api/backtests/${id}`);
			return id;
		},
		onSuccess: (id) => {
			queryClient.removeQueries({ queryKey: queryKeys.backtests.detail(id) });
			queryClient.invalidateQueries({ queryKey: queryKeys.backtests.all });
		},
	});
}
