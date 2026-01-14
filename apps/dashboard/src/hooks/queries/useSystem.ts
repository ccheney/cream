// @see docs/plans/ui/05-api-endpoints.md

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";
import type {
	EnvironmentRequest,
	HealthResponse,
	StartRequest,
	StopRequest,
	SystemStatus,
	TriggerCycleRequest,
	TriggerCycleResponse,
} from "@/lib/api/types";

export function useSystemStatus() {
	return useQuery({
		queryKey: queryKeys.system.status(),
		queryFn: async () => {
			const { data } = await get<SystemStatus>("/api/system/status");
			return data;
		},
		staleTime: STALE_TIMES.PORTFOLIO,
		gcTime: CACHE_TIMES.PORTFOLIO,
	});
}

export function useSystemHealth() {
	return useQuery({
		queryKey: [...queryKeys.system.all, "health"] as const,
		queryFn: async () => {
			const { data } = await get<HealthResponse>("/health");
			return data;
		},
		staleTime: STALE_TIMES.DEFAULT,
		gcTime: CACHE_TIMES.DEFAULT,
	});
}

export function useStartSystem() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (request?: StartRequest) => {
			const { data } = await post<SystemStatus>("/api/system/start", request);
			return data;
		},
		onSuccess: (data) => {
			queryClient.setQueryData(queryKeys.system.status(), data);
			queryClient.invalidateQueries({ queryKey: queryKeys.system.all });
		},
	});
}

export function useStopSystem() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (request?: StopRequest) => {
			const { data } = await post<SystemStatus>("/api/system/stop", request);
			return data;
		},
		onSuccess: (data) => {
			queryClient.setQueryData(queryKeys.system.status(), data);
			queryClient.invalidateQueries({ queryKey: queryKeys.system.all });
		},
	});
}

export function usePauseSystem() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async () => {
			const { data } = await post<SystemStatus>("/api/system/pause");
			return data;
		},
		onSuccess: (data) => {
			queryClient.setQueryData(queryKeys.system.status(), data);
			queryClient.invalidateQueries({ queryKey: queryKeys.system.all });
		},
	});
}

export function useChangeEnvironment() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (request: EnvironmentRequest) => {
			const { data } = await post<SystemStatus>("/api/system/environment", request);
			return data;
		},
		onSuccess: (data) => {
			queryClient.setQueryData(queryKeys.system.status(), data);
			queryClient.invalidateQueries({ queryKey: queryKeys.system.all });
		},
	});
}

export function useTriggerCycle() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (request: TriggerCycleRequest) => {
			const { data } = await post<TriggerCycleResponse>("/api/system/trigger-cycle", request);
			return data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.system.all });
		},
	});
}

interface CycleStatusResponse {
	cycleId: string;
	status: "queued" | "running" | "completed" | "failed";
	environment: string;
	startedAt: string;
	completedAt: string | null;
	error: string | null;
}

/**
 * Query cycle status by ID.
 * Used to check if a previously started cycle is still running after navigation.
 */
export function useCycleStatus(cycleId: string | null) {
	return useQuery({
		queryKey: [...queryKeys.system.all, "cycle", cycleId] as const,
		queryFn: async () => {
			if (!cycleId) {
				return null;
			}
			const { data } = await get<CycleStatusResponse>(`/api/system/cycle/${cycleId}`);
			return data;
		},
		enabled: !!cycleId,
		staleTime: 5000, // Refetch every 5 seconds while polling
		refetchInterval: (query) => {
			// Only poll if cycle is still running
			const data = query.state.data;
			if (data?.status === "queued" || data?.status === "running") {
				return 2000; // Poll every 2 seconds
			}
			return false;
		},
	});
}
