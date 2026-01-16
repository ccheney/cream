/**
 * Worker Services Query Hooks
 *
 * TanStack Query hooks for fetching and triggering worker services.
 *
 * @see docs/plans/ui/35-worker-services-page.md
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api/client";
import { CACHE_TIMES, STALE_TIMES } from "@/lib/api/query-client";

// ============================================
// Types
// ============================================

export type WorkerService =
	| "macro_watch"
	| "newspaper"
	| "filings_sync"
	| "short_interest"
	| "sentiment"
	| "corporate_actions"
	| "fundamentals";

export type RunStatus = "pending" | "running" | "completed" | "failed";

export interface LastRun {
	startedAt: string;
	completedAt: string | null;
	status: "completed" | "failed";
	result: string | null;
}

export interface ServiceStatus {
	name: WorkerService;
	displayName: string;
	status: "idle" | "running";
	lastRun: LastRun | null;
}

export interface WorkerStatusResponse {
	services: ServiceStatus[];
}

export interface WorkerRun {
	id: string;
	service: WorkerService;
	status: RunStatus;
	startedAt: string;
	completedAt: string | null;
	duration: number | null;
	result: string | null;
	error: string | null;
}

export interface WorkerRunsResponse {
	runs: WorkerRun[];
	total: number;
}

export interface WorkerRunsFilters {
	limit?: number;
	service?: WorkerService;
	status?: RunStatus;
}

export interface TriggerServicePayload {
	symbols?: string[];
	priority?: "normal" | "high";
}

export interface TriggerResponse {
	runId: string;
	status: "started" | "already_running";
	message: string;
}

// ============================================
// Query Keys
// ============================================

export const workerServicesKeys = {
	all: ["workerServices"] as const,
	status: () => [...workerServicesKeys.all, "status"] as const,
	runs: (filters?: WorkerRunsFilters) =>
		filters
			? ([...workerServicesKeys.all, "runs", filters] as const)
			: ([...workerServicesKeys.all, "runs"] as const),
	run: (id: string) => [...workerServicesKeys.all, "run", id] as const,
};

// ============================================
// Query Hooks
// ============================================

/**
 * Fetch status of all worker services.
 * Polls every 5 seconds for real-time updates.
 */
export function useWorkerServicesStatus() {
	return useQuery({
		queryKey: workerServicesKeys.status(),
		queryFn: async () => {
			const { data } = await get<WorkerStatusResponse>("/api/workers/status");
			return data;
		},
		staleTime: STALE_TIMES.DEFAULT,
		gcTime: CACHE_TIMES.DEFAULT,
		refetchInterval: 5000,
	});
}

/**
 * Fetch recent worker runs with optional filters.
 * Polls every 5 seconds for real-time updates.
 */
export function useWorkerRuns(filters?: WorkerRunsFilters) {
	const params = new URLSearchParams();
	if (filters?.limit) {
		params.set("limit", String(filters.limit));
	}
	if (filters?.service) {
		params.set("service", filters.service);
	}
	if (filters?.status) {
		params.set("status", filters.status);
	}

	const queryString = params.toString();
	const url = queryString ? `/api/workers/runs?${queryString}` : "/api/workers/runs";

	return useQuery({
		queryKey: workerServicesKeys.runs(filters),
		queryFn: async () => {
			const { data } = await get<WorkerRunsResponse>(url);
			return data;
		},
		staleTime: STALE_TIMES.DEFAULT,
		gcTime: CACHE_TIMES.DEFAULT,
		refetchInterval: 5000,
	});
}

/**
 * Fetch a single worker run by ID.
 */
export function useWorkerRun(id: string) {
	return useQuery({
		queryKey: workerServicesKeys.run(id),
		queryFn: async () => {
			const { data } = await get<{ run: WorkerRun }>(`/api/workers/runs/${id}`);
			return data.run;
		},
		staleTime: STALE_TIMES.DEFAULT,
		gcTime: CACHE_TIMES.DEFAULT,
		enabled: Boolean(id),
	});
}

/**
 * Trigger a worker service.
 */
export function useTriggerWorkerService() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			service,
			payload,
		}: {
			service: WorkerService;
			payload?: TriggerServicePayload;
		}) => {
			const { data } = await post<TriggerResponse>(
				`/api/workers/${service}/trigger`,
				payload ?? {}
			);
			return data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: workerServicesKeys.all });
		},
	});
}
