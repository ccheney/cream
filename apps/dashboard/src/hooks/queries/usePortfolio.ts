import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, put } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";
import type {
	Account,
	EquityPoint,
	PerformanceMetrics,
	PortfolioHistory,
	PortfolioHistoryPeriod,
	PortfolioSummary,
	Position,
	PositionDetail,
} from "@/lib/api/types";

export function usePortfolioSummary() {
	return useQuery({
		queryKey: queryKeys.portfolio.summary(),
		queryFn: async () => {
			const { data } = await get<PortfolioSummary>("/api/portfolio/summary");
			return data;
		},
		staleTime: STALE_TIMES.PORTFOLIO,
		gcTime: CACHE_TIMES.PORTFOLIO,
	});
}

export function useAccount() {
	return useQuery({
		queryKey: queryKeys.portfolio.account(),
		queryFn: async () => {
			const { data } = await get<Account>("/api/portfolio/account");
			return data;
		},
		staleTime: STALE_TIMES.PORTFOLIO,
		gcTime: CACHE_TIMES.PORTFOLIO,
	});
}

export function usePortfolioHistory(period: PortfolioHistoryPeriod = "1M") {
	return useQuery({
		queryKey: queryKeys.portfolio.history(period),
		queryFn: async () => {
			const { data } = await get<PortfolioHistory>(`/api/portfolio/history?period=${period}`);
			return data;
		},
		staleTime: STALE_TIMES.CHART,
		gcTime: CACHE_TIMES.CHART,
	});
}

export function usePositions() {
	return useQuery({
		queryKey: queryKeys.portfolio.positions(),
		queryFn: async () => {
			const { data } = await get<Position[]>("/api/portfolio/positions");
			return data;
		},
		staleTime: STALE_TIMES.PORTFOLIO,
		gcTime: CACHE_TIMES.PORTFOLIO,
	});
}

export function usePositionDetail(id: string) {
	return useQuery({
		queryKey: queryKeys.portfolio.position(id),
		queryFn: async () => {
			const { data } = await get<PositionDetail>(`/api/portfolio/positions/${id}`);
			return data;
		},
		staleTime: STALE_TIMES.PORTFOLIO,
		gcTime: CACHE_TIMES.PORTFOLIO,
		enabled: Boolean(id),
	});
}

export function useEquityCurve(days = 30) {
	return useQuery({
		queryKey: [...queryKeys.portfolio.all, "equity", days] as const,
		queryFn: async () => {
			const { data } = await get<EquityPoint[]>(`/api/portfolio/equity?days=${days}`);
			return data;
		},
		staleTime: STALE_TIMES.CHART,
		gcTime: CACHE_TIMES.CHART,
	});
}

export function usePerformanceMetrics() {
	return useQuery({
		queryKey: [...queryKeys.portfolio.all, "performance"] as const,
		queryFn: async () => {
			const { data } = await get<PerformanceMetrics>("/api/portfolio/performance");
			return data;
		},
		staleTime: STALE_TIMES.PORTFOLIO,
		gcTime: CACHE_TIMES.PORTFOLIO,
	});
}

export function useClosePosition() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (positionId: string) => {
			await del(`/api/portfolio/positions/${positionId}`);
			return positionId;
		},
		onSuccess: (positionId) => {
			queryClient.removeQueries({ queryKey: queryKeys.portfolio.position(positionId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.all });
		},
	});
}

export function useModifyStop() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ positionId, stop }: { positionId: string; stop: number }) => {
			const { data } = await put<Position>(`/api/portfolio/positions/${positionId}/stop`, {
				stop,
			});
			return data;
		},
		onSuccess: (data, { positionId }) => {
			queryClient.setQueryData(
				queryKeys.portfolio.position(positionId),
				(old: PositionDetail | undefined) => (old ? { ...old, stop: data.stop } : undefined)
			);
			queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.positions() });
		},
	});
}

export function useModifyTarget() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ positionId, target }: { positionId: string; target: number }) => {
			const { data } = await put<Position>(`/api/portfolio/positions/${positionId}/target`, {
				target,
			});
			return data;
		},
		onSuccess: (data, { positionId }) => {
			queryClient.setQueryData(
				queryKeys.portfolio.position(positionId),
				(old: PositionDetail | undefined) => (old ? { ...old, target: data.target } : undefined)
			);
			queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.positions() });
		},
	});
}
