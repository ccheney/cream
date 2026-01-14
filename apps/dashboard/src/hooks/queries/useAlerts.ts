import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post, put } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";
import type { Alert, AlertSettings } from "@/lib/api/types";

export function useAlerts() {
	return useQuery({
		queryKey: queryKeys.alerts.all,
		queryFn: async () => {
			const { data } = await get<Alert[]>("/api/alerts");
			return data;
		},
		staleTime: STALE_TIMES.PORTFOLIO,
		gcTime: CACHE_TIMES.PORTFOLIO,
		refetchInterval: 10000,
	});
}

export function useUnacknowledgedAlertCount() {
	return useQuery({
		queryKey: [...queryKeys.alerts.all, "unacknowledged"] as const,
		queryFn: async () => {
			const { data } = await get<{ count: number }>("/api/alerts/unacknowledged/count");
			return data.count;
		},
		staleTime: STALE_TIMES.PORTFOLIO,
		gcTime: CACHE_TIMES.PORTFOLIO,
		refetchInterval: 10000,
	});
}

export function useAlertSettings() {
	return useQuery({
		queryKey: [...queryKeys.alerts.all, "settings"] as const,
		queryFn: async () => {
			const { data } = await get<AlertSettings>("/api/alerts/settings");
			return data;
		},
		staleTime: STALE_TIMES.CONFIG,
		gcTime: CACHE_TIMES.CONFIG,
	});
}

export function useAcknowledgeAlert() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (alertId: string) => {
			const { data } = await post<Alert>(`/api/alerts/${alertId}/acknowledge`);
			return data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
		},
	});
}

export function useAcknowledgeAllAlerts() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async () => {
			await post("/api/alerts/acknowledge-all");
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
		},
	});
}

export function useDismissAlert() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (alertId: string) => {
			await post(`/api/alerts/${alertId}/dismiss`);
			return alertId;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
		},
	});
}

export function useUpdateAlertSettings() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (settings: Partial<AlertSettings>) => {
			const { data } = await put<AlertSettings>("/api/alerts/settings", settings);
			return data;
		},
		onSuccess: (data) => {
			queryClient.setQueryData([...queryKeys.alerts.all, "settings"], data);
		},
	});
}
